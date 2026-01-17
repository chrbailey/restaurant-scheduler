import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { parseISO, differenceInMinutes } from 'date-fns';

import GhostOrderCard from '../../src/components/GhostOrderCard';
import { useGhostKitchen } from '../../src/hooks/useGhostKitchen';
import { OrderStatus } from '../../src/services/api';

/**
 * Ghost Kitchen Tab
 *
 * Shows active ghost kitchen orders when restaurant is in ghost mode.
 * Only visible to workers with DELIVERY_PACK position.
 * Features:
 * - Header showing "Ghost Kitchen Active" with live order count
 * - Timer showing session duration
 * - Order queue with status indicators
 * - Stats bar: Orders completed, avg prep time, current queue
 * - Pause button for breaks
 */

export default function GhostKitchenScreen() {
  const router = useRouter();
  const {
    isGhostModeActive,
    session,
    activeOrders,
    sessionStats,
    isLoading,
    isPaused,
    updateOrderStatus,
    refreshOrders,
    refreshStats,
    setPaused,
    pendingOrderCount,
    preparingOrderCount,
    readyOrderCount,
  } = useGhostKitchen();

  const [sessionTimer, setSessionTimer] = useState('00:00:00');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Session timer
  useEffect(() => {
    if (!session?.startedAt) return;

    const updateTimer = () => {
      const startedAt = parseISO(session.startedAt);
      const now = new Date();
      const totalMinutes = differenceInMinutes(now, startedAt);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const seconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000) % 60;

      setSessionTimer(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [session?.startedAt]);

  // Handle order status update
  const handleStatusUpdate = useCallback(
    async (orderId: string, status: OrderStatus) => {
      setUpdatingOrderId(orderId);
      try {
        await updateOrderStatus(orderId, status);
      } catch (error: any) {
        Alert.alert(
          'Error',
          error.response?.data?.message || 'Failed to update order status'
        );
      } finally {
        setUpdatingOrderId(null);
      }
    },
    [updateOrderStatus]
  );

  // Handle pause toggle
  const handlePauseToggle = useCallback(async () => {
    if (isPaused) {
      try {
        await setPaused(false);
        Alert.alert('Resumed', 'You will now receive new orders.');
      } catch (error) {
        Alert.alert('Error', 'Failed to resume. Please try again.');
      }
    } else {
      Alert.alert(
        'Take a Break?',
        'You will stop receiving new orders while paused. Existing orders must still be completed.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Pause',
            onPress: async () => {
              try {
                await setPaused(true, 'Worker requested break');
              } catch (error) {
                Alert.alert('Error', 'Failed to pause. Please try again.');
              }
            },
          },
        ]
      );
    }
  }, [isPaused, setPaused]);

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refreshOrders(), refreshStats()]);
    setIsRefreshing(false);
  }, [refreshOrders, refreshStats]);

  // If ghost mode is not active, show inactive state
  if (!isGhostModeActive) {
    return (
      <View style={styles.inactiveContainer}>
        <MaterialCommunityIcons name="ghost-off" size={80} color="#666" />
        <Text style={styles.inactiveTitle}>Ghost Kitchen Not Active</Text>
        <Text style={styles.inactiveSubtitle}>
          The restaurant is not currently in ghost kitchen mode.
          Check back later or ask your manager.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#4a90d9" size="large" />
        <Text style={styles.loadingText}>Loading orders...</Text>
      </View>
    );
  }

  // Separate orders by status for display
  const pendingOrders = activeOrders.filter(
    (o) => o.status === 'PENDING' || o.status === 'ACCEPTED'
  );
  const preparingOrders = activeOrders.filter((o) => o.status === 'PREPARING');
  const readyOrders = activeOrders.filter((o) => o.status === 'READY');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.activeIndicator}>
            <View style={styles.pulsingDot} />
            <Text style={styles.headerTitle}>Ghost Kitchen Active</Text>
          </View>

          <View style={styles.orderCountBadge}>
            <Text style={styles.orderCountText}>{activeOrders.length}</Text>
            <Text style={styles.orderCountLabel}>orders</Text>
          </View>
        </View>

        {/* Session timer */}
        <View style={styles.timerRow}>
          <Ionicons name="time-outline" size={16} color="#888" />
          <Text style={styles.timerText}>Session: {sessionTimer}</Text>
        </View>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{sessionStats?.ordersCompleted ?? 0}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {sessionStats?.avgPrepTime ? `${Math.round(sessionStats.avgPrepTime)}m` : '--'}
          </Text>
          <Text style={styles.statLabel}>Avg Prep</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#4a90d9' }]}>
            {sessionStats?.ordersInQueue ?? 0}
          </Text>
          <Text style={styles.statLabel}>In Queue</Text>
        </View>
      </View>

      {/* Pause button */}
      <TouchableOpacity
        style={[styles.pauseButton, isPaused && styles.pauseButtonActive]}
        onPress={handlePauseToggle}
      >
        <Ionicons
          name={isPaused ? 'play' : 'pause'}
          size={18}
          color={isPaused ? '#22c55e' : '#f59e0b'}
        />
        <Text
          style={[styles.pauseButtonText, isPaused && styles.pauseButtonTextActive]}
        >
          {isPaused ? 'Resume Orders' : 'Pause for Break'}
        </Text>
      </TouchableOpacity>

      {/* Order queue */}
      <ScrollView
        style={styles.orderList}
        contentContainerStyle={styles.orderListContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#4a90d9"
          />
        }
      >
        {activeOrders.length === 0 ? (
          <View style={styles.emptyQueue}>
            <MaterialCommunityIcons name="package-variant" size={48} color="#666" />
            <Text style={styles.emptyQueueTitle}>No Active Orders</Text>
            <Text style={styles.emptyQueueSubtitle}>
              New orders will appear here automatically
            </Text>
          </View>
        ) : (
          <>
            {/* Pending/New Orders */}
            {pendingOrders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: '#f59e0b' }]} />
                  <Text style={styles.sectionTitle}>
                    New Orders ({pendingOrders.length})
                  </Text>
                </View>
                {pendingOrders.map((order) => (
                  <GhostOrderCard
                    key={order.id}
                    order={order}
                    onStatusUpdate={(status) => handleStatusUpdate(order.id, status)}
                    isUpdating={updatingOrderId === order.id}
                  />
                ))}
              </View>
            )}

            {/* Preparing Orders */}
            {preparingOrders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: '#4a90d9' }]} />
                  <Text style={styles.sectionTitle}>
                    Preparing ({preparingOrders.length})
                  </Text>
                </View>
                {preparingOrders.map((order) => (
                  <GhostOrderCard
                    key={order.id}
                    order={order}
                    onStatusUpdate={(status) => handleStatusUpdate(order.id, status)}
                    isUpdating={updatingOrderId === order.id}
                  />
                ))}
              </View>
            )}

            {/* Ready Orders */}
            {readyOrders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: '#22c55e' }]} />
                  <Text style={styles.sectionTitle}>
                    Ready for Pickup ({readyOrders.length})
                  </Text>
                </View>
                {readyOrders.map((order) => (
                  <GhostOrderCard
                    key={order.id}
                    order={order}
                    onStatusUpdate={(status) => handleStatusUpdate(order.id, status)}
                    isUpdating={updatingOrderId === order.id}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f0f23',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 12,
  },
  inactiveContainer: {
    flex: 1,
    backgroundColor: '#0f0f23',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  inactiveTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 8,
  },
  inactiveSubtitle: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  header: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pulsingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    // Note: Actual pulsing animation would need Animated API
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  orderCountBadge: {
    backgroundColor: '#4a90d9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  orderCountText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  orderCountLabel: {
    color: '#fff',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerText: {
    color: '#888',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#2a2a4e',
  },
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f59e0b15',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f59e0b40',
  },
  pauseButtonActive: {
    backgroundColor: '#22c55e15',
    borderColor: '#22c55e40',
  },
  pauseButtonText: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
  },
  pauseButtonTextActive: {
    color: '#22c55e',
  },
  orderList: {
    flex: 1,
    marginTop: 16,
  },
  orderListContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  emptyQueue: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyQueueTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyQueueSubtitle: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
