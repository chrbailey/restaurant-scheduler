import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import {
  ghostKitchenApi,
  GhostKitchenSession,
  GhostKitchenOrder,
  GhostSessionStats,
  OrderStatus,
} from '../services/api';
import { useActiveProfile, useAuthStore } from '../stores/authStore';

/**
 * useGhostKitchen Hook
 *
 * Custom hook for managing ghost kitchen state with real-time updates.
 * Provides access to active orders, session stats, and order actions.
 */

const SOCKET_URL = Constants.expoConfig?.extra?.socketUrl || 'http://localhost:3000';

interface UseGhostKitchenReturn {
  // State
  isGhostModeActive: boolean;
  session: GhostKitchenSession | null;
  activeOrders: GhostKitchenOrder[];
  sessionStats: GhostSessionStats | null;
  isLoading: boolean;
  isPaused: boolean;

  // Actions
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  refreshOrders: () => void;
  refreshStats: () => void;
  setPaused: (isPaused: boolean, reason?: string) => Promise<void>;

  // Derived
  pendingOrderCount: number;
  preparingOrderCount: number;
  readyOrderCount: number;
}

export function useGhostKitchen(): UseGhostKitchenReturn {
  const activeProfile = useActiveProfile();
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const restaurantId = activeProfile?.restaurantId;
  const hasDeliveryPosition = activeProfile?.positions?.includes('DELIVERY_PACK') ?? false;

  // Check if ghost kitchen session is active
  const {
    data: sessionData,
    isLoading: sessionLoading,
  } = useQuery({
    queryKey: ['ghost-kitchen-session', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return null;
      const response = await ghostKitchenApi.getActiveSession(restaurantId);
      return response.data;
    },
    enabled: !!restaurantId && hasDeliveryPosition,
    refetchInterval: 30000, // Check every 30 seconds
  });

  const isGhostModeActive = sessionData?.isActive ?? false;

  // Fetch active orders (only when ghost mode is active)
  const {
    data: ordersData,
    isLoading: ordersLoading,
    refetch: refreshOrders,
  } = useQuery({
    queryKey: ['ghost-kitchen-orders', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const response = await ghostKitchenApi.getMyActiveOrders(restaurantId);
      return response.data;
    },
    enabled: !!restaurantId && isGhostModeActive && hasDeliveryPosition,
    refetchInterval: 15000, // Refresh every 15 seconds as backup
  });

  // Fetch session stats
  const {
    data: statsData,
    refetch: refreshStats,
  } = useQuery({
    queryKey: ['ghost-kitchen-stats', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return null;
      const response = await ghostKitchenApi.getSessionStats(restaurantId);
      return response.data;
    },
    enabled: !!restaurantId && isGhostModeActive && hasDeliveryPosition,
    refetchInterval: 30000,
  });

  // Update order status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      if (!restaurantId) throw new Error('No restaurant selected');
      return ghostKitchenApi.updateOrderStatus(restaurantId, orderId, status);
    },
    onSuccess: () => {
      // Invalidate orders to refresh the list
      queryClient.invalidateQueries({ queryKey: ['ghost-kitchen-orders', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['ghost-kitchen-stats', restaurantId] });
    },
  });

  // Pause status mutation
  const pauseMutation = useMutation({
    mutationFn: async ({ isPaused, reason }: { isPaused: boolean; reason?: string }) => {
      if (!restaurantId) throw new Error('No restaurant selected');
      return ghostKitchenApi.setPauseStatus(restaurantId, isPaused, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ghost-kitchen-session', restaurantId] });
    },
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!restaurantId || !isGhostModeActive || !accessToken) {
      return;
    }

    // Connect to socket
    const socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      query: { restaurantId },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Ghost kitchen socket connected');
      socket.emit('join:ghost-kitchen', { restaurantId });
    });

    // Listen for new orders
    socket.on('ghost-kitchen:new-order', (order: GhostKitchenOrder) => {
      queryClient.setQueryData<GhostKitchenOrder[]>(
        ['ghost-kitchen-orders', restaurantId],
        (old) => old ? [order, ...old] : [order]
      );
      refreshStats();
    });

    // Listen for order updates
    socket.on('ghost-kitchen:order-updated', (updatedOrder: GhostKitchenOrder) => {
      queryClient.setQueryData<GhostKitchenOrder[]>(
        ['ghost-kitchen-orders', restaurantId],
        (old) => old?.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)) ?? []
      );
      refreshStats();
    });

    // Listen for order removal (picked up or cancelled)
    socket.on('ghost-kitchen:order-removed', (orderId: string) => {
      queryClient.setQueryData<GhostKitchenOrder[]>(
        ['ghost-kitchen-orders', restaurantId],
        (old) => old?.filter((o) => o.id !== orderId) ?? []
      );
      refreshStats();
    });

    // Listen for session end
    socket.on('ghost-kitchen:session-ended', () => {
      queryClient.invalidateQueries({ queryKey: ['ghost-kitchen-session', restaurantId] });
    });

    socket.on('disconnect', () => {
      console.log('Ghost kitchen socket disconnected');
    });

    socket.on('error', (error: Error) => {
      console.error('Ghost kitchen socket error:', error);
    });

    return () => {
      socket.emit('leave:ghost-kitchen', { restaurantId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [restaurantId, isGhostModeActive, accessToken, queryClient, refreshStats]);

  // Action functions
  const updateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      await updateStatusMutation.mutateAsync({ orderId, status });
    },
    [updateStatusMutation]
  );

  const setPaused = useCallback(
    async (isPaused: boolean, reason?: string) => {
      await pauseMutation.mutateAsync({ isPaused, reason });
    },
    [pauseMutation]
  );

  // Derived counts
  const activeOrders = ordersData ?? [];
  const pendingOrderCount = activeOrders.filter((o) => o.status === 'PENDING').length;
  const preparingOrderCount = activeOrders.filter((o) => o.status === 'PREPARING').length;
  const readyOrderCount = activeOrders.filter((o) => o.status === 'READY').length;

  return {
    isGhostModeActive,
    session: sessionData ?? null,
    activeOrders,
    sessionStats: statsData ?? null,
    isLoading: sessionLoading || ordersLoading,
    isPaused: false, // TODO: Add to session data

    updateOrderStatus,
    refreshOrders,
    refreshStats,
    setPaused,

    pendingOrderCount,
    preparingOrderCount,
    readyOrderCount,
  };
}

/**
 * Hook to check if ghost kitchen tab should be visible
 * Returns true if worker has DELIVERY_PACK position AND restaurant has active ghost session
 */
export function useGhostKitchenTabVisible(): boolean {
  const activeProfile = useActiveProfile();
  const restaurantId = activeProfile?.restaurantId;
  const hasDeliveryPosition = activeProfile?.positions?.includes('DELIVERY_PACK') ?? false;

  const { data: sessionData } = useQuery({
    queryKey: ['ghost-kitchen-session', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return null;
      const response = await ghostKitchenApi.getActiveSession(restaurantId);
      return response.data;
    },
    enabled: !!restaurantId && hasDeliveryPosition,
    staleTime: 30000,
  });

  return hasDeliveryPosition && (sessionData?.isActive ?? false);
}
