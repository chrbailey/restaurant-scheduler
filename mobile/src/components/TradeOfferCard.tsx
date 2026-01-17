import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { TradeOffer } from '../services/api';

/**
 * TradeOfferCard Component
 *
 * Displays a trade offer in the marketplace.
 * Shows shift being offered, preferences, and compatibility indicator.
 */

interface TradeOfferCardProps {
  offer: TradeOffer;
  onPress: () => void;
  isRecommended?: boolean;
  recommendationReason?: string;
  showCompatibility?: boolean;
  compatibilityScore?: number;
}

export default function TradeOfferCard({
  offer,
  onPress,
  isRecommended = false,
  recommendationReason,
  showCompatibility = false,
  compatibilityScore,
}: TradeOfferCardProps) {
  const startTime = parseISO(offer.shift.startTime);
  const endTime = parseISO(offer.shift.endTime);
  const duration =
    (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

  const formatPreferences = () => {
    const parts: string[] = [];

    if (offer.preferences.daysOfWeek?.length) {
      const dayNames = offer.preferences.daysOfWeek.map((d) =>
        d.slice(0, 3),
      );
      if (dayNames.length <= 3) {
        parts.push(dayNames.join(', '));
      } else {
        parts.push(`${dayNames.length} days`);
      }
    }

    if (offer.preferences.timeSlots?.length) {
      const slots = offer.preferences.timeSlots.map(
        (s) => s.charAt(0) + s.slice(1).toLowerCase(),
      );
      parts.push(slots.join(', '));
    }

    if (parts.length === 0) {
      return 'Flexible - any shift';
    }

    return parts.join(' | ');
  };

  return (
    <TouchableOpacity
      style={[styles.card, isRecommended && styles.cardRecommended]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Recommended Badge */}
      {isRecommended && (
        <View style={styles.recommendedBadge}>
          <Ionicons name="sparkles" size={12} color="#f59e0b" />
          <Text style={styles.recommendedText}>Recommended</Text>
        </View>
      )}

      {/* Header Row */}
      <View style={styles.header}>
        <View style={styles.positionBadge}>
          <Text style={styles.positionText}>{offer.shift.position}</Text>
        </View>
        <View style={styles.interestBadge}>
          <Ionicons name="heart" size={12} color="#4a90d9" />
          <Text style={styles.interestText}>{offer.interestCount}</Text>
        </View>
      </View>

      {/* Shift Details */}
      <View style={styles.shiftDetails}>
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={16} color="#888" />
          <Text style={styles.dateText}>
            {format(startTime, 'EEEE, MMM d')}
          </Text>
        </View>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={16} color="#888" />
          <Text style={styles.timeText}>
            {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
            <Text style={styles.durationText}> ({duration.toFixed(1)}h)</Text>
          </Text>
        </View>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={16} color="#888" />
          <Text style={styles.locationText}>{offer.shift.restaurant.name}</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Looking For */}
      <View style={styles.preferencesSection}>
        <Text style={styles.preferencesLabel}>Looking for:</Text>
        <Text style={styles.preferencesText}>{formatPreferences()}</Text>
        {offer.preferences.flexibleOnDates && (
          <View style={styles.flexibleBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
            <Text style={styles.flexibleText}>Flexible on dates</Text>
          </View>
        )}
      </View>

      {/* Recommendation Reason */}
      {isRecommended && recommendationReason && (
        <View style={styles.reasonSection}>
          <Text style={styles.reasonText}>{recommendationReason}</Text>
        </View>
      )}

      {/* Compatibility Score */}
      {showCompatibility && compatibilityScore !== undefined && (
        <View style={styles.compatibilitySection}>
          <View style={styles.compatibilityBar}>
            <View
              style={[
                styles.compatibilityFill,
                {
                  width: `${Math.min(100, Math.max(0, compatibilityScore * 100))}%`,
                  backgroundColor:
                    compatibilityScore >= 0.8
                      ? '#22c55e'
                      : compatibilityScore >= 0.5
                        ? '#f59e0b'
                        : '#ef4444',
                },
              ]}
            />
          </View>
          <Text style={styles.compatibilityText}>
            {Math.round(compatibilityScore * 100)}% match
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.workerInfo}>
          <View style={styles.workerAvatar}>
            <Text style={styles.workerAvatarText}>
              {offer.worker.firstName[0]}
            </Text>
          </View>
          <Text style={styles.workerName}>
            {offer.worker.firstName} {offer.worker.lastName[0]}.
          </Text>
        </View>
        <View style={styles.viewButton}>
          <Text style={styles.viewButtonText}>View</Text>
          <Ionicons name="chevron-forward" size={16} color="#4a90d9" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  cardRecommended: {
    borderColor: '#f59e0b50',
    backgroundColor: '#1a1a2e',
  },
  // Recommended Badge
  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f59e0b20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  recommendedText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  positionBadge: {
    backgroundColor: '#4a90d920',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  positionText: {
    color: '#4a90d9',
    fontSize: 13,
    fontWeight: '600',
  },
  interestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  interestText: {
    color: '#4a90d9',
    fontSize: 13,
    fontWeight: '500',
  },
  // Shift Details
  shiftDetails: {
    gap: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    color: '#fff',
    fontSize: 14,
  },
  durationText: {
    color: '#666',
    fontSize: 13,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    color: '#888',
    fontSize: 13,
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: '#2a2a4e',
    marginVertical: 12,
  },
  // Preferences
  preferencesSection: {
    marginBottom: 12,
  },
  preferencesLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  preferencesText: {
    color: '#fff',
    fontSize: 14,
  },
  flexibleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  flexibleText: {
    color: '#22c55e',
    fontSize: 12,
  },
  // Reason
  reasonSection: {
    backgroundColor: '#f59e0b10',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  reasonText: {
    color: '#f59e0b',
    fontSize: 13,
    lineHeight: 18,
  },
  // Compatibility
  compatibilitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  compatibilityBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#2a2a4e',
    borderRadius: 2,
    overflow: 'hidden',
  },
  compatibilityFill: {
    height: '100%',
    borderRadius: 2,
  },
  compatibilityText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
  },
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4a90d9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  workerAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  workerName: {
    color: '#888',
    fontSize: 13,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewButtonText: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '500',
  },
});
