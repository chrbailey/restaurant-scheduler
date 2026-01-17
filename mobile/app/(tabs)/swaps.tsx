import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { swapsApi } from '../../src/services/api';
import { useActiveProfile } from '../../src/stores/authStore';

export default function SwapsScreen() {
  const activeProfile = useActiveProfile();

  const { data: swaps, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-swaps', activeProfile?.restaurantId],
    queryFn: async () => {
      if (!activeProfile?.restaurantId) return [];
      const response = await swapsApi.getMySwaps(activeProfile.restaurantId);
      return response.data;
    },
    enabled: !!activeProfile?.restaurantId,
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { color: '#f59e0b', label: 'Pending' };
      case 'ACCEPTED':
        return { color: '#22c55e', label: 'Accepted' };
      case 'REJECTED':
        return { color: '#ef4444', label: 'Rejected' };
      case 'CANCELLED':
        return { color: '#666', label: 'Cancelled' };
      default:
        return { color: '#666', label: status };
    }
  };

  if (!activeProfile) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No restaurant selected</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => refetch()}
          tintColor="#4a90d9"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shift Swaps</Text>
        <Text style={styles.headerSubtitle}>
          Manage your swap requests
        </Text>
      </View>

      {!swaps || swaps.length === 0 ? (
        <View style={styles.noSwaps}>
          <Text style={styles.noSwapsEmoji}>🔄</Text>
          <Text style={styles.noSwapsText}>No swap requests</Text>
          <Text style={styles.noSwapsSubtext}>
            Swap shifts with coworkers from your schedule
          </Text>
        </View>
      ) : (
        swaps.map((swap: any) => {
          const statusStyle = getStatusStyle(swap.status);
          return (
            <TouchableOpacity key={swap.id} style={styles.swapCard}>
              <View style={styles.swapHeader}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusStyle.color + '20' },
                  ]}
                >
                  <Text style={[styles.statusText, { color: statusStyle.color }]}>
                    {statusStyle.label}
                  </Text>
                </View>
                <Text style={styles.swapDate}>
                  {format(parseISO(swap.createdAt), 'MMM d')}
                </Text>
              </View>

              <View style={styles.swapDetails}>
                <View style={styles.shiftInfo}>
                  <Text style={styles.shiftLabel}>Your shift</Text>
                  <Text style={styles.shiftPosition}>
                    {swap.sourceShift.position}
                  </Text>
                  <Text style={styles.shiftTime}>
                    {format(parseISO(swap.sourceShift.startTime), 'MMM d, h:mm a')}
                  </Text>
                </View>

                <Text style={styles.swapArrow}>→</Text>

                <View style={styles.shiftInfo}>
                  <Text style={styles.shiftLabel}>
                    {swap.targetWorker ? 'To' : 'Pool'}
                  </Text>
                  {swap.targetWorker ? (
                    <>
                      <Text style={styles.shiftPosition}>
                        {swap.targetWorker.user.firstName}
                      </Text>
                      {swap.targetShift && (
                        <Text style={styles.shiftTime}>
                          {format(
                            parseISO(swap.targetShift.startTime),
                            'MMM d, h:mm a',
                          )}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.shiftPosition}>Open Pool</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
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
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#666',
    fontSize: 14,
  },
  noSwaps: {
    alignItems: 'center',
    marginTop: 80,
  },
  noSwapsEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  noSwapsText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  noSwapsSubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  swapCard: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
  },
  swapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  swapDate: {
    color: '#666',
    fontSize: 12,
  },
  swapDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftInfo: {
    flex: 1,
  },
  shiftLabel: {
    color: '#666',
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  shiftPosition: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  shiftTime: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  swapArrow: {
    color: '#4a90d9',
    fontSize: 20,
    marginHorizontal: 16,
  },
});
