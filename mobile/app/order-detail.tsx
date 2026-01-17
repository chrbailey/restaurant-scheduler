import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO, differenceInMinutes } from 'date-fns';

import { ghostKitchenApi, GhostKitchenOrder, OrderStatus, DeliveryPlatform } from '../src/services/api';
import { useActiveProfile } from '../src/stores/authStore';

/**
 * Order Detail Screen
 *
 * Full order details for ghost kitchen orders.
 * Shows:
 * - All items with modifiers
 * - Special instructions prominently
 * - Driver info when assigned
 * - Status timeline
 * - Update status buttons
 * - Issue reporting option
 */

// Platform configuration
const platformConfig: Record<DeliveryPlatform, { icon: string; color: string; name: string }> = {
  DOORDASH: { icon: 'food', color: '#FF3008', name: 'DoorDash' },
  UBEREATS: { icon: 'food-fork-drink', color: '#06C167', name: 'Uber Eats' },
  GRUBHUB: { icon: 'food-takeout-box', color: '#F63440', name: 'Grubhub' },
  INTERNAL: { icon: 'storefront', color: '#4a90d9', name: 'Internal' },
};

// Status configuration
const statusConfig: Record<OrderStatus, { label: string; color: string; icon: string }> = {
  PENDING: { label: 'Pending', color: '#f59e0b', icon: 'hourglass' },
  ACCEPTED: { label: 'Accepted', color: '#f59e0b', icon: 'checkmark-circle' },
  PREPARING: { label: 'Preparing', color: '#4a90d9', icon: 'flame' },
  READY: { label: 'Ready', color: '#22c55e', icon: 'checkmark-done' },
  PICKED_UP: { label: 'Picked Up', color: '#666', icon: 'car' },
  CANCELLED: { label: 'Cancelled', color: '#ef4444', icon: 'close-circle' },
};

export default function OrderDetailScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const activeProfile = useActiveProfile();
  const queryClient = useQueryClient();
  const restaurantId = activeProfile?.restaurantId;

  const [elapsedTime, setElapsedTime] = useState('0:00');

  // Fetch order details
  const {
    data: order,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['ghost-order', restaurantId, orderId],
    queryFn: async () => {
      if (!restaurantId || !orderId) return null;
      const response = await ghostKitchenApi.getOrder(restaurantId, orderId);
      return response.data;
    },
    enabled: !!restaurantId && !!orderId,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (status: OrderStatus) => {
      if (!restaurantId || !orderId) throw new Error('Missing data');
      return ghostKitchenApi.updateOrderStatus(restaurantId, orderId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ghost-order', restaurantId, orderId] });
      queryClient.invalidateQueries({ queryKey: ['ghost-kitchen-orders', restaurantId] });
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update status');
    },
  });

  // Report issue mutation
  const reportIssueMutation = useMutation({
    mutationFn: async (issue: { type: string; description: string }) => {
      if (!restaurantId || !orderId) throw new Error('Missing data');
      return ghostKitchenApi.reportIssue(restaurantId, orderId, issue as any);
    },
    onSuccess: () => {
      Alert.alert('Issue Reported', 'A manager will be notified about this issue.');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.message || 'Failed to report issue');
    },
  });

  // Elapsed time timer
  useEffect(() => {
    if (!order?.receivedAt) return;

    const updateTimer = () => {
      const receivedAt = parseISO(order.receivedAt);
      const now = new Date();
      const totalMinutes = differenceInMinutes(now, receivedAt);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      if (hours > 0) {
        setElapsedTime(`${hours}h ${minutes}m`);
      } else {
        setElapsedTime(`${minutes}m`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [order?.receivedAt]);

  // Handle status update
  const handleStatusUpdate = useCallback((status: OrderStatus) => {
    Alert.alert(
      'Update Status',
      `Mark this order as "${statusConfig[status].label}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: () => updateStatusMutation.mutate(status),
        },
      ]
    );
  }, [updateStatusMutation]);

  // Handle issue report
  const handleReportIssue = useCallback(() => {
    Alert.alert(
      'Report Issue',
      'What type of issue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Missing Item',
          onPress: () => reportIssueMutation.mutate({
            type: 'MISSING_ITEM',
            description: 'Item missing from order',
          }),
        },
        {
          text: 'Wrong Item',
          onPress: () => reportIssueMutation.mutate({
            type: 'WRONG_ITEM',
            description: 'Wrong item received',
          }),
        },
        {
          text: 'Quality Issue',
          onPress: () => reportIssueMutation.mutate({
            type: 'QUALITY_ISSUE',
            description: 'Quality concern with order',
          }),
        },
        {
          text: 'Other',
          onPress: () => reportIssueMutation.mutate({
            type: 'OTHER',
            description: 'Other issue - please follow up',
          }),
        },
      ]
    );
  }, [reportIssueMutation]);

  // Get available actions based on current status
  const getAvailableActions = (currentStatus: OrderStatus): OrderStatus[] => {
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      PENDING: ['ACCEPTED'],
      ACCEPTED: ['PREPARING'],
      PREPARING: ['READY'],
      READY: [],
      PICKED_UP: [],
      CANCELLED: [],
    };
    return transitions[currentStatus] || [];
  };

  if (isLoading || !order) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Order Details' }} />
        <ActivityIndicator color="#4a90d9" size="large" />
      </View>
    );
  }

  const platform = platformConfig[order.platform];
  const status = statusConfig[order.status];
  const availableActions = getAvailableActions(order.status);

  // Build timeline items
  const timelineItems = [
    { status: 'PENDING', time: order.receivedAt, label: 'Received' },
    order.acceptedAt && { status: 'ACCEPTED', time: order.acceptedAt, label: 'Accepted' },
    order.prepStartedAt && { status: 'PREPARING', time: order.prepStartedAt, label: 'Started Prep' },
    order.readyAt && { status: 'READY', time: order.readyAt, label: 'Ready' },
    order.pickedUpAt && { status: 'PICKED_UP', time: order.pickedUpAt, label: 'Picked Up' },
  ].filter(Boolean) as Array<{ status: string; time: string; label: string }>;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `Order #${order.orderNumber}`,
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            {/* Platform badge */}
            <View style={[styles.platformBadge, { backgroundColor: platform.color }]}>
              <MaterialCommunityIcons name={platform.icon as any} size={20} color="#fff" />
              <Text style={styles.platformName}>{platform.name}</Text>
            </View>

            {/* Elapsed time */}
            <View style={styles.elapsedContainer}>
              <Ionicons name="time-outline" size={14} color="#888" />
              <Text style={styles.elapsedText}>{elapsedTime} ago</Text>
            </View>
          </View>

          {/* Order number and customer */}
          <Text style={styles.orderNumber}>Order #{order.orderNumber}</Text>
          <Text style={styles.customerName}>Customer: {order.customerFirstName}</Text>

          {/* Current status */}
          <View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
            <Ionicons name={status.icon as any} size={16} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {/* Special instructions - prominent */}
        {order.specialInstructions && (
          <View style={styles.specialInstructionsCard}>
            <View style={styles.specialHeader}>
              <Ionicons name="alert-circle" size={20} color="#f59e0b" />
              <Text style={styles.specialTitle}>Special Instructions</Text>
            </View>
            <Text style={styles.specialText}>{order.specialInstructions}</Text>
          </View>
        )}

        {/* Items list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items ({order.items.length})</Text>
          {order.items.map((item, index) => (
            <View key={item.id || index} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemQuantity}>{item.quantity}x</Text>
                <Text style={styles.itemName}>{item.name}</Text>
              </View>

              {item.modifiers && item.modifiers.length > 0 && (
                <View style={styles.modifiersContainer}>
                  {item.modifiers.map((mod, modIndex) => (
                    <Text key={modIndex} style={styles.modifierText}>
                      - {mod}
                    </Text>
                  ))}
                </View>
              )}

              {item.specialInstructions && (
                <View style={styles.itemInstructions}>
                  <Ionicons name="information-circle" size={14} color="#f59e0b" />
                  <Text style={styles.itemInstructionsText}>
                    {item.specialInstructions}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Driver info */}
        {order.driver && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Driver</Text>
            <View style={styles.driverCard}>
              <View style={styles.driverIcon}>
                <Ionicons name="car" size={24} color="#4a90d9" />
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{order.driver.name}</Text>
                {order.driver.vehicle && (
                  <Text style={styles.driverVehicle}>{order.driver.vehicle}</Text>
                )}
                {order.driver.eta && (
                  <Text style={styles.driverEta}>
                    ETA: {format(parseISO(order.driver.eta), 'h:mm a')}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Status timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <View style={styles.timeline}>
            {timelineItems.map((item, index) => (
              <View key={index} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View
                    style={[
                      styles.timelineDot,
                      { backgroundColor: statusConfig[item.status as OrderStatus]?.color || '#666' },
                    ]}
                  />
                  {index < timelineItems.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineLabel}>{item.label}</Text>
                  <Text style={styles.timelineTime}>
                    {format(parseISO(item.time), 'h:mm a')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Action buttons */}
        {availableActions.length > 0 && (
          <View style={styles.actionsSection}>
            {availableActions.map((action) => (
              <TouchableOpacity
                key={action}
                style={[
                  styles.actionButton,
                  { backgroundColor: statusConfig[action].color },
                ]}
                onPress={() => handleStatusUpdate(action)}
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={statusConfig[action].icon as any}
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.actionButtonText}>
                      {action === 'ACCEPTED' && 'Accept Order'}
                      {action === 'PREPARING' && 'Start Preparing'}
                      {action === 'READY' && 'Mark as Ready'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Report issue button */}
        <TouchableOpacity
          style={styles.reportIssueButton}
          onPress={handleReportIssue}
          disabled={reportIssueMutation.isPending}
        >
          <Ionicons name="flag-outline" size={18} color="#ef4444" />
          <Text style={styles.reportIssueText}>Report an Issue</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
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
  content: {
    flex: 1,
    padding: 16,
  },
  headerCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  platformName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  elapsedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  elapsedText: {
    color: '#888',
    fontSize: 13,
  },
  orderNumber: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  customerName: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  specialInstructionsCard: {
    backgroundColor: '#f59e0b20',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  specialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  specialTitle: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: '600',
  },
  specialText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  itemCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemQuantity: {
    color: '#4a90d9',
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemName: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  modifiersContainer: {
    marginTop: 8,
    paddingLeft: 32,
  },
  modifierText: {
    color: '#888',
    fontSize: 13,
    marginBottom: 2,
  },
  itemInstructions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#f59e0b15',
    padding: 10,
    borderRadius: 8,
  },
  itemInstructionsText: {
    color: '#f59e0b',
    fontSize: 13,
    flex: 1,
  },
  driverCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  driverIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4a90d920',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInfo: {},
  driverName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  driverVehicle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  driverEta: {
    color: '#4a90d9',
    fontSize: 13,
    marginTop: 2,
  },
  timeline: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineLeft: {
    alignItems: 'center',
    marginRight: 14,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#2a2a4e',
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 16,
  },
  timelineLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  timelineTime: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  actionsSection: {
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reportIssueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef444440',
    backgroundColor: '#ef444410',
  },
  reportIssueText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
});
