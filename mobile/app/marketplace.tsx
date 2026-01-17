import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { marketplaceApi, DayOfWeek, TimeSlot, TradeOffer } from '../src/services/api';
import { useActiveProfile } from '../src/stores/authStore';
import TradeOfferCard from '../src/components/TradeOfferCard';

/**
 * Marketplace Screen
 *
 * Browse and search trade offers from other workers.
 * Filter by day of week, time slot, and position.
 */

const DAYS_OF_WEEK: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 'MONDAY', label: 'Monday', short: 'Mon' },
  { value: 'TUESDAY', label: 'Tuesday', short: 'Tue' },
  { value: 'WEDNESDAY', label: 'Wednesday', short: 'Wed' },
  { value: 'THURSDAY', label: 'Thursday', short: 'Thu' },
  { value: 'FRIDAY', label: 'Friday', short: 'Fri' },
  { value: 'SATURDAY', label: 'Saturday', short: 'Sat' },
  { value: 'SUNDAY', label: 'Sunday', short: 'Sun' },
];

const TIME_SLOTS: { value: TimeSlot; label: string }[] = [
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'EVENING', label: 'Evening' },
  { value: 'OVERNIGHT', label: 'Overnight' },
];

export default function MarketplaceScreen() {
  const router = useRouter();
  const activeProfile = useActiveProfile();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch trade offers
  const {
    data: offers,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['trade-offers', selectedDays, selectedTimeSlots, selectedPositions],
    queryFn: async () => {
      const response = await marketplaceApi.getTradeOffers({
        dayOfWeek: selectedDays.length > 0 ? selectedDays : undefined,
        timeSlot: selectedTimeSlots.length > 0 ? selectedTimeSlots : undefined,
        position: selectedPositions.length > 0 ? selectedPositions : undefined,
        limit: 50,
      });
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Fetch my offers
  const { data: myOffers } = useQuery({
    queryKey: ['my-trade-offers'],
    queryFn: async () => {
      const response = await marketplaceApi.getMyOffers('ACTIVE');
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Fetch recommended trades
  const { data: recommendations } = useQuery({
    queryKey: ['recommended-trades'],
    queryFn: async () => {
      const response = await marketplaceApi.getRecommendedTrades();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleTimeSlot = (slot: TimeSlot) => {
    setSelectedTimeSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  const clearFilters = () => {
    setSelectedDays([]);
    setSelectedTimeSlots([]);
    setSelectedPositions([]);
  };

  const hasFilters =
    selectedDays.length > 0 ||
    selectedTimeSlots.length > 0 ||
    selectedPositions.length > 0;

  // Filter offers by search query
  const filteredOffers = (offers || []).filter((offer) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      offer.shift.position.toLowerCase().includes(query) ||
      offer.shift.restaurant.name.toLowerCase().includes(query) ||
      `${offer.worker.firstName} ${offer.worker.lastName}`
        .toLowerCase()
        .includes(query)
    );
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shift Marketplace</Text>
        <TouchableOpacity onPress={() => router.push('/my-trades')}>
          <Ionicons name="list" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search offers..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, hasFilters && styles.filterButtonActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons
            name="options"
            size={20}
            color={hasFilters ? '#fff' : '#888'}
          />
        </TouchableOpacity>
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          {/* Days */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Day of Week</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {DAYS_OF_WEEK.map((day) => (
                <TouchableOpacity
                  key={day.value}
                  style={[
                    styles.filterChip,
                    selectedDays.includes(day.value) && styles.filterChipActive,
                  ]}
                  onPress={() => toggleDay(day.value)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedDays.includes(day.value) && styles.filterChipTextActive,
                    ]}
                  >
                    {day.short}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Time Slots */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Time Slot</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {TIME_SLOTS.map((slot) => (
                <TouchableOpacity
                  key={slot.value}
                  style={[
                    styles.filterChip,
                    selectedTimeSlots.includes(slot.value) &&
                      styles.filterChipActive,
                  ]}
                  onPress={() => toggleTimeSlot(slot.value)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedTimeSlots.includes(slot.value) &&
                        styles.filterChipTextActive,
                    ]}
                  >
                    {slot.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Clear Filters */}
          {hasFilters && (
            <TouchableOpacity style={styles.clearFilters} onPress={clearFilters}>
              <Ionicons name="close" size={16} color="#ef4444" />
              <Text style={styles.clearFiltersText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor="#4a90d9"
          />
        }
      >
        {/* My Active Offers */}
        {myOffers && myOffers.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Active Offers</Text>
              <TouchableOpacity onPress={() => router.push('/my-trades')}>
                <Text style={styles.seeAllLink}>Manage</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalList}
            >
              {myOffers.slice(0, 3).map((offer) => (
                <View key={offer.id} style={styles.myOfferCard}>
                  <Text style={styles.myOfferPosition}>{offer.shift.position}</Text>
                  <Text style={styles.myOfferDate}>
                    {new Date(offer.shift.startTime).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  <View style={styles.myOfferStats}>
                    <Text style={styles.myOfferInterest}>
                      {offer.interestCount} interested
                    </Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={styles.createOfferCard}
                onPress={() => router.push('/create-trade')}
              >
                <Ionicons name="add-circle" size={32} color="#4a90d9" />
                <Text style={styles.createOfferText}>Post Trade</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Recommended Trades */}
        {recommendations && recommendations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="sparkles" size={18} color="#f59e0b" />
                <Text style={styles.sectionTitle}>Recommended for You</Text>
              </View>
            </View>
            {recommendations.slice(0, 3).map((rec) => (
              <TradeOfferCard
                key={rec.offer.id}
                offer={rec.offer}
                isRecommended
                recommendationReason={rec.reason}
                onPress={() =>
                  router.push({
                    pathname: '/trade-detail',
                    params: { offerId: rec.offer.id },
                  })
                }
              />
            ))}
          </View>
        )}

        {/* All Offers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Available Trades</Text>
            <Text style={styles.offerCount}>
              {filteredOffers.length} offer{filteredOffers.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#4a90d9" style={{ marginTop: 40 }} />
          ) : filteredOffers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="swap-horizontal" size={48} color="#666" />
              <Text style={styles.emptyTitle}>No trades found</Text>
              <Text style={styles.emptySubtitle}>
                {hasFilters
                  ? 'Try adjusting your filters'
                  : 'Check back later for new trade offers'}
              </Text>
              {!myOffers?.length && (
                <TouchableOpacity
                  style={styles.postTradeButton}
                  onPress={() => router.push('/create-trade')}
                >
                  <Text style={styles.postTradeButtonText}>
                    Post Your First Trade
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredOffers.map((offer) => (
              <TradeOfferCard
                key={offer.id}
                offer={offer}
                onPress={() =>
                  router.push({
                    pathname: '/trade-detail',
                    params: { offerId: offer.id },
                  })
                }
              />
            ))
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* FAB for creating trade */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/create-trade')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
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
  // Search
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 12,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#4a90d9',
  },
  // Filters Panel
  filtersPanel: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  filterChipActive: {
    backgroundColor: '#4a90d9',
    borderColor: '#4a90d9',
  },
  filterChipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  clearFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  clearFiltersText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '500',
  },
  // Content
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  seeAllLink: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '500',
  },
  offerCount: {
    color: '#666',
    fontSize: 13,
  },
  // My Offers
  horizontalList: {
    paddingLeft: 16,
  },
  myOfferCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginRight: 12,
    width: 140,
    borderWidth: 1,
    borderColor: '#4a90d930',
  },
  myOfferPosition: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  myOfferDate: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  myOfferStats: {},
  myOfferInterest: {
    color: '#4a90d9',
    fontSize: 12,
    fontWeight: '500',
  },
  createOfferCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginRight: 16,
    width: 120,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4a90d930',
    borderStyle: 'dashed',
  },
  createOfferText: {
    color: '#4a90d9',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
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
    marginBottom: 24,
  },
  postTradeButton: {
    backgroundColor: '#4a90d9',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  postTradeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4a90d9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomSpacer: {
    height: 100,
  },
});
