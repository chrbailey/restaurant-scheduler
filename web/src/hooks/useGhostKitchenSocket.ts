import { useState, useEffect, useCallback, useRef } from "react";
import type { Order } from "../components/ghost-kitchen/LiveOrderFeed";

interface GhostKitchenSocketState {
  orders: Order[];
  currentCapacity: number;
  isConnected: boolean;
  sessionDuration: number;
  error: string | null;
}

interface GhostKitchenSocketActions {
  reconnect: () => void;
  disconnect: () => void;
}

type GhostKitchenSocketReturn = GhostKitchenSocketState & GhostKitchenSocketActions;

// WebSocket event types
interface OrderNewEvent {
  type: "order:new";
  order: Order;
}

interface OrderStatusEvent {
  type: "order:status";
  orderId: string;
  status: Order["status"];
  timestamp: string;
}

interface CapacityUpdateEvent {
  type: "capacity:update";
  current: number;
  max: number;
}

interface SessionUpdateEvent {
  type: "session:update";
  duration: number;
  isActive: boolean;
}

interface ConnectionEvent {
  type: "connection:status";
  connected: boolean;
}

type SocketEvent =
  | OrderNewEvent
  | OrderStatusEvent
  | CapacityUpdateEvent
  | SessionUpdateEvent
  | ConnectionEvent;

export const useGhostKitchenSocket = (restaurantId: string): GhostKitchenSocketReturn => {
  const [state, setState] = useState<GhostKitchenSocketState>({
    orders: [],
    currentCapacity: 0,
    isConnected: false,
    sessionDuration: 0,
    error: null,
  });

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef(false);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  // Get WebSocket URL from environment or default
  const getWebSocketUrl = useCallback(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const apiUrl = import.meta.env.VITE_API_URL || window.location.host;
    const baseUrl = apiUrl.replace(/^https?:\/\//, "");
    return `${wsProtocol}//${baseUrl}/ghost-kitchen/${restaurantId}/ws`;
  }, [restaurantId]);

  const connect = useCallback(() => {
    if (!restaurantId || isUnmountedRef.current) return;

    // Clean up existing connection
    if (socketRef.current) {
      socketRef.current.close();
    }

    try {
      const wsUrl = getWebSocketUrl();
      console.log("[GhostKitchenSocket] Connecting to:", wsUrl);

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("[GhostKitchenSocket] Connected");
        reconnectAttemptsRef.current = 0;
        setState((prev) => ({
          ...prev,
          isConnected: true,
          error: null,
        }));

        // Start session timer
        if (sessionTimerRef.current) {
          clearInterval(sessionTimerRef.current);
        }
        sessionTimerRef.current = setInterval(() => {
          setState((prev) => ({
            ...prev,
            sessionDuration: prev.sessionDuration + 1,
          }));
        }, 1000);
      };

      socket.onmessage = (event) => {
        try {
          const data: SocketEvent = JSON.parse(event.data);
          console.log("[GhostKitchenSocket] Received:", data.type);

          switch (data.type) {
            case "order:new":
              setState((prev) => ({
                ...prev,
                orders: [data.order, ...prev.orders],
                currentCapacity: prev.currentCapacity + 1,
              }));
              // Play notification sound for new orders
              playNotificationSound();
              break;

            case "order:status":
              setState((prev) => ({
                ...prev,
                orders: prev.orders.map((order) =>
                  order.id === data.orderId
                    ? { ...order, status: data.status }
                    : order
                ),
                // Decrease capacity when order is completed or cancelled
                currentCapacity:
                  data.status === "PICKED_UP" || data.status === "CANCELLED"
                    ? Math.max(0, prev.currentCapacity - 1)
                    : prev.currentCapacity,
              }));
              break;

            case "capacity:update":
              setState((prev) => ({
                ...prev,
                currentCapacity: data.current,
              }));
              break;

            case "session:update":
              setState((prev) => ({
                ...prev,
                sessionDuration: data.duration,
              }));
              if (!data.isActive) {
                // Session ended, clear orders
                setState((prev) => ({
                  ...prev,
                  orders: [],
                  currentCapacity: 0,
                }));
              }
              break;

            case "connection:status":
              setState((prev) => ({
                ...prev,
                isConnected: data.connected,
              }));
              break;
          }
        } catch (error) {
          console.error("[GhostKitchenSocket] Error parsing message:", error);
        }
      };

      socket.onerror = (error) => {
        console.error("[GhostKitchenSocket] Error:", error);
        setState((prev) => ({
          ...prev,
          error: "Connection error",
        }));
      };

      socket.onclose = (event) => {
        console.log("[GhostKitchenSocket] Disconnected:", event.code, event.reason);
        setState((prev) => ({
          ...prev,
          isConnected: false,
        }));

        // Stop session timer
        if (sessionTimerRef.current) {
          clearInterval(sessionTimerRef.current);
          sessionTimerRef.current = null;
        }

        // Attempt reconnection if not intentionally closed
        if (
          !isUnmountedRef.current &&
          event.code !== 1000 &&
          reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
        ) {
          const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
          console.log(
            `[GhostKitchenSocket] Reconnecting in ${delay}ms (attempt ${
              reconnectAttemptsRef.current + 1
            })`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setState((prev) => ({
            ...prev,
            error: "Connection lost. Please refresh the page.",
          }));
        }
      };
    } catch (error) {
      console.error("[GhostKitchenSocket] Failed to create connection:", error);
      setState((prev) => ({
        ...prev,
        error: "Failed to connect",
        isConnected: false,
      }));
    }
  }, [restaurantId, getWebSocketUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close(1000, "User disconnected");
      socketRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isConnected: false,
    }));
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    disconnect();
    connect();
  }, [connect, disconnect]);

  // Initial connection
  useEffect(() => {
    isUnmountedRef.current = false;

    if (restaurantId) {
      connect();
    }

    return () => {
      isUnmountedRef.current = true;
      disconnect();
    };
  }, [restaurantId, connect, disconnect]);

  return {
    ...state,
    reconnect,
    disconnect,
  };
};

// Helper to play notification sound for new orders
const playNotificationSound = () => {
  try {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gainNode.gain.value = 0.3;

    oscillator.start();
    setTimeout(() => {
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
      oscillator.stop(audioContext.currentTime + 0.1);
    }, 100);
  } catch (error) {
    // Audio not available, silently fail
    console.log("[GhostKitchenSocket] Could not play notification sound");
  }
};
