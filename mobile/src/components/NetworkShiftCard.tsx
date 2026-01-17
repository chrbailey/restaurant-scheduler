import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

/**
 * Network Shift Card
 *
 * Displays a shift from another restaurant in the network.
 * Shows restaurant name prominently, distance, position, pay rate, and claim button.
 */

export interface NetworkShift {
  id: string;
  position: string;
  startTime: string;
  endTime: string;
  hourlyRateOverride: number | null;
  baseHourlyRate: number;
  notes?: string;
  restaurant: {
    id: string;
    name: string;
    address?: string;
    timezone: string;
  };
  distance?: number; // miles from worker's primary location
  crossTrainingStatus: 'CERTIFIED' | 'PENDING' | 'NOT_CERTIFIED';
}

interface NetworkShiftCardProps {
  shift: NetworkShift;
  onClaim: (shift: NetworkShift) => void;
  isClaiming?: boolean;
  homeRestaurantName?: string;
}

export default function NetworkShiftCard({
  shift,
  onClaim,
  isClaiming = false,
  homeRestaurantName,
}: NetworkShiftCardProps) {
  const startTime = parseISO(shift.startTime);
  const endTime = parseISO(shift.endTime);
  const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  const effectiveRate = shift.hourlyRateOverride ?? shift.baseHourlyRate;

  const canClaim = shift.crossTrainingStatus === 'CERTIFIED';

  const formatDistance = (miles?: number) => {
    if (miles === undefined) return null;
    if (miles < 1) return `${Math.round(miles * 10) / 10} mi`;
    return `${Math.round(miles)} mi`;
  };

  return (
    <View style={styles.card}>
      {/* Network badge */}
      <View style={styles.networkBadge}>
        <Ionicons name="globe-outline" size={12} color="#fff" />
        <Text style={styles.networkBadgeText}>Network Shift</Text>
      </View>

      {/* Restaurant name (prominent) */}
      <View style={styles.restaurantHeader}>
        <Text style={styles.restaurantName}>{shift.restaurant.name}</Text>
        {shift.distance !== undefined && (
          <View style={styles.distanceContainer}>
            <Ionicons name="location-outline" size={14} color="#888" />
            <Text style={styles.distanceText}>
              {formatDistance(shift.distance)}
            </Text>
          </View>
        )}
      </View>

      {/* Shift details row */}
      <View style={styles.detailsRow}>
        <View style={styles.timeSection}>
          <Text style={styles.timeText}>
            {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
          </Text>
          <Text style={styles.dateText}>{format(startTime, 'EEE, MMM d')}</Text>
        </View>

        <View style={styles.positionSection}>
          <Text style={styles.positionText}>{shift.position}</Text>
          <Text style={styles.durationText}>{duration.toFixed(1)}h shift</Text>
        </View>
      </View>

      {/* Pay rate if different */}
      {shift.hourlyRateOverride && (
        <View style={styles.rateContainer}>
          <Ionicons name="cash-outline" size={16} color="#22c55e" />
          <Text style={styles.rateText}>${effectiveRate}/hr</Text>
          <Text style={styles.rateDifferent}>
            (different from home restaurant)
          </Text>
        </View>
      )}

      {/* Cross-training status warning */}
      {!canClaim && (
        <View style={styles.warningContainer}>
          <Ionicons
            name={
              shift.crossTrainingStatus === 'PENDING'
                ? 'time-outline'
                : 'alert-circle-outline'
            }
            size={16}
            color={
              shift.crossTrainingStatus === 'PENDING' ? '#f59e0b' : '#ef4444'
            }
          />
          <Text
            style={[
              styles.warningText,
              {
                color:
                  shift.crossTrainingStatus === 'PENDING'
                    ? '#f59e0b'
                    : '#ef4444',
              },
            ]}
          >
            {shift.crossTrainingStatus === 'PENDING'
              ? 'Cross-training pending approval'
              : 'Cross-training required to claim'}
          </Text>
        </View>
      )}

      {/* Action row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.claimButton, !canClaim && styles.claimButtonDisabled]}
          onPress={() => onClaim(shift)}
          disabled={isClaiming || !canClaim}
        >
          {isClaiming ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons
                name={canClaim ? 'add-circle' : 'lock-closed'}
                size={18}
                color="#fff"
              />
              <Text style={styles.claimButtonText}>
                {canClaim ? 'Claim Shift' : 'Get Certified'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
    borderLeftColor: '#4a90d9',
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4a90d9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  networkBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  restaurantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  restaurantName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    color: '#888',
    fontSize: 14,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timeSection: {},
  timeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  dateText: {
    color: '#666',
    fontSize: 13,
  },
  positionSection: {
    alignItems: 'flex-end',
  },
  positionText: {
    color: '#4a90d9',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  durationText: {
    color: '#666',
    fontSize: 13,
  },
  rateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    backgroundColor: '#22c55e15',
    padding: 8,
    borderRadius: 8,
  },
  rateText: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '600',
  },
  rateDifferent: {
    color: '#666',
    fontSize: 12,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#f59e0b15',
    borderRadius: 8,
  },
  warningText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  claimButton: {
    backgroundColor: '#4a90d9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  claimButtonDisabled: {
    backgroundColor: '#666',
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
