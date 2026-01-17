import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, isToday, isTomorrow, addDays } from 'date-fns';
import { networkApi } from '../../src/services/api';
import { useActiveProfile } from '../../src/stores/authStore';
import NetworkShiftCard, {
  NetworkShift,
} from '../../src/components/NetworkShiftCard';
import CrossTrainingBadge from '../../src/components/CrossTrainingBadge';

/**
 * Network Tab Screen
 *
 * Shows network membership, restaurants with available shifts,
 * and allows claiming shifts at other restaurants.
 */

interface Network {
  id: string;
  name: string;
  restaurantCount: number;
}

interface NetworkRestaurant {
  id: string;
  name: string;
  address?: string;
  distance?: number;
  availableShiftCount: number;
  crossTrainingStatus: 'NOT_CERTIFIED' | 'PENDING' | 'CERTIFIED';
  certifiedPositions: string[];
}

type FilterPosition = string | 'ALL';
type FilterDate = 'ALL' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK';
type SortBy = 'DISTANCE' | 'SHIFTS' | 'NAME';

export default function NetworkScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeProfile = useActiveProfile();

  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<NetworkRestaurant | null>(null);
  const [filterPosition, setFilterPosition] = useState<FilterPosition>('ALL');
  const [filterDate, setFilterDate] = useState<FilterDate>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('DISTANCE');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Fetch networks
  const {
    data: networks,
    isLoading: networksLoading,
    refetch: refetchNetworks,
    isRefetching: networksRefetching,
  } = useQuery({
    queryKey: ['my-networks'],
    queryFn: async () => {
      const response = await networkApi.getMyNetworks();
      return response.data as Network[];
    },
    enabled: !!activeProfile,
  });

  // Auto-select first network
  useMemo(() => {
    if (networks && networks.length > 0 && !selectedNetwork) {
      setSelectedNetwork(networks[0]);
    }
  }, [networks, selectedNetwork]);

  // Fetch network restaurants when a network is selected
  const { data: restaurants, isLoading: restaurantsLoading } = useQuery({
    queryKey: ['network-restaurants', selectedNetwork?.id],
    queryFn: async () => {
      const response = await networkApi.getNetworkRestaurants(
        selectedNetwork!.id,
      );
      return response.data as NetworkRestaurant[];
    },
    enabled: !!selectedNetwork,
  });

  // Fetch shifts when a restaurant is selected
  const { data: shifts, isLoading: shiftsLoading } = useQuery({
    queryKey: [
      'network-shifts',
      selectedNetwork?.id,
      selectedRestaurant?.id,
      filterPosition,
      filterDate,
    ],
    queryFn: async () => {
      const params: any = {};
      if (selectedRestaurant) {
        params.restaurantId = selectedRestaurant.id;
      }
      if (filterPosition !== 'ALL') {
        params.position = [filterPosition];
      }
      if (filterDate !== 'ALL') {
        const today = new Date();
        params.startDate = today.toISOString();
        if (filterDate === 'TODAY') {
          params.endDate = today.toISOString();
        } else if (filterDate === 'TOMORROW') {
          params.startDate = addDays(today, 1).toISOString();
          params.endDate = addDays(today, 1).toISOString();
        } else if (filterDate === 'THIS_WEEK') {
          params.endDate = addDays(today, 7).toISOString();
        }
      }

      const response = await networkApi.getNetworkShifts(
        selectedNetwork!.id,
        params,
      );
      return response.data as NetworkShift[];
    },
    enabled: !!selectedNetwork && !!selectedRestaurant,
  });

  // Claim shift mutation
  const claimShift = useMutation({
    mutationFn: (shift: NetworkShift) =>
      networkApi.claimNetworkShift(
        selectedNetwork!.id,
        shift.id,
        shift.restaurant.id,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['network-restaurants'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      Alert.alert(
        'Shift Claimed!',
        'Your claim has been submitted. The manager will review and confirm.',
      );
    },
    onError: (err: any) => {
      Alert.alert(
        'Claim Failed',
        err.response?.data?.message || 'Failed to claim shift',
      );
    },
    onSettled: () => {
      setClaimingId(null);
    },
  });

  const handleClaimShift = (shift: NetworkShift) => {
    if (shift.crossTrainingStatus !== 'CERTIFIED') {
      router.push({
        pathname: '/cross-training',
        params: { restaurantId: shift.restaurant.id },
      });
      return;
    }

    Alert.alert(
      'Claim Network Shift',
      `This shift is at ${shift.restaurant.name}, not your home restaurant. Are you sure you want to claim it?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Claim Shift',
          onPress: () => {
            setClaimingId(shift.id);
            claimShift.mutate(shift);
          },
        },
      ],
    );
  };

  // Sort and filter restaurants
  const sortedRestaurants = useMemo(() => {
    if (!restaurants) return [];

    return [...restaurants]
      .filter((r) => r.id !== activeProfile?.restaurantId) // Exclude home restaurant
      .sort((a, b) => {
        switch (sortBy) {
          case 'DISTANCE':
            return (a.distance ?? 999) - (b.distance ?? 999);
          case 'SHIFTS':
            return b.availableShiftCount - a.availableShiftCount;
          case 'NAME':
            return a.name.localeCompare(b.name);
          default:
            return 0;
        }
      });
  }, [restaurants, sortBy, activeProfile?.restaurantId]);

  if (!activeProfile) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No restaurant selected</Text>
      </View>
    );
  }

  if (networksLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#4a90d9" size="large" />
        <Text style={styles.loadingText}>Loading networks...</Text>
      </View>
    );
  }

  if (!networks || networks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="globe-outline" size={64} color="#666" />
        <Text style={styles.emptyText}>No Networks</Text>
        <Text style={styles.emptySubtext}>
          Your restaurant is not part of any network yet. Ask your manager about
          joining a network to access shifts at other locations.
        </Text>
      </View>
    );
  }

  // Restaurant list view
  if (!selectedRestaurant) {
    return (
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={networksRefetching}
            onRefresh={() => refetchNetworks()}
            tintColor="#4a90d9"
          />
        }
      >
        {/* Network header */}
        <View style={styles.header}>
          <View style={styles.networkInfo}>
            <Text style={styles.networkLabel}>Your Network</Text>
            <Text style={styles.networkName}>{selectedNetwork?.name}</Text>
            <Text style={styles.networkMeta}>
              {selectedNetwork?.restaurantCount} restaurants
            </Text>
          </View>

          <TouchableOpacity
            style={styles.crossTrainingButton}
            onPress={() => router.push('/cross-training')}
          >
            <Ionicons name="school-outline" size={20} color="#4a90d9" />
            <Text style={styles.crossTrainingButtonText}>Cross-Training</Text>
          </TouchableOpacity>
        </View>

        {/* Sort controls */}
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort by:</Text>
          <TouchableOpacity
            style={[styles.sortOption, sortBy === 'DISTANCE' && styles.sortOptionActive]}
            onPress={() => setSortBy('DISTANCE')}
          >
            <Text
              style={[
                styles.sortOptionText,
                sortBy === 'DISTANCE' && styles.sortOptionTextActive,
              ]}
            >
              Distance
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortOption, sortBy === 'SHIFTS' && styles.sortOptionActive]}
            onPress={() => setSortBy('SHIFTS')}
          >
            <Text
              style={[
                styles.sortOptionText,
                sortBy === 'SHIFTS' && styles.sortOptionTextActive,
              ]}
            >
              Shifts
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortOption, sortBy === 'NAME' && styles.sortOptionActive]}
            onPress={() => setSortBy('NAME')}
          >
            <Text
              style={[
                styles.sortOptionText,
                sortBy === 'NAME' && styles.sortOptionTextActive,
              ]}
            >
              Name
            </Text>
          </TouchableOpacity>
        </View>

        {/* Restaurants list */}
        {restaurantsLoading ? (
          <ActivityIndicator color="#4a90d9" style={{ marginTop: 40 }} />
        ) : sortedRestaurants.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>
              No other restaurants in this network
            </Text>
          </View>
        ) : (
          <View style={styles.restaurantsList}>
            {sortedRestaurants.map((restaurant) => (
              <TouchableOpacity
                key={restaurant.id}
                style={styles.restaurantCard}
                onPress={() => setSelectedRestaurant(restaurant)}
              >
                <View style={styles.restaurantMain}>
                  <View style={styles.restaurantInfo}>
                    <Text style={styles.restaurantName}>{restaurant.name}</Text>
                    {restaurant.distance !== undefined && (
                      <View style={styles.distanceRow}>
                        <Ionicons
                          name="location-outline"
                          size={14}
                          color="#888"
                        />
                        <Text style={styles.distanceText}>
                          {restaurant.distance < 1
                            ? `${Math.round(restaurant.distance * 10) / 10} mi`
                            : `${Math.round(restaurant.distance)} mi`}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.restaurantMeta}>
                    <View style={styles.shiftCountBadge}>
                      <Text style={styles.shiftCountText}>
                        {restaurant.availableShiftCount}
                      </Text>
                      <Text style={styles.shiftCountLabel}>shifts</Text>
                    </View>
                    <CrossTrainingBadge
                      status={restaurant.crossTrainingStatus}
                      size="small"
                    />
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={20} color="#666" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // Shifts list view (when a restaurant is selected)
  return (
    <ScrollView style={styles.container}>
      {/* Back button and restaurant header */}
      <View style={styles.shiftHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setSelectedRestaurant(null)}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.shiftHeaderInfo}>
          <Text style={styles.shiftHeaderTitle}>
            {selectedRestaurant.name}
          </Text>
          <View style={styles.shiftHeaderMeta}>
            {selectedRestaurant.distance !== undefined && (
              <Text style={styles.shiftHeaderDistance}>
                {selectedRestaurant.distance < 1
                  ? `${Math.round(selectedRestaurant.distance * 10) / 10} mi away`
                  : `${Math.round(selectedRestaurant.distance)} mi away`}
              </Text>
            )}
            <CrossTrainingBadge
              status={selectedRestaurant.crossTrainingStatus}
              size="small"
              onPress={() =>
                router.push({
                  pathname: '/cross-training',
                  params: { restaurantId: selectedRestaurant.id },
                })
              }
            />
          </View>
        </View>
      </View>

      {/* Date filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
      >
        {(['ALL', 'TODAY', 'TOMORROW', 'THIS_WEEK'] as FilterDate[]).map(
          (filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                filterDate === filter && styles.filterChipActive,
              ]}
              onPress={() => setFilterDate(filter)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterDate === filter && styles.filterChipTextActive,
                ]}
              >
                {filter === 'ALL'
                  ? 'All Dates'
                  : filter === 'TODAY'
                    ? 'Today'
                    : filter === 'TOMORROW'
                      ? 'Tomorrow'
                      : 'This Week'}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </ScrollView>

      {/* Shifts list */}
      {shiftsLoading ? (
        <ActivityIndicator color="#4a90d9" style={{ marginTop: 40 }} />
      ) : !shifts || shifts.length === 0 ? (
        <View style={styles.noShifts}>
          <Ionicons name="calendar-outline" size={48} color="#666" />
          <Text style={styles.noShiftsText}>No available shifts</Text>
          <Text style={styles.noShiftsSubtext}>
            Check back later for new opportunities at this location
          </Text>
        </View>
      ) : (
        <View style={styles.shiftsList}>
          {shifts.map((shift) => (
            <NetworkShiftCard
              key={shift.id}
              shift={shift}
              onClaim={handleClaimShift}
              isClaiming={claimingId === shift.id}
              homeRestaurantName={activeProfile.restaurantName}
            />
          ))}
        </View>
      )}
    </ScrollView>
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
    gap: 16,
  },
  loadingText: {
    color: '#666',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0f0f23',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  networkInfo: {
    flex: 1,
  },
  networkLabel: {
    color: '#666',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  networkName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  networkMeta: {
    color: '#888',
    fontSize: 14,
  },
  crossTrainingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4a90d920',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  crossTrainingButtonText: {
    color: '#4a90d9',
    fontSize: 13,
    fontWeight: '600',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  sortLabel: {
    color: '#666',
    fontSize: 13,
    marginRight: 8,
  },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
  },
  sortOptionActive: {
    backgroundColor: '#4a90d9',
  },
  sortOptionText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  sortOptionTextActive: {
    color: '#fff',
  },
  restaurantsList: {
    padding: 16,
  },
  restaurantCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  restaurantMain: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  restaurantInfo: {
    flex: 1,
  },
  restaurantName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    color: '#888',
    fontSize: 13,
  },
  restaurantMeta: {
    alignItems: 'flex-end',
    gap: 8,
  },
  shiftCountBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  shiftCountText: {
    color: '#4a90d9',
    fontSize: 20,
    fontWeight: 'bold',
  },
  shiftCountLabel: {
    color: '#666',
    fontSize: 12,
  },
  noResults: {
    padding: 32,
    alignItems: 'center',
  },
  noResultsText: {
    color: '#666',
    fontSize: 14,
  },
  // Shifts view styles
  shiftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  backButton: {
    marginRight: 16,
  },
  shiftHeaderInfo: {
    flex: 1,
  },
  shiftHeaderTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  shiftHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shiftHeaderDistance: {
    color: '#888',
    fontSize: 13,
  },
  filterRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
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
  shiftsList: {
    padding: 16,
  },
  noShifts: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  noShiftsText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  noShiftsSubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
});
