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
import { format, parseISO, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { paymentsApi, Transfer, TransferStatus } from '../src/services/api';
import { useActiveProfile } from '../src/stores/authStore';

/**
 * Transfer History Screen
 *
 * Shows list of all past instant pay transfers with filtering options.
 */

type DateFilter = 'all' | 'week' | 'month' | 'custom';

export default function TransferHistoryScreen() {
  const router = useRouter();
  const activeProfile = useActiveProfile();

  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'ALL'>('ALL');

  // Calculate date range based on filter
  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case 'week':
        return { startDate: subDays(now, 7).toISOString(), endDate: now.toISOString() };
      case 'month':
        return {
          startDate: startOfMonth(now).toISOString(),
          endDate: endOfMonth(now).toISOString(),
        };
      default:
        return {};
    }
  };

  // Fetch transfers
  const {
    data: transfers,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['transfer-history', dateFilter, statusFilter],
    queryFn: async () => {
      const dateRange = getDateRange();
      const response = await paymentsApi.getTransferHistory({
        ...dateRange,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        limit: 50,
      });
      return response.data;
    },
    enabled: !!activeProfile,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusStyle = (status: string) => {
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

  // Group transfers by date
  const groupedTransfers = (transfers || []).reduce(
    (acc: { [key: string]: Transfer[] }, transfer) => {
      const dateKey = format(parseISO(transfer.requestedAt), 'yyyy-MM-dd');
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(transfer);
      return acc;
    },
    {},
  );

  const sortedDates = Object.keys(groupedTransfers).sort((a, b) =>
    b.localeCompare(a),
  );

  // Calculate totals
  const totals = (transfers || []).reduce(
    (acc, t) => {
      if (t.status === 'COMPLETED') {
        acc.totalTransferred += t.amount;
        acc.totalFees += t.fee;
        acc.totalReceived += t.netAmount;
        acc.count += 1;
      }
      return acc;
    },
    { totalTransferred: 0, totalFees: 0, totalReceived: 0, count: 0 },
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transfer History</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dateFilters}
        >
          {(['all', 'week', 'month'] as DateFilter[]).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                dateFilter === filter && styles.filterChipActive,
              ]}
              onPress={() => setDateFilter(filter)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  dateFilter === filter && styles.filterChipTextActive,
                ]}
              >
                {filter === 'all' ? 'All Time' : filter === 'week' ? 'This Week' : 'This Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statusFilters}
        >
          {(['ALL', 'COMPLETED', 'PENDING', 'PROCESSING', 'FAILED'] as (TransferStatus | 'ALL')[]).map(
            (status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.statusChip,
                  statusFilter === status && styles.statusChipActive,
                ]}
                onPress={() => setStatusFilter(status)}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    statusFilter === status && styles.statusChipTextActive,
                  ]}
                >
                  {status === 'ALL' ? 'All' : getStatusStyle(status).label}
                </Text>
              </TouchableOpacity>
            ),
          )}
        </ScrollView>
      </View>

      {/* Summary Stats */}
      {totals.count > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totals.count}</Text>
            <Text style={styles.summaryLabel}>Transfers</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {formatCurrency(totals.totalReceived)}
            </Text>
            <Text style={styles.summaryLabel}>Received</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#ef4444' }]}>
              {formatCurrency(totals.totalFees)}
            </Text>
            <Text style={styles.summaryLabel}>Fees</Text>
          </View>
        </View>
      )}

      {/* Transfer List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor="#4a90d9"
          />
        }
      >
        {isLoading ? (
          <ActivityIndicator color="#4a90d9" style={{ marginTop: 40 }} />
        ) : !transfers || transfers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color="#666" />
            <Text style={styles.emptyTitle}>No transfers found</Text>
            <Text style={styles.emptySubtitle}>
              {statusFilter !== 'ALL'
                ? 'Try adjusting your filters'
                : 'Your transfer history will appear here'}
            </Text>
          </View>
        ) : (
          sortedDates.map((dateKey) => (
            <View key={dateKey}>
              <Text style={styles.dateHeader}>
                {format(parseISO(dateKey), 'EEEE, MMMM d, yyyy')}
              </Text>
              {groupedTransfers[dateKey].map((transfer) => (
                <TransferRow
                  key={transfer.id}
                  transfer={transfer}
                  formatCurrency={formatCurrency}
                  getStatusStyle={getStatusStyle}
                />
              ))}
            </View>
          ))
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

function TransferRow({
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
    <TouchableOpacity style={styles.transferRow}>
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
          <Text style={styles.transferTime}>
            {format(parseISO(transfer.requestedAt), 'h:mm a')}
          </Text>
        </View>
      </View>

      <View style={styles.transferRight}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusStyle.color + '20' },
          ]}
        >
          <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>
            {statusStyle.label}
          </Text>
        </View>
        <Text style={styles.transferDestination}>
          {transfer.destination.bankName || 'Card'} ****
          {transfer.destination.last4}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Filters
  filtersContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  dateFilters: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  statusFilters: {
    paddingHorizontal: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#4a90d9',
  },
  filterChipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  statusChipActive: {
    borderColor: '#4a90d9',
    backgroundColor: '#4a90d920',
  },
  statusChipText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  statusChipTextActive: {
    color: '#4a90d9',
  },
  // Summary
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#2a2a4e',
  },
  summaryValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  summaryLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  // List
  list: {
    flex: 1,
  },
  dateHeader: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#0f0f23',
  },
  transferRow: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
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
  transferTime: {
    color: '#666',
    fontSize: 12,
  },
  transferRight: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  transferDestination: {
    color: '#666',
    fontSize: 11,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  bottomSpacer: {
    height: 40,
  },
});
