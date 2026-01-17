import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { marketplaceApi, TradeOffer, TradeMatch } from '../src/services/api';
import { useActiveProfile } from '../src/stores/authStore';

/**
 * Trade Detail Screen
 *
 * Shows full details of a trade offer and allows proposing a trade.
 */

export default function TradeDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const activeProfile = useActiveProfile();

  const [showProposalForm, setShowProposalForm] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  // Fetch offer details
  const {
    data: offer,
    isLoading: offerLoading,
  } = useQuery({
    queryKey: ['trade-offer', offerId],
    queryFn: async () => {
      const response = await marketplaceApi.getOffer(offerId!);
      return response.data;
    },
    enabled: !!offerId,
  });

  // Fetch compatible matches
  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ['trade-matches', offerId],
    queryFn: async () => {
      const response = await marketplaceApi.getMatchesForOffer(offerId!);
      return response.data;
    },
    enabled: !!offerId,
  });

  // Express interest mutation
  const interestMutation = useMutation({
    mutationFn: async () => {
      await marketplaceApi.expressInterest(offerId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade-offer', offerId] });
      Alert.alert('Success', 'You expressed interest in this offer');
    },
    onError: (error: any) => {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to express interest');
    },
  });

  // Propose trade mutation
  const proposeMutation = useMutation({
    mutationFn: async (data: { shiftId: string; message?: string }) => {
      const response = await marketplaceApi.proposeTrade(
        offerId!,
        data.shiftId,
        data.message,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade-offer', offerId] });
      queryClient.invalidateQueries({ queryKey: ['my-proposals'] });
      Alert.alert('Success', 'Your trade proposal has been sent!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (error: any) => {
      Alert.alert(
        'Error',
        error?.response?.data?.message || 'Failed to send proposal',
      );
    },
  });

  const handlePropose = () => {
    if (!selectedShiftId) {
      Alert.alert('Select a Shift', 'Please select one of your shifts to trade');
      return;
    }
    proposeMutation.mutate({
      shiftId: selectedShiftId,
      message: message.trim() || undefined,
    });
  };

  const formatPreferences = (prefs: TradeOffer['preferences']) => {
    const parts: string[] = [];
    if (prefs.daysOfWeek?.length) {
      parts.push(prefs.daysOfWeek.map((d) => d.slice(0, 3)).join(', '));
    }
    if (prefs.timeSlots?.length) {
      parts.push(prefs.timeSlots.map((s) => s.toLowerCase()).join(', '));
    }
    return parts.join(' | ') || 'Any';
  };

  const isLoading = offerLoading || matchesLoading;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trade Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#4a90d9" size="large" />
        </View>
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trade Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>Offer not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Offer Card */}
        <View style={styles.offerCard}>
          <View style={styles.offerHeader}>
            <View style={styles.offerBadge}>
              <Ionicons name="swap-horizontal" size={14} color="#fff" />
              <Text style={styles.offerBadgeText}>Trade Offer</Text>
            </View>
            {offer.status !== 'ACTIVE' && (
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      offer.status === 'MATCHED' ? '#22c55e20' : '#f59e0b20',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color:
                        offer.status === 'MATCHED' ? '#22c55e' : '#f59e0b',
                    },
                  ]}
                >
                  {offer.status}
                </Text>
              </View>
            )}
          </View>

          {/* Shift Details */}
          <View style={styles.shiftSection}>
            <Text style={styles.shiftLabel}>Offering:</Text>
            <Text style={styles.shiftPosition}>{offer.shift.position}</Text>
            <Text style={styles.shiftDate}>
              {format(parseISO(offer.shift.startTime), 'EEEE, MMMM d, yyyy')}
            </Text>
            <Text style={styles.shiftTime}>
              {format(parseISO(offer.shift.startTime), 'h:mm a')} -{' '}
              {format(parseISO(offer.shift.endTime), 'h:mm a')}
            </Text>
            <Text style={styles.shiftRestaurant}>
              {offer.shift.restaurant.name}
            </Text>
          </View>

          {/* Worker Info */}
          <View style={styles.workerSection}>
            <View style={styles.workerAvatar}>
              <Text style={styles.workerAvatarText}>
                {offer.worker.firstName[0]}
                {offer.worker.lastName[0]}
              </Text>
            </View>
            <View style={styles.workerInfo}>
              <Text style={styles.workerName}>
                {offer.worker.firstName} {offer.worker.lastName}
              </Text>
              <Text style={styles.workerMeta}>
                Posted {format(parseISO(offer.createdAt), 'MMM d')}
              </Text>
            </View>
          </View>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Looking For</Text>
          <View style={styles.preferencesCard}>
            {offer.preferences.daysOfWeek?.length ? (
              <View style={styles.prefRow}>
                <Ionicons name="calendar-outline" size={18} color="#4a90d9" />
                <Text style={styles.prefText}>
                  {offer.preferences.daysOfWeek.join(', ')}
                </Text>
              </View>
            ) : null}
            {offer.preferences.timeSlots?.length ? (
              <View style={styles.prefRow}>
                <Ionicons name="time-outline" size={18} color="#4a90d9" />
                <Text style={styles.prefText}>
                  {offer.preferences.timeSlots
                    .map((s) => s.charAt(0) + s.slice(1).toLowerCase())
                    .join(', ')}
                </Text>
              </View>
            ) : null}
            {offer.preferences.flexibleOnDates && (
              <View style={styles.prefRow}>
                <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                <Text style={styles.prefText}>Flexible on exact dates</Text>
              </View>
            )}
            {offer.preferences.notes && (
              <View style={styles.notesRow}>
                <Text style={styles.notesLabel}>Notes:</Text>
                <Text style={styles.notesText}>{offer.preferences.notes}</Text>
              </View>
            )}
            {!offer.preferences.daysOfWeek?.length &&
              !offer.preferences.timeSlots?.length &&
              !offer.preferences.notes && (
                <Text style={styles.noPrefs}>Open to any offers</Text>
              )}
          </View>
        </View>

        {/* Interest Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{offer.interestCount}</Text>
            <Text style={styles.statLabel}>Interested</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{offer.matchCount}</Text>
            <Text style={styles.statLabel}>Proposals</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {Math.max(
                0,
                Math.ceil(
                  (new Date(offer.expiresAt).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24),
                ),
              )}
            </Text>
            <Text style={styles.statLabel}>Days Left</Text>
          </View>
        </View>

        {/* Compatible Shifts */}
        {matches && matches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Compatible Shifts</Text>
            <Text style={styles.sectionSubtitle}>
              These shifts match what they're looking for
            </Text>
            {matches.map((match) => (
              <TouchableOpacity
                key={match.id}
                style={[
                  styles.matchCard,
                  selectedShiftId === match.shift.id && styles.matchCardSelected,
                ]}
                onPress={() => {
                  setSelectedShiftId(match.shift.id);
                  setShowProposalForm(true);
                }}
              >
                <View style={styles.matchInfo}>
                  <Text style={styles.matchPosition}>{match.shift.position}</Text>
                  <Text style={styles.matchDate}>
                    {format(parseISO(match.shift.startTime), 'EEE, MMM d')} |{' '}
                    {format(parseISO(match.shift.startTime), 'h:mm a')} -{' '}
                    {format(parseISO(match.shift.endTime), 'h:mm a')}
                  </Text>
                </View>
                <View style={styles.matchScore}>
                  <Text style={styles.matchScoreValue}>
                    {Math.round(match.compatibilityScore * 100)}%
                  </Text>
                  <Text style={styles.matchScoreLabel}>match</Text>
                </View>
                {selectedShiftId === match.shift.id && (
                  <Ionicons name="checkmark-circle" size={24} color="#4a90d9" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Proposal Form */}
        {showProposalForm && selectedShiftId && (
          <View style={styles.proposalForm}>
            <Text style={styles.proposalTitle}>Add a Message (Optional)</Text>
            <TextInput
              style={styles.proposalInput}
              placeholder="Introduce yourself or explain why you want to trade..."
              placeholderTextColor="#666"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={3}
            />
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {offer.status === 'ACTIVE' && (
            <>
              {matches && matches.length > 0 ? (
                <TouchableOpacity
                  style={[
                    styles.proposeButton,
                    !selectedShiftId && styles.proposeButtonDisabled,
                    proposeMutation.isPending && styles.proposeButtonDisabled,
                  ]}
                  onPress={handlePropose}
                  disabled={!selectedShiftId || proposeMutation.isPending}
                >
                  {proposeMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="swap-horizontal" size={20} color="#fff" />
                      <Text style={styles.proposeButtonText}>Propose Trade</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.interestButton,
                    interestMutation.isPending && styles.interestButtonDisabled,
                  ]}
                  onPress={() => interestMutation.mutate()}
                  disabled={interestMutation.isPending}
                >
                  {interestMutation.isPending ? (
                    <ActivityIndicator color="#4a90d9" />
                  ) : (
                    <>
                      <Ionicons name="heart-outline" size={20} color="#4a90d9" />
                      <Text style={styles.interestButtonText}>
                        I'm Interested
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* No Compatible Shifts Message */}
        {matches && matches.length === 0 && (
          <View style={styles.noMatchesCard}>
            <Ionicons name="information-circle" size={24} color="#f59e0b" />
            <View style={styles.noMatchesInfo}>
              <Text style={styles.noMatchesTitle}>
                No compatible shifts found
              </Text>
              <Text style={styles.noMatchesText}>
                You don't have any upcoming shifts that match their preferences.
                You can still express interest to be notified if they become
                flexible.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    color: '#888',
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  // Offer Card
  offerCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4a90d930',
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  offerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4a90d9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  offerBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  // Shift Section
  shiftSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  shiftLabel: {
    color: '#888',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  shiftPosition: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  shiftDate: {
    color: '#4a90d9',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  shiftTime: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  shiftRestaurant: {
    color: '#666',
    fontSize: 13,
  },
  // Worker
  workerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  workerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4a90d9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  workerAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  workerInfo: {},
  workerName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  workerMeta: {
    color: '#666',
    fontSize: 12,
  },
  // Section
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 13,
    marginBottom: 12,
  },
  // Preferences
  preferencesCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  prefText: {
    color: '#fff',
    fontSize: 14,
  },
  notesRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  notesLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  notesText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  noPrefs: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2a2a4e',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  // Matches
  matchCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  matchCardSelected: {
    borderColor: '#4a90d9',
    backgroundColor: '#4a90d920',
  },
  matchInfo: {
    flex: 1,
  },
  matchPosition: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  matchDate: {
    color: '#888',
    fontSize: 13,
  },
  matchScore: {
    alignItems: 'center',
    marginRight: 12,
  },
  matchScoreValue: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  matchScoreLabel: {
    color: '#666',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  // Proposal Form
  proposalForm: {
    marginBottom: 16,
  },
  proposalTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  proposalInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // Actions
  actions: {
    marginBottom: 16,
  },
  proposeButton: {
    backgroundColor: '#4a90d9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  proposeButtonDisabled: {
    opacity: 0.5,
  },
  proposeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  interestButton: {
    backgroundColor: '#4a90d920',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4a90d950',
  },
  interestButtonDisabled: {
    opacity: 0.5,
  },
  interestButtonText: {
    color: '#4a90d9',
    fontSize: 16,
    fontWeight: '600',
  },
  // No Matches
  noMatchesCard: {
    backgroundColor: '#f59e0b20',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  noMatchesInfo: {
    flex: 1,
  },
  noMatchesTitle: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  noMatchesText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
  bottomSpacer: {
    height: 40,
  },
});
