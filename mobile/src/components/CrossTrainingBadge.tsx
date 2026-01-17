import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Cross Training Badge
 *
 * Shows cross-training certification status for a restaurant.
 * States: Not Certified, Pending, Certified
 * Tappable to view details or request certification.
 */

export type CrossTrainingStatus = 'NOT_CERTIFIED' | 'PENDING' | 'CERTIFIED';

interface CrossTrainingBadgeProps {
  status: CrossTrainingStatus;
  positions?: string[];
  restaurantName?: string;
  onPress?: () => void;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const STATUS_CONFIG = {
  NOT_CERTIFIED: {
    icon: 'close-circle' as const,
    color: '#6b7280',
    backgroundColor: '#6b728020',
    label: 'Not Certified',
    description: 'Request certification to work here',
  },
  PENDING: {
    icon: 'time' as const,
    color: '#f59e0b',
    backgroundColor: '#f59e0b20',
    label: 'Pending',
    description: 'Certification request in review',
  },
  CERTIFIED: {
    icon: 'checkmark-circle' as const,
    color: '#22c55e',
    backgroundColor: '#22c55e20',
    label: 'Certified',
    description: 'You can claim shifts here',
  },
};

const SIZE_CONFIG = {
  small: {
    iconSize: 14,
    fontSize: 10,
    padding: 4,
    paddingHorizontal: 6,
  },
  medium: {
    iconSize: 16,
    fontSize: 12,
    padding: 6,
    paddingHorizontal: 10,
  },
  large: {
    iconSize: 20,
    fontSize: 14,
    padding: 8,
    paddingHorizontal: 14,
  },
};

export default function CrossTrainingBadge({
  status,
  positions,
  restaurantName,
  onPress,
  size = 'medium',
  showLabel = true,
}: CrossTrainingBadgeProps) {
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];

  const content = (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.backgroundColor,
          paddingVertical: sizeConfig.padding,
          paddingHorizontal: sizeConfig.paddingHorizontal,
        },
      ]}
    >
      <Ionicons
        name={config.icon}
        size={sizeConfig.iconSize}
        color={config.color}
      />
      {showLabel && (
        <Text
          style={[
            styles.label,
            { color: config.color, fontSize: sizeConfig.fontSize },
          ]}
        >
          {config.label}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// Expanded card variant showing more details
interface CrossTrainingCardProps {
  status: CrossTrainingStatus;
  restaurantName: string;
  positions?: string[];
  pendingSince?: string;
  certifiedSince?: string;
  onPress?: () => void;
  onRequestCertification?: () => void;
}

export function CrossTrainingCard({
  status,
  restaurantName,
  positions = [],
  pendingSince,
  certifiedSince,
  onPress,
  onRequestCertification,
}: CrossTrainingCardProps) {
  const config = STATUS_CONFIG[status];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardRestaurantName}>{restaurantName}</Text>
          <CrossTrainingBadge status={status} size="small" />
        </View>
      </View>

      <View style={styles.cardContent}>
        {positions.length > 0 && (
          <View style={styles.positionsRow}>
            <Ionicons name="briefcase-outline" size={14} color="#888" />
            <Text style={styles.positionsText}>
              {status === 'CERTIFIED'
                ? `Certified: ${positions.join(', ')}`
                : `Requested: ${positions.join(', ')}`}
            </Text>
          </View>
        )}

        {status === 'PENDING' && pendingSince && (
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={14} color="#888" />
            <Text style={styles.dateText}>Requested {pendingSince}</Text>
          </View>
        )}

        {status === 'CERTIFIED' && certifiedSince && (
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={14} color="#888" />
            <Text style={styles.dateText}>Certified since {certifiedSince}</Text>
          </View>
        )}

        <Text style={styles.cardDescription}>{config.description}</Text>
      </View>

      {status === 'NOT_CERTIFIED' && onRequestCertification && (
        <TouchableOpacity
          style={styles.requestButton}
          onPress={onRequestCertification}
        >
          <Ionicons name="add-circle-outline" size={18} color="#4a90d9" />
          <Text style={styles.requestButtonText}>Request Certification</Text>
        </TouchableOpacity>
      )}

      {onPress && (
        <View style={styles.cardChevron}>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
  },
  label: {
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardRestaurantName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  cardContent: {
    gap: 8,
  },
  positionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionsText: {
    color: '#888',
    fontSize: 13,
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    color: '#666',
    fontSize: 12,
  },
  cardDescription: {
    color: '#666',
    fontSize: 13,
    marginTop: 4,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#4a90d9',
    borderRadius: 8,
  },
  requestButtonText: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '600',
  },
  cardChevron: {
    position: 'absolute',
    right: 16,
    top: '50%',
  },
});
