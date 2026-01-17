import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { paymentsApi } from '../services/api';

/**
 * EarningsCard Component
 *
 * Compact earnings summary card for dashboard display.
 * Shows total earned, hours worked, and available for instant pay.
 * Taps through to the full wallet screen.
 */

interface EarningsCardProps {
  periodLabel?: string; // e.g., "This Week", "This Pay Period"
}

export default function EarningsCard({ periodLabel = 'This Period' }: EarningsCardProps) {
  const router = useRouter();

  // Fetch earned balance
  const { data: balance, isLoading } = useQuery({
    queryKey: ['earned-balance'],
    queryFn: async () => {
      const response = await paymentsApi.getEarnedBalance();
      return response.data;
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: balance?.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate total hours from contributing shifts
  const totalHours =
    balance?.contributingShifts?.reduce((sum, shift) => sum + shift.hours, 0) || 0;

  const handlePress = () => {
    router.push('/(tabs)/wallet');
  };

  if (isLoading) {
    return (
      <TouchableOpacity style={styles.card} onPress={handlePress}>
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Loading earnings...</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.7}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="wallet" size={20} color="#22c55e" />
          <Text style={styles.periodLabel}>{periodLabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#666" />
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {/* Total Earned */}
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {formatCurrency(balance?.total || 0)}
          </Text>
          <Text style={styles.statLabel}>Total Earned</Text>
        </View>

        {/* Divider */}
        <View style={styles.statDivider} />

        {/* Hours Worked */}
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalHours.toFixed(1)}h</Text>
          <Text style={styles.statLabel}>Hours</Text>
        </View>

        {/* Divider */}
        <View style={styles.statDivider} />

        {/* Available Now */}
        <View style={styles.statItem}>
          <Text style={[styles.statValue, styles.availableValue]}>
            {formatCurrency(balance?.available || 0)}
          </Text>
          <Text style={styles.statLabel}>Available</Text>
        </View>
      </View>

      {/* Instant Pay Prompt */}
      {(balance?.available || 0) > 0 && (
        <View style={styles.instantPayBanner}>
          <Ionicons name="flash" size={16} color="#22c55e" />
          <Text style={styles.instantPayText}>
            Get paid now - tap to transfer
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * Compact version for smaller spaces
 */
export function EarningsCardCompact() {
  const router = useRouter();

  const { data: balance } = useQuery({
    queryKey: ['earned-balance'],
    queryFn: async () => {
      const response = await paymentsApi.getEarnedBalance();
      return response.data;
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <TouchableOpacity
      style={styles.compactCard}
      onPress={() => router.push('/(tabs)/wallet')}
    >
      <View style={styles.compactLeft}>
        <View style={styles.compactIcon}>
          <MaterialCommunityIcons name="wallet" size={18} color="#22c55e" />
        </View>
        <View>
          <Text style={styles.compactLabel}>Available Now</Text>
          <Text style={styles.compactValue}>
            {formatCurrency(balance?.available || 0)}
          </Text>
        </View>
      </View>
      <View style={styles.compactRight}>
        <Ionicons name="flash" size={16} color="#22c55e" />
        <Ionicons name="chevron-forward" size={16} color="#666" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  loadingState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
    fontSize: 14,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  periodLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#2a2a4e',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  availableValue: {
    color: '#22c55e',
  },
  statLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Instant Pay Banner
  instantPayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  instantPayText: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '500',
  },
  // Compact Card
  compactCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22c55e20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 2,
  },
  compactValue: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: 'bold',
  },
  compactRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
