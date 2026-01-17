import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { paymentsApi, Transfer, ContributingShift } from '../../src/services/api';
import { useActiveProfile } from '../../src/stores/authStore';

/**
 * Wallet Screen (Tab)
 *
 * Displays earned balance, instant pay options, and transfer history.
 * Integrates with DailyPay for instant access to earned wages.
 */

export default function WalletScreen() {
  const router = useRouter();
  const activeProfile = useActiveProfile();

  // Fetch earned balance
  const {
    data: balance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
    isRefetching: balanceRefetching,
  } = useQuery({
    queryKey: ['earned-balance'],
    queryFn: async () => {
      const response = await paymentsApi.getEarnedBalance();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Fetch enrollment status
  const { data: enrollment, isLoading: enrollmentLoading } = useQuery({
    queryKey: ['instant-pay-enrollment'],
    queryFn: async () => {
      const response = await paymentsApi.getEnrollmentStatus();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Fetch recent transfers
  const { data: transfers, isLoading: transfersLoading } = useQuery({
    queryKey: ['transfer-history', { limit: 5 }],
    queryFn: async () => {
      const response = await paymentsApi.getTransferHistory({ limit: 5 });
      return response.data;
    },
    enabled: !!activeProfile,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: balance?.currency || 'USD',
    }).format(amount);
  };

  const getTransferStatusStyle = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return { color: '#22c55e', label: 'Completed', icon: 'checkmark-circle' };
      case 'PROCESSING':
        return { color: '#4a90d9', label: 'Processing', icon: 'time' };
      case 'PENDING':
        return { color: '#f59e0b', label: 'Pending', icon: 'hourglass' };
      case 'FAILED':
        return { color: '#ef4444', label: 'Failed', icon: 'close-circle' };
      case 'CANCELLED':
        return { color: '#666', label: 'Cancelled', icon: 'ban' };
      default:
        return { color: '#666', label: status, icon: 'help-circle' };
    }
  };

  if (!activeProfile) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="wallet-outline" size={64} color="#666" />
        <Text style={styles.emptyText}>No restaurant selected</Text>
        <Text style={styles.emptySubtext}>
          Select a restaurant to view your earnings
        </Text>
      </View>
    );
  }

  const isLoading = balanceLoading || enrollmentLoading;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={balanceRefetching}
          onRefresh={() => refetchBalance()}
          tintColor="#4a90d9"
        />
      }
    >
      {/* Balance Card */}
      <View style={styles.balanceCard}>
        {isLoading ? (
          <ActivityIndicator color="#22c55e" size="large" />
        ) : (
          <>
            <Text style={styles.balanceLabel}>Available Now</Text>
            <Text style={styles.balanceAmount}>
              {formatCurrency(balance?.available || 0)}
            </Text>

            <View style={styles.balanceBreakdown}>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Pending</Text>
                <Text style={styles.breakdownValue}>
                  {formatCurrency(balance?.pending || 0)}
                </Text>
              </View>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Total Earned</Text>
                <Text style={styles.breakdownValue}>
                  {formatCurrency(balance?.total || 0)}
                </Text>
              </View>
            </View>

            {/* Get Paid Now Button */}
            {enrollment?.isEnrolled ? (
              <TouchableOpacity
                style={[
                  styles.getPaidButton,
                  (!balance?.available || balance.available <= 0) &&
                    styles.getPaidButtonDisabled,
                ]}
                onPress={() => router.push('/instant-pay')}
                disabled={!balance?.available || balance.available <= 0}
              >
                <Ionicons name="flash" size={20} color="#fff" />
                <Text style={styles.getPaidButtonText}>Get Paid Now</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.enrollButton}
                onPress={() => router.push('/instant-pay')}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={20} color="#f59e0b" />
                <Text style={styles.enrollButtonText}>Set Up Instant Pay</Text>
              </TouchableOpacity>
            )}

            {/* Fee disclosure */}
            {enrollment?.isEnrolled && enrollment.feeStructure && (
              <Text style={styles.feeDisclosure}>
                {enrollment.feeStructure.flatFee > 0
                  ? `${formatCurrency(enrollment.feeStructure.flatFee)} fee per transfer`
                  : enrollment.feeStructure.percentFee > 0
                    ? `${enrollment.feeStructure.percentFee}% fee per transfer`
                    : 'No fees'}
              </Text>
            )}
          </>
        )}
      </View>

      {/* Contributing Shifts */}
      {balance?.contributingShifts && balance.contributingShifts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Shifts</Text>
          <Text style={styles.sectionSubtitle}>Contributing to your balance</Text>

          {balance.contributingShifts.slice(0, 5).map((shift) => (
            <ShiftContributionCard key={shift.id} shift={shift} />
          ))}
        </View>
      )}

      {/* Transfer History */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent Transfers</Text>
            <Text style={styles.sectionSubtitle}>Your instant pay activity</Text>
          </View>
          {transfers && transfers.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/transfer-history')}>
              <Text style={styles.seeAllLink}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {transfersLoading ? (
          <ActivityIndicator color="#4a90d9" style={{ marginVertical: 20 }} />
        ) : !transfers || transfers.length === 0 ? (
          <View style={styles.noTransfers}>
            <Ionicons name="receipt-outline" size={32} color="#666" />
            <Text style={styles.noTransfersText}>No transfers yet</Text>
            <Text style={styles.noTransfersSubtext}>
              Your transfer history will appear here
            </Text>
          </View>
        ) : (
          transfers.map((transfer) => (
            <TransferCard
              key={transfer.id}
              transfer={transfer}
              formatCurrency={formatCurrency}
              getStatusStyle={getTransferStatusStyle}
            />
          ))
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => router.push('/transfer-history')}
        >
          <Ionicons name="time-outline" size={24} color="#4a90d9" />
          <Text style={styles.quickActionText}>History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => router.push('/instant-pay')}
        >
          <Ionicons name="settings-outline" size={24} color="#4a90d9" />
          <Text style={styles.quickActionText}>Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickAction} onPress={() => {}}>
          <Ionicons name="help-circle-outline" size={24} color="#4a90d9" />
          <Text style={styles.quickActionText}>Help</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

function ShiftContributionCard({ shift }: { shift: ContributingShift }) {
  return (
    <View style={styles.shiftCard}>
      <View style={styles.shiftInfo}>
        <Text style={styles.shiftPosition}>{shift.position}</Text>
        <Text style={styles.shiftDate}>
          {format(parseISO(shift.date), 'EEE, MMM d')} - {shift.hours}h
        </Text>
        <Text style={styles.shiftRestaurant}>{shift.restaurantName}</Text>
      </View>
      <View style={styles.shiftEarnings}>
        <Text style={styles.shiftAmount}>
          ${shift.earnings.toFixed(2)}
        </Text>
        <View
          style={[
            styles.shiftStatusBadge,
            {
              backgroundColor:
                shift.status === 'AVAILABLE' ? '#22c55e20' : '#f59e0b20',
            },
          ]}
        >
          <Text
            style={[
              styles.shiftStatusText,
              {
                color: shift.status === 'AVAILABLE' ? '#22c55e' : '#f59e0b',
              },
            ]}
          >
            {shift.status === 'AVAILABLE' ? 'Available' : 'Pending'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function TransferCard({
  transfer,
  formatCurrency,
  getStatusStyle,
}: {
  transfer: Transfer;
  formatCurrency: (amount: number) => string;
  getStatusStyle: (status: string) => { color: string; label: string; icon: string };
}) {
  const statusStyle = getStatusStyle(transfer.status);

  return (
    <View style={styles.transferCard}>
      <View style={styles.transferLeft}>
        <View
          style={[
            styles.transferIcon,
            { backgroundColor: statusStyle.color + '20' },
          ]}
        >
          <Ionicons
            name={statusStyle.icon as any}
            size={20}
            color={statusStyle.color}
          />
        </View>
        <View style={styles.transferInfo}>
          <Text style={styles.transferAmount}>
            {formatCurrency(transfer.netAmount)}
          </Text>
          <Text style={styles.transferDate}>
            {format(parseISO(transfer.requestedAt), 'MMM d, h:mm a')}
          </Text>
          {transfer.fee > 0 && (
            <Text style={styles.transferFee}>
              Fee: {formatCurrency(transfer.fee)}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.transferRight}>
        <Text style={[styles.transferStatus, { color: statusStyle.color }]}>
          {statusStyle.label}
        </Text>
        <Text style={styles.transferDestination}>
          {transfer.destination.bankName || 'Card'} ****
          {transfer.destination.last4}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0f0f23',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
  // Balance Card
  balanceCard: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  balanceLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    color: '#22c55e',
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  balanceBreakdown: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 24,
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
  },
  breakdownDivider: {
    width: 1,
    backgroundColor: '#2a2a4e',
  },
  breakdownLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 4,
  },
  breakdownValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  getPaidButton: {
    backgroundColor: '#22c55e',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    justifyContent: 'center',
  },
  getPaidButtonDisabled: {
    backgroundColor: '#666',
  },
  getPaidButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  enrollButton: {
    backgroundColor: '#f59e0b20',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f59e0b50',
  },
  enrollButtonText: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: '600',
  },
  feeDisclosure: {
    color: '#666',
    fontSize: 12,
    marginTop: 12,
  },
  // Section
  section: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 13,
  },
  seeAllLink: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '600',
  },
  // Shift Card
  shiftCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shiftInfo: {},
  shiftPosition: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  shiftDate: {
    color: '#888',
    fontSize: 13,
    marginBottom: 2,
  },
  shiftRestaurant: {
    color: '#666',
    fontSize: 12,
  },
  shiftEarnings: {
    alignItems: 'flex-end',
  },
  shiftAmount: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  shiftStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  shiftStatusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  // No Transfers
  noTransfers: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  noTransfersText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  noTransfersSubtext: {
    color: '#666',
    fontSize: 13,
  },
  // Transfer Card
  transferCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transferLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transferIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transferInfo: {},
  transferAmount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  transferDate: {
    color: '#888',
    fontSize: 12,
  },
  transferFee: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  transferRight: {
    alignItems: 'flex-end',
  },
  transferStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  transferDestination: {
    color: '#666',
    fontSize: 11,
  },
  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 32,
    marginHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  quickAction: {
    alignItems: 'center',
    gap: 8,
  },
  quickActionText: {
    color: '#888',
    fontSize: 12,
  },
  bottomSpacer: {
    height: 40,
  },
});
