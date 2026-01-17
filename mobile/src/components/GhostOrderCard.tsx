import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { differenceInMinutes, differenceInSeconds, parseISO } from 'date-fns';
import {
  GhostKitchenOrder,
  OrderStatus,
  DeliveryPlatform,
} from '../services/api';

/**
 * GhostOrderCard Component
 *
 * Displays a delivery order in the ghost kitchen queue.
 * Shows platform icon, order info, items, special instructions, and status controls.
 * Color-coded by status: yellow (pending/new), blue (preparing), green (ready).
 */

interface GhostOrderCardProps {
  order: GhostKitchenOrder;
  onStatusUpdate: (status: OrderStatus) => Promise<void>;
  isUpdating?: boolean;
}

// Platform icons and colors
const platformConfig: Record<DeliveryPlatform, { icon: string; color: string; name: string }> = {
  DOORDASH: { icon: 'food', color: '#FF3008', name: 'DoorDash' },
  UBEREATS: { icon: 'food-fork-drink', color: '#06C167', name: 'Uber Eats' },
  GRUBHUB: { icon: 'food-takeout-box', color: '#F63440', name: 'Grubhub' },
  INTERNAL: { icon: 'storefront', color: '#4a90d9', name: 'Internal' },
};

// Status colors
const statusColors: Record<OrderStatus, string> = {
  PENDING: '#f59e0b',    // Yellow/amber
  ACCEPTED: '#f59e0b',   // Yellow/amber
  PREPARING: '#4a90d9',  // Blue
  READY: '#22c55e',      // Green
  PICKED_UP: '#666',     // Gray
  CANCELLED: '#ef4444',  // Red
};

export default function GhostOrderCard({
  order,
  onStatusUpdate,
  isUpdating = false,
}: GhostOrderCardProps) {
  const router = useRouter();
  const [elapsedTime, setElapsedTime] = useState('0:00');

  const platform = platformConfig[order.platform];
  const statusColor = statusColors[order.status];

  // Calculate elapsed time since order received
  useEffect(() => {
    const updateTimer = () => {
      const receivedAt = parseISO(order.receivedAt);
      const now = new Date();
      const totalSeconds = differenceInSeconds(now, receivedAt);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setElapsedTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order.receivedAt]);

  // Determine next status based on current
  const getNextStatus = (): OrderStatus | null => {
    switch (order.status) {
      case 'PENDING':
        return 'ACCEPTED';
      case 'ACCEPTED':
        return 'PREPARING';
      case 'PREPARING':
        return 'READY';
      default:
        return null;
    }
  };

  const getActionButton = () => {
    const nextStatus = getNextStatus();
    if (!nextStatus) return null;

    const buttonConfig: Record<string, { label: string; icon: string }> = {
      ACCEPTED: { label: 'Accept', icon: 'checkmark-circle' },
      PREPARING: { label: 'Start Prep', icon: 'flame' },
      READY: { label: 'Mark Ready', icon: 'checkmark-done' },
    };

    const config = buttonConfig[nextStatus];
    if (!config) return null;

    return (
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: statusColors[nextStatus] }]}
        onPress={() => onStatusUpdate(nextStatus)}
        disabled={isUpdating}
      >
        {isUpdating ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name={config.icon as any} size={16} color="#fff" />
            <Text style={styles.actionButtonText}>{config.label}</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  const handlePress = () => {
    router.push({
      pathname: '/order-detail',
      params: { orderId: order.id },
    });
  };

  // Check if order has special instructions
  const hasSpecialInstructions = order.specialInstructions ||
    order.items.some((item) => item.specialInstructions);

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: statusColor }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Header row: Platform icon, order number, timer */}
      <View style={styles.header}>
        <View style={styles.platformContainer}>
          <View style={[styles.platformIcon, { backgroundColor: platform.color }]}>
            <MaterialCommunityIcons name={platform.icon as any} size={18} color="#fff" />
          </View>
          <View>
            <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
            <Text style={styles.platformName}>{platform.name}</Text>
          </View>
        </View>

        <View style={styles.timerContainer}>
          <Ionicons name="time-outline" size={14} color={statusColor} />
          <Text style={[styles.timerText, { color: statusColor }]}>{elapsedTime}</Text>
        </View>
      </View>

      {/* Customer name */}
      <Text style={styles.customerName}>{order.customerFirstName}</Text>

      {/* Items list */}
      <View style={styles.itemsList}>
        {order.items.slice(0, 3).map((item, index) => (
          <View key={item.id || index} style={styles.itemRow}>
            <Text style={styles.itemQuantity}>{item.quantity}x</Text>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.modifiers && item.modifiers.length > 0 && (
              <Text style={styles.modifierCount}>+{item.modifiers.length}</Text>
            )}
          </View>
        ))}
        {order.items.length > 3 && (
          <Text style={styles.moreItems}>
            +{order.items.length - 3} more items
          </Text>
        )}
      </View>

      {/* Special instructions alert */}
      {hasSpecialInstructions && (
        <View style={styles.specialInstructions}>
          <Ionicons name="alert-circle" size={14} color="#f59e0b" />
          <Text style={styles.specialInstructionsText} numberOfLines={2}>
            {order.specialInstructions || 'Item modifications - tap to view'}
          </Text>
        </View>
      )}

      {/* Status badge and action button */}
      <View style={styles.footer}>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {order.status.replace('_', ' ')}
          </Text>
        </View>

        {getActionButton()}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  platformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  platformIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderNumber: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  platformName: {
    color: '#888',
    fontSize: 12,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f0f23',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  customerName: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 12,
  },
  itemsList: {
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemQuantity: {
    color: '#4a90d9',
    fontSize: 13,
    fontWeight: '600',
    width: 28,
  },
  itemName: {
    color: '#ccc',
    fontSize: 13,
    flex: 1,
  },
  modifierCount: {
    color: '#888',
    fontSize: 11,
    backgroundColor: '#2a2a4e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  moreItems: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  specialInstructions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f59e0b15',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  specialInstructionsText: {
    color: '#f59e0b',
    fontSize: 12,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
