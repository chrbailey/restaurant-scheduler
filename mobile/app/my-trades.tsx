import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import {
  marketplaceApi,
  TradeOffer,
  TradeProposal,
} from '../src/services/api';
import { useActiveProfile } from '../src/stores/authStore';
import TradeProposalCard from '../src/components/TradeProposalCard';

/**
 * My Trades Screen
 *
 * Manage trade offers and proposals.
 * Tabs: My Offers, Incoming Proposals, Outgoing Proposals
 */

type TabType = 'offers' | 'incoming' | 'outgoing';

export default function MyTradesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeProfile = useActiveProfile();

  const [activeTab, setActiveTab] = useState<TabType>('offers');

  // Fetch my offers
  const {
    data: myOffers,
    isLoading: offersLoading,
    refetch: refetchOffers,
    isRefetching: offersRefetching,
  } = useQuery({
    queryKey: ['my-trade-offers'],
    queryFn: async () => {
      const response = await marketplaceApi.getMyOffers();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Fetch received proposals
  const {
    data: receivedProposals,
    isLoading: receivedLoading,
    refetch: refetchReceived,
    isRefetching: receivedRefetching,
  } = useQuery({
    queryKey: ['received-proposals'],
    queryFn: async () => {
      const response = await marketplaceApi.getReceivedProposals();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Fetch my proposals
  const {
    data: myProposals,
    isLoading: proposalsLoading,
    refetch: refetchProposals,
    isRefetching: proposalsRefetching,
  } = useQuery({
    queryKey: ['my-proposals'],
    queryFn: async () => {
      const response = await marketplaceApi.getMyProposals();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Cancel offer mutation
  const cancelOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      await marketplaceApi.cancelOffer(offerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-trade-offers'] });
      Alert.alert('Success', 'Offer cancelled');
    },
    onError: (error: any) => {
      Alert.alert(
        'Error',
        error?.response?.data?.message || 'Failed to cancel offer',
      );
    },
  });

  // Accept proposal mutation
  const acceptMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      await marketplaceApi.acceptTrade(proposalId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['received-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['my-trade-offers'] });
      Alert.alert('Success', 'Trade accepted! Your shifts have been swapped.');
    },
    onError: (error: any) => {
      Alert.alert(
        'Error',
        error?.response?.data?.message || 'Failed to accept trade',
      );
    },
  });

  // Reject proposal mutation
  const rejectMutation = useMutation({
    mutationFn: async (data: { proposalId: string; reason?: string }) => {
      await marketplaceApi.rejectTrade(data.proposalId, data.reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['received-proposals'] });
      Alert.alert('Done', 'Proposal rejected');
    },
    onError: (error: any) => {
      Alert.alert(
        'Error',
        error?.response?.data?.message || 'Failed to reject proposal',
      );
    },
  });

  const handleCancelOffer = (offerId: string) => {
    Alert.alert(
      'Cancel Offer',
      'Are you sure you want to cancel this trade offer?',
      [
        { text: 'Keep It', style: 'cancel' },
        {
          text: 'Cancel Offer',
          style: 'destructive',
          onPress: () => cancelOfferMutation.mutate(offerId),
        },
      ],
    );
  };

  const handleAcceptProposal = (proposalId: string) => {
    Alert.alert(
      'Accept Trade',
      'Are you sure you want to accept this trade? Your shifts will be swapped.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept Trade',
          onPress: () => acceptMutation.mutate(proposalId),
        },
      ],
    );
  };

  const handleRejectProposal = (proposalId: string) => {
    Alert.alert(
      'Reject Proposal',
      'Are you sure you want to reject this trade proposal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () =>
            rejectMutation.mutate({ proposalId, reason: undefined }),
        },
      ],
    );
  };

  const handleRefresh = () => {
    switch (activeTab) {
      case 'offers':
        refetchOffers();
        break;
      case 'incoming':
        refetchReceived();
        break;
      case 'outgoing':
        refetchProposals();
        break;
    }
  };

  const isLoading =
    (activeTab === 'offers' && offersLoading) ||
    (activeTab === 'incoming' && receivedLoading) ||
    (activeTab === 'outgoing' && proposalsLoading);

  const isRefetching =
    (activeTab === 'offers' && offersRefetching) ||
    (activeTab === 'incoming' && receivedRefetching) ||
    (activeTab === 'outgoing' && proposalsRefetching);

  // Count pending items for badges
  const pendingIncoming =
    receivedProposals?.filter((p) => p.status === 'PENDING').length || 0;
  const activeOffers =
    myOffers?.filter((o) => o.status === 'ACTIVE').length || 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Trades</Text>
        <TouchableOpacity onPress={() => router.push('/marketplace')}>
          <Ionicons name="search" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'offers' && styles.tabActive]}
          onPress={() => setActiveTab('offers')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'offers' && styles.tabTextActive,
            ]}
          >
            My Offers
          </Text>
          {activeOffers > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{activeOffers}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'incoming' && styles.tabActive]}
          onPress={() => setActiveTab('incoming')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'incoming' && styles.tabTextActive,
            ]}
          >
            Incoming
          </Text>
          {pendingIncoming > 0 && (
            <View style={[styles.tabBadge, styles.tabBadgeAlert]}>
              <Text style={styles.tabBadgeText}>{pendingIncoming}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'outgoing' && styles.tabActive]}
          onPress={() => setActiveTab('outgoing')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'outgoing' && styles.tabTextActive,
            ]}
          >
            Outgoing
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor="#4a90d9"
          />
        }
      >
        {isLoading ? (
          <ActivityIndicator color="#4a90d9" style={{ marginTop: 40 }} />
        ) : activeTab === 'offers' ? (
          // My Offers Tab
          <>
            {!myOffers || myOffers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="swap-horizontal" size={48} color="#666" />
                <Text style={styles.emptyTitle}>No trade offers</Text>
                <Text style={styles.emptySubtitle}>
                  Create a trade offer to swap one of your shifts
                </Text>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => router.push('/create-trade')}
                >
                  <Text style={styles.createButtonText}>Create Trade Offer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              myOffers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  onCancel={() => handleCancelOffer(offer.id)}
                  onEdit={() =>
                    router.push({
                      pathname: '/create-trade',
                      params: { editOfferId: offer.id },
                    })
                  }
                />
              ))
            )}
          </>
        ) : activeTab === 'incoming' ? (
          // Incoming Proposals Tab
          <>
            {!receivedProposals || receivedProposals.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="mail-outline" size={48} color="#666" />
                <Text style={styles.emptyTitle}>No incoming proposals</Text>
                <Text style={styles.emptySubtitle}>
                  When someone wants to trade with you, it will appear here
                </Text>
              </View>
            ) : (
              receivedProposals.map((proposal) => (
                <TradeProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  type="incoming"
                  onAccept={() => handleAcceptProposal(proposal.id)}
                  onReject={() => handleRejectProposal(proposal.id)}
                  isAccepting={acceptMutation.isPending}
                  isRejecting={rejectMutation.isPending}
                />
              ))
            )}
          </>
        ) : (
          // Outgoing Proposals Tab
          <>
            {!myProposals || myProposals.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="paper-plane-outline" size={48} color="#666" />
                <Text style={styles.emptyTitle}>No outgoing proposals</Text>
                <Text style={styles.emptySubtitle}>
                  Browse the marketplace to find trades
                </Text>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => router.push('/marketplace')}
                >
                  <Text style={styles.createButtonText}>Browse Marketplace</Text>
                </TouchableOpacity>
              </View>
            ) : (
              myProposals.map((proposal) => (
                <TradeProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  type="outgoing"
                />
              ))
            )}
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* FAB for creating trade */}
      {activeTab === 'offers' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/create-trade')}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function OfferCard({
  offer,
  onCancel,
  onEdit,
}: {
  offer: TradeOffer;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { color: '#22c55e', bg: '#22c55e20' };
      case 'MATCHED':
        return { color: '#4a90d9', bg: '#4a90d920' };
      case 'COMPLETED':
        return { color: '#888', bg: '#88888820' };
      case 'EXPIRED':
        return { color: '#f59e0b', bg: '#f59e0b20' };
      case 'CANCELLED':
        return { color: '#ef4444', bg: '#ef444420' };
      default:
        return { color: '#666', bg: '#66666620' };
    }
  };

  const statusStyle = getStatusStyle(offer.status);

  return (
    <View style={styles.offerCard}>
      <View style={styles.offerHeader}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusStyle.bg },
          ]}
        >
          <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>
            {offer.status}
          </Text>
        </View>
        <Text style={styles.offerDate}>
          Posted {format(parseISO(offer.createdAt), 'MMM d')}
        </Text>
      </View>

      <View style={styles.offerShift}>
        <Text style={styles.offerPosition}>{offer.shift.position}</Text>
        <Text style={styles.offerShiftDate}>
          {format(parseISO(offer.shift.startTime), 'EEE, MMM d')} |{' '}
          {format(parseISO(offer.shift.startTime), 'h:mm a')} -{' '}
          {format(parseISO(offer.shift.endTime), 'h:mm a')}
        </Text>
        <Text style={styles.offerRestaurant}>{offer.shift.restaurant.name}</Text>
      </View>

      <View style={styles.offerStats}>
        <View style={styles.offerStat}>
          <Text style={styles.offerStatValue}>{offer.interestCount}</Text>
          <Text style={styles.offerStatLabel}>Interested</Text>
        </View>
        <View style={styles.offerStat}>
          <Text style={styles.offerStatValue}>{offer.matchCount}</Text>
          <Text style={styles.offerStatLabel}>Proposals</Text>
        </View>
      </View>

      {offer.status === 'ACTIVE' && (
        <View style={styles.offerActions}>
          <TouchableOpacity style={styles.editButton} onPress={onEdit}>
            <Ionicons name="pencil" size={16} color="#4a90d9" />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Ionicons name="close" size={16} color="#ef4444" />
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
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
  // Tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4a90d9',
  },
  tabText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#4a90d9',
  },
  tabBadge: {
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabBadgeAlert: {
    backgroundColor: '#ef4444',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Content
  content: {
    flex: 1,
    padding: 16,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
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
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: '#4a90d9',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Offer Card
  offerCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  offerDate: {
    color: '#666',
    fontSize: 12,
  },
  offerShift: {
    marginBottom: 12,
  },
  offerPosition: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  offerShiftDate: {
    color: '#888',
    fontSize: 14,
    marginBottom: 4,
  },
  offerRestaurant: {
    color: '#666',
    fontSize: 13,
  },
  offerStats: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  offerStat: {},
  offerStatValue: {
    color: '#4a90d9',
    fontSize: 18,
    fontWeight: 'bold',
  },
  offerStatLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  offerActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#4a90d920',
  },
  editButtonText: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#ef444420',
  },
  cancelButtonText: {
    color: '#ef4444',
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
