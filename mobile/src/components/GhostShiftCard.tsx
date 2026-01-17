import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { GhostShift } from '../services/api';

/**
 * GhostShiftCard Component
 *
 * Displays a ghost kitchen delivery shift with distinct styling.
 * Shows delivery icon, ghost kitchen label, expected order volume,
 * and has higher visual priority when ghost mode is active.
 */

interface GhostShiftCardProps {
  shift: GhostShift;
  onClaim: () => void;
  isClaiming?: boolean;
  isHighPriority?: boolean; // When ghost mode is active, show with higher priority
}

// Volume indicators
const volumeConfig: Record<string, { label: string; color: string; icon: string }> = {
  LOW: { label: 'Low Volume', color: '#22c55e', icon: 'trending-down' },
  MEDIUM: { label: 'Medium', color: '#f59e0b', icon: 'remove' },
  HIGH: { label: 'High Volume', color: '#f97316', icon: 'trending-up' },
  SURGE: { label: 'Surge!', color: '#ef4444', icon: 'flash' },
};

export default function GhostShiftCard({
  shift,
  onClaim,
  isClaiming = false,
  isHighPriority = false,
}: GhostShiftCardProps) {
  const startTime = parseISO(shift.startTime);
  const endTime = parseISO(shift.endTime);
  const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

  const volumeInfo = shift.expectedOrderVolume
    ? volumeConfig[shift.expectedOrderVolume]
    : null;

  return (
    <View style={[styles.card, isHighPriority && styles.cardHighPriority]}>
      {/* Ghost Kitchen badge - prominent at top */}
      <View style={styles.badgeRow}>
        <View style={styles.ghostBadge}>
          <MaterialCommunityIcons name="ghost" size={14} color="#fff" />
          <Text style={styles.ghostBadgeText}>Ghost Kitchen</Text>
        </View>

        {isHighPriority && (
          <View style={styles.priorityBadge}>
            <Ionicons name="flash" size={12} color="#f59e0b" />
            <Text style={styles.priorityBadgeText}>Active Now</Text>
          </View>
        )}
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Left side: Delivery icon */}
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons
            name="moped-electric"
            size={32}
            color="#4a90d9"
          />
        </View>

        {/* Center: Shift details */}
        <View style={styles.details}>
          <Text style={styles.position}>Delivery Packer</Text>
          <Text style={styles.restaurant}>{shift.restaurant.name}</Text>

          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={14} color="#888" />
            <Text style={styles.timeText}>
              {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
            </Text>
          </View>

          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={14} color="#888" />
            <Text style={styles.dateText}>{format(startTime, 'EEE, MMM d')}</Text>
            <Text style={styles.durationText}>{duration.toFixed(1)}h</Text>
          </View>
        </View>
      </View>

      {/* Volume indicator and pay rate row */}
      <View style={styles.infoRow}>
        {volumeInfo && (
          <View style={[styles.volumeIndicator, { backgroundColor: `${volumeInfo.color}20` }]}>
            <Ionicons name={volumeInfo.icon as any} size={14} color={volumeInfo.color} />
            <Text style={[styles.volumeText, { color: volumeInfo.color }]}>
              {volumeInfo.label}
            </Text>
          </View>
        )}

        {shift.hourlyRateOverride && (
          <View style={styles.rateContainer}>
            <Ionicons name="cash-outline" size={14} color="#22c55e" />
            <Text style={styles.rateText}>${shift.hourlyRateOverride}/hr</Text>
          </View>
        )}
      </View>

      {/* Claim button */}
      <TouchableOpacity
        style={[styles.claimButton, isHighPriority && styles.claimButtonHighPriority]}
        onPress={onClaim}
        disabled={isClaiming}
      >
        {isClaiming ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={styles.claimButtonText}>Claim Shift</Text>
          </>
        )}
      </TouchableOpacity>

      {/* High priority glow effect */}
      {isHighPriority && <View style={styles.glowEffect} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#9333ea', // Purple for ghost kitchen
    position: 'relative',
    overflow: 'hidden',
  },
  cardHighPriority: {
    borderLeftColor: '#f59e0b',
    borderWidth: 1,
    borderColor: '#f59e0b40',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ghostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#9333ea',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ghostBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f59e0b20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityBadgeText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  content: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  iconContainer: {
    width: 56,
    height: 56,
    backgroundColor: '#4a90d920',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  details: {
    flex: 1,
  },
  position: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  restaurant: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  timeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    color: '#888',
    fontSize: 13,
  },
  durationText: {
    color: '#666',
    fontSize: 12,
    marginLeft: 'auto',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  volumeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  volumeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22c55e15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  rateText: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '600',
  },
  claimButton: {
    backgroundColor: '#4a90d9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  claimButtonHighPriority: {
    backgroundColor: '#f59e0b',
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  glowEffect: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 100,
    height: 100,
    backgroundColor: '#f59e0b10',
    borderRadius: 50,
  },
});
