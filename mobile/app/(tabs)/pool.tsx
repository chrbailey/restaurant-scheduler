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
  Switch,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { poolApi, networkApi, ghostKitchenApi, GhostShift } from '../../src/services/api';
import { useActiveProfile } from '../../src/stores/authStore';
import { useGhostKitchen } from '../../src/hooks/useGhostKitchen';
import GhostKitchenBanner from '../../src/components/GhostKitchenBanner';
import GhostShiftCard from '../../src/components/GhostShiftCard';

/**
 * Pool Screen (Open Shifts)
 *
 * Shows available shifts that workers can claim.
 * Updated to support network shifts with a toggle.
 * Now includes ghost kitchen delivery shifts when ghost mode is active.
 */

interface AvailableShift {
  id: string;
  position: string;
  startTime: string;
  endTime: string;
  hourlyRateOverride: number | null;
  isNetworkShift: boolean;
  isGhostKitchen?: boolean;
  expectedOrderVolume?: 'LOW' | 'MEDIUM' | 'HIGH' | 'SURGE';
  restaurant: {
    id: string;
    name: string;
    timezone: string;
  };
  distance?: number;
  crossTrainingStatus?: 'CERTIFIED' | 'PENDING' | 'NOT_CERTIFIED';
}

export default function PoolScreen() {
  const router = useRouter();
  const activeProfile = useActiveProfile();
  const queryClient = useQueryClient();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [showNetworkShifts, setShowNetworkShifts] = useState(true);
  const [showGhostShiftsOnly, setShowGhostShiftsOnly] = useState(false);

  const { isGhostModeActive } = useGhostKitchen();
  const hasDeliveryPosition = activeProfile?.positions?.includes('DELIVERY_PACK') ?? false;

  const {
    data: shifts,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['available-shifts', activeProfile?.id, showNetworkShifts],
    queryFn: async () => {
      const response = await poolApi.getAvailable({
        includeNetwork: showNetworkShifts,
      });
      return response.data as AvailableShift[];
    },
    enabled: !!activeProfile,
  });

  // Fetch ghost kitchen shifts if applicable
  const {
    data: ghostShifts,
    isLoading: ghostShiftsLoading,
    refetch: refetchGhostShifts,
  } = useQuery({
    queryKey: ['ghost-shifts', activeProfile?.restaurantId],
    queryFn: async () => {
      if (!activeProfile?.restaurantId) return [];
      const response = await ghostKitchenApi.getGhostShifts(activeProfile.restaurantId);
      return response.data;
    },
    enabled: !!activeProfile?.restaurantId && hasDeliveryPosition,
  });

  // Claim ghost shift mutation
  const claimGhostShift = useMutation({
    mutationFn: (shiftId: string) => {
      return ghostKitchenApi.claimGhostShift(activeProfile!.restaurantId, shiftId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ghost-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      Alert.alert('Success', 'Ghost kitchen shift claimed! Waiting for manager approval.');
    },
    onError: (err: any) => {
      Alert.alert(
        'Error',
        err.response?.data?.message || 'Failed to claim shift',
      );
    },
    onSettled: () => {
      setClaimingId(null);
    },
  });

  const claimShift = useMutation({
    mutationFn: (shift: AvailableShift) => {
      // Use appropriate API based on whether it's a network shift
      if (shift.isNetworkShift) {
        // For network shifts, we'd use the network claim endpoint
        // For now, use the standard pool claim
        return poolApi.claim(shift.restaurant.id, shift.id);
      }
      return poolApi.claim(activeProfile!.restaurantId, shift.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['available-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      Alert.alert('Success', 'Shift claimed! Waiting for manager approval.');
    },
    onError: (err: any) => {
      Alert.alert(
        'Error',
        err.response?.data?.message || 'Failed to claim shift',
      );
    },
    onSettled: () => {
      setClaimingId(null);
    },
  });

  const handleClaim = (shift: AvailableShift) => {
    // Check if cross-training is required for network shifts
    if (
      shift.isNetworkShift &&
      shift.crossTrainingStatus !== 'CERTIFIED'
    ) {
      if (shift.crossTrainingStatus === 'PENDING') {
        Alert.alert(
          'Certification Pending',
          `Your cross-training request for ${shift.restaurant.name} is still pending approval.`,
        );
      } else {
        Alert.alert(
          'Certification Required',
          `You need to be cross-trained at ${shift.restaurant.name} before claiming shifts there.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Request Certification',
              onPress: () =>
                router.push({
                  pathname: '/cross-training',
                  params: { restaurantId: shift.restaurant.id },
                }),
            },
          ],
        );
      }
      return;
    }

    const message = shift.isNetworkShift
      ? `This is a shift at ${shift.restaurant.name}, not your home restaurant. Claim the ${shift.position} shift on ${format(parseISO(shift.startTime), 'MMM d')}?`
      : `Claim the ${shift.position} shift on ${format(parseISO(shift.startTime), 'MMM d')} at ${shift.restaurant.name}?`;

    Alert.alert('Claim Shift', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Claim',
        onPress: () => {
          setClaimingId(shift.id);
          claimShift.mutate(shift);
        },
      },
    ]);
  };

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEEE, MMM d');
  };

  // Filter shifts based on ghost filter (moved before usage)
  const displayedShifts = showGhostShiftsOnly
    ? [] // Ghost shifts are shown separately
    : shifts || [];

  // Group shifts by date
  const groupedShifts = (displayedShifts || []).reduce(
    (acc, shift) => {
      const dateKey = format(parseISO(shift.startTime), 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(shift);
      return acc;
    },
    {} as Record<string, AvailableShift[]>,
  );

  // Group ghost shifts by date
  const groupedGhostShifts = (ghostShifts || []).reduce(
    (acc, shift) => {
      const dateKey = format(parseISO(shift.startTime), 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(shift);
      return acc;
    },
    {} as Record<string, GhostShift[]>,
  );

  const sortedDates = Object.keys(groupedShifts).sort();
  const sortedGhostDates = Object.keys(groupedGhostShifts).sort();

  // Handle ghost shift claim
  const handleClaimGhostShift = (shift: GhostShift) => {
    Alert.alert(
      'Claim Ghost Kitchen Shift',
      `Claim the Delivery Packer shift on ${format(parseISO(shift.startTime), 'MMM d')} at ${shift.restaurant.name}?\n\nExpected volume: ${shift.expectedOrderVolume || 'Unknown'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Claim',
          onPress: () => {
            setClaimingId(shift.id);
            claimGhostShift.mutate(shift.id);
          },
        },
      ]
    );
  };

  // Count network vs home shifts
  const networkShiftCount =
    shifts?.filter((s) => s.isNetworkShift).length || 0;
  const homeShiftCount = shifts?.filter((s) => !s.isNetworkShift).length || 0;
  const ghostShiftCount = ghostShifts?.length || 0;

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
          onRefresh={() => {
            refetch();
            if (hasDeliveryPosition) refetchGhostShifts();
          }}
          tintColor="#4a90d9"
        />
      }
    >
      {/* Ghost Kitchen Banner */}
      {isGhostModeActive && hasDeliveryPosition && <GhostKitchenBanner />}

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Available Shifts</Text>
            <Text style={styles.headerSubtitle}>
              Claim shifts that match your skills
            </Text>
          </View>
        </View>

        {/* Network toggle */}
        <View style={styles.networkToggle}>
          <View style={styles.networkToggleInfo}>
            <Ionicons
              name="globe-outline"
              size={20}
              color={showNetworkShifts ? '#4a90d9' : '#666'}
            />
            <View style={styles.networkToggleText}>
              <Text style={styles.networkToggleLabel}>
                Show Network Shifts
              </Text>
              <Text style={styles.networkToggleMeta}>
                {showNetworkShifts
                  ? `${networkShiftCount} from other restaurants`
                  : 'Only showing home restaurant'}
              </Text>
            </View>
          </View>
          <Switch
            value={showNetworkShifts}
            onValueChange={setShowNetworkShifts}
            trackColor={{ false: '#2a2a4e', true: '#4a90d940' }}
            thumbColor={showNetworkShifts ? '#4a90d9' : '#666'}
          />
        </View>

        {/* Ghost shifts filter - only show if worker has DELIVERY_PACK */}
        {hasDeliveryPosition && ghostShiftCount > 0 && (
          <View style={[styles.networkToggle, styles.ghostToggle]}>
            <View style={styles.networkToggleInfo}>
              <MaterialCommunityIcons
                name="ghost"
                size={20}
                color={showGhostShiftsOnly ? '#9333ea' : '#666'}
              />
              <View style={styles.networkToggleText}>
                <Text style={styles.networkToggleLabel}>
                  Ghost Kitchen Only
                </Text>
                <Text style={styles.networkToggleMeta}>
                  {ghostShiftCount} delivery shift{ghostShiftCount !== 1 ? 's' : ''} available
                </Text>
              </View>
            </View>
            <Switch
              value={showGhostShiftsOnly}
              onValueChange={setShowGhostShiftsOnly}
              trackColor={{ false: '#2a2a4e', true: '#9333ea40' }}
              thumbColor={showGhostShiftsOnly ? '#9333ea' : '#666'}
            />
          </View>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{homeShiftCount}</Text>
            <Text style={styles.statLabel}>Home</Text>
          </View>
          {showNetworkShifts && (
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#4a90d9' }]}>
                {networkShiftCount}
              </Text>
              <Text style={styles.statLabel}>Network</Text>
            </View>
          )}
          {hasDeliveryPosition && ghostShiftCount > 0 && (
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#9333ea' }]}>
                {ghostShiftCount}
              </Text>
              <Text style={styles.statLabel}>Ghost</Text>
            </View>
          )}
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{(shifts?.length || 0) + ghostShiftCount}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>
      </View>

      {isLoading || ghostShiftsLoading ? (
        <ActivityIndicator color="#4a90d9" style={{ marginTop: 40 }} />
      ) : sortedDates.length === 0 && sortedGhostDates.length === 0 ? (
        <View style={styles.noShifts}>
          <Ionicons name="calendar-outline" size={48} color="#666" />
          <Text style={styles.noShiftsText}>No open shifts available</Text>
          <Text style={styles.noShiftsSubtext}>
            {showNetworkShifts
              ? 'Check back later for new opportunities'
              : 'Enable network shifts to see more options'}
          </Text>
        </View>
      ) : (
        <>
          {/* Ghost Kitchen Shifts Section - Show first with high priority when active */}
          {hasDeliveryPosition && sortedGhostDates.length > 0 && (
            <View style={styles.ghostSection}>
              <View style={styles.ghostSectionHeader}>
                <MaterialCommunityIcons name="ghost" size={18} color="#9333ea" />
                <Text style={styles.ghostSectionTitle}>Ghost Kitchen Shifts</Text>
                {isGhostModeActive && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}
              </View>

              {sortedGhostDates.map((dateKey) => (
                <View key={`ghost-${dateKey}`} style={styles.dateGroup}>
                  <Text style={[styles.dateLabel, { color: '#9333ea' }]}>
                    {getDateLabel(groupedGhostShifts[dateKey][0].startTime)}
                  </Text>

                  {groupedGhostShifts[dateKey].map((shift) => (
                    <GhostShiftCard
                      key={shift.id}
                      shift={shift}
                      onClaim={() => handleClaimGhostShift(shift)}
                      isClaiming={claimingId === shift.id}
                      isHighPriority={isGhostModeActive}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Regular shifts */}
          {!showGhostShiftsOnly && sortedDates.map((dateKey) => (
            <View key={dateKey} style={styles.dateGroup}>
              <Text style={styles.dateLabel}>
                {getDateLabel(groupedShifts[dateKey][0].startTime)}
              </Text>

              {groupedShifts[dateKey].map((shift) => (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  onClaim={() => handleClaim(shift)}
                  isClaiming={claimingId === shift.id}
                />
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function ShiftCard({
  shift,
  onClaim,
  isClaiming,
}: {
  shift: AvailableShift;
  onClaim: () => void;
  isClaiming: boolean;
}) {
  const isNetworkShift = shift.isNetworkShift;
  const canClaim =
    !isNetworkShift || shift.crossTrainingStatus === 'CERTIFIED';

  return (
    <TouchableOpacity
      style={[styles.shiftCard, isNetworkShift && styles.shiftCardNetwork]}
      onPress={onClaim}
      disabled={isClaiming}
    >
      {/* Network badge */}
      {isNetworkShift && (
        <View style={styles.networkBadgeRow}>
          <View style={styles.networkBadge}>
            <Ionicons name="globe-outline" size={10} color="#fff" />
            <Text style={styles.networkBadgeText}>Network</Text>
          </View>
          {shift.distance !== undefined && (
            <Text style={styles.distanceText}>
              {shift.distance < 1
                ? `${Math.round(shift.distance * 10) / 10} mi`
                : `${Math.round(shift.distance)} mi`}
            </Text>
          )}
        </View>
      )}

      <View style={styles.shiftMain}>
        <View style={styles.shiftTimeBox}>
          <Text style={styles.shiftTimeStart}>
            {format(parseISO(shift.startTime), 'h:mm a')}
          </Text>
          <Text style={styles.shiftTimeTo}>to</Text>
          <Text style={styles.shiftTimeEnd}>
            {format(parseISO(shift.endTime), 'h:mm a')}
          </Text>
        </View>

        <View style={styles.shiftDetails}>
          <Text style={styles.shiftPosition}>{shift.position}</Text>
          <View style={styles.restaurantRow}>
            <Text style={styles.shiftRestaurant}>{shift.restaurant.name}</Text>
          </View>
          {shift.hourlyRateOverride && (
            <Text style={styles.shiftRate}>${shift.hourlyRateOverride}/hr</Text>
          )}
          {isNetworkShift && shift.crossTrainingStatus !== 'CERTIFIED' && (
            <View style={styles.certificationWarning}>
              <Ionicons
                name={
                  shift.crossTrainingStatus === 'PENDING'
                    ? 'time-outline'
                    : 'alert-circle-outline'
                }
                size={12}
                color={
                  shift.crossTrainingStatus === 'PENDING'
                    ? '#f59e0b'
                    : '#ef4444'
                }
              />
              <Text
                style={[
                  styles.certificationWarningText,
                  {
                    color:
                      shift.crossTrainingStatus === 'PENDING'
                        ? '#f59e0b'
                        : '#ef4444',
                  },
                ]}
              >
                {shift.crossTrainingStatus === 'PENDING'
                  ? 'Pending'
                  : 'Certification needed'}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View
        style={[styles.claimButton, !canClaim && styles.claimButtonDisabled]}
      >
        {isClaiming ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.claimButtonText}>
            {canClaim ? 'Claim' : 'View'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
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
  networkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  networkToggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  networkToggleText: {},
  networkToggleLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  networkToggleMeta: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noShifts: {
    alignItems: 'center',
    marginTop: 80,
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
    paddingHorizontal: 32,
  },
  dateGroup: {
    padding: 16,
  },
  dateLabel: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  shiftCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftCardNetwork: {
    borderLeftWidth: 3,
    borderLeftColor: '#4a90d9',
  },
  networkBadgeRow: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4a90d9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  networkBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  distanceText: {
    color: '#888',
    fontSize: 11,
  },
  shiftMain: {
    flex: 1,
    flexDirection: 'row',
  },
  shiftTimeBox: {
    marginRight: 16,
    alignItems: 'center',
  },
  shiftTimeStart: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  shiftTimeTo: {
    color: '#666',
    fontSize: 10,
    marginVertical: 2,
  },
  shiftTimeEnd: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  shiftDetails: {
    flex: 1,
  },
  shiftPosition: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shiftRestaurant: {
    color: '#888',
    fontSize: 14,
  },
  shiftRate: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  certificationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  certificationWarningText: {
    fontSize: 11,
    fontWeight: '500',
  },
  claimButton: {
    backgroundColor: '#4a90d9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  claimButtonDisabled: {
    backgroundColor: '#666',
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  ghostToggle: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#9333ea30',
  },
  ghostSection: {
    marginBottom: 8,
  },
  ghostSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  ghostSectionTitle: {
    color: '#9333ea',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  activeBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  activeBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
