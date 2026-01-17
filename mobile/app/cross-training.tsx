import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { networkApi } from '../src/services/api';
import { useActiveProfile } from '../src/stores/authStore';
import CrossTrainingBadge, {
  CrossTrainingCard,
  CrossTrainingStatus,
} from '../src/components/CrossTrainingBadge';

/**
 * Cross-Training Management Screen
 *
 * Shows cross-training status at all network restaurants.
 * Allows requesting certification for new restaurants.
 */

interface CrossTraining {
  id: string;
  restaurantId: string;
  restaurantName: string;
  status: CrossTrainingStatus;
  positions: string[];
  requestedAt?: string;
  certifiedAt?: string;
  expiresAt?: string;
  requirements?: string[];
}

interface NetworkRestaurant {
  id: string;
  name: string;
  availablePositions: string[];
  requirements?: string[];
  crossTrainingStatus?: CrossTrainingStatus;
}

const COMMON_POSITIONS = [
  'Server',
  'Bartender',
  'Host',
  'Busser',
  'Food Runner',
  'Line Cook',
  'Prep Cook',
  'Dishwasher',
  'Barback',
  'Expo',
];

export default function CrossTrainingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeProfile = useActiveProfile();
  const params = useLocalSearchParams<{ restaurantId?: string }>();

  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<NetworkRestaurant | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);

  // Fetch all cross-training certifications
  const {
    data: crossTrainings,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['my-cross-trainings'],
    queryFn: async () => {
      const response = await networkApi.getMyCrossTrainings();
      return response.data as CrossTraining[];
    },
    enabled: !!activeProfile,
  });

  // Fetch network restaurants for requesting new certifications
  const { data: networks } = useQuery({
    queryKey: ['my-networks'],
    queryFn: async () => {
      const response = await networkApi.getMyNetworks();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  const { data: allRestaurants } = useQuery({
    queryKey: ['all-network-restaurants', networks?.[0]?.id],
    queryFn: async () => {
      if (!networks?.[0]) return [];
      const response = await networkApi.getNetworkRestaurants(networks[0].id);
      return response.data as NetworkRestaurant[];
    },
    enabled: !!networks?.[0],
  });

  // Request certification mutation
  const requestCertification = useMutation({
    mutationFn: ({
      restaurantId,
      positions,
    }: {
      restaurantId: string;
      positions: string[];
    }) => networkApi.requestCrossTraining(restaurantId, positions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cross-trainings'] });
      queryClient.invalidateQueries({ queryKey: ['network-restaurants'] });
      Alert.alert(
        'Request Submitted',
        'Your cross-training request has been sent to the restaurant manager for review.',
      );
      setRequestModalVisible(false);
      setSelectedRestaurant(null);
      setSelectedPositions([]);
    },
    onError: (err: any) => {
      Alert.alert(
        'Request Failed',
        err.response?.data?.message || 'Failed to submit request',
      );
    },
  });

  // Handle deep link to specific restaurant
  useEffect(() => {
    if (params.restaurantId && allRestaurants) {
      const restaurant = allRestaurants.find(
        (r) => r.id === params.restaurantId,
      );
      if (restaurant) {
        handleRequestCertification(restaurant);
      }
    }
  }, [params.restaurantId, allRestaurants]);

  const handleRequestCertification = (restaurant: NetworkRestaurant) => {
    setSelectedRestaurant(restaurant);
    setSelectedPositions([]);
    setRequestModalVisible(true);
  };

  const handleSubmitRequest = () => {
    if (!selectedRestaurant || selectedPositions.length === 0) {
      Alert.alert('Select Positions', 'Please select at least one position');
      return;
    }

    requestCertification.mutate({
      restaurantId: selectedRestaurant.id,
      positions: selectedPositions,
    });
  };

  const togglePosition = (position: string) => {
    setSelectedPositions((prev) =>
      prev.includes(position)
        ? prev.filter((p) => p !== position)
        : [...prev, position],
    );
  };

  // Group cross-trainings by status
  const certifiedTrainings =
    crossTrainings?.filter((ct) => ct.status === 'CERTIFIED') || [];
  const pendingTrainings =
    crossTrainings?.filter((ct) => ct.status === 'PENDING') || [];

  // Get restaurants without cross-training
  const uncertifiedRestaurants =
    allRestaurants?.filter(
      (r) =>
        r.id !== activeProfile?.restaurantId &&
        !crossTrainings?.some((ct) => ct.restaurantId === r.id),
    ) || [];

  if (!activeProfile) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No restaurant selected</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Cross-Training',
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
        }}
      />

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
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="school" size={32} color="#4a90d9" />
          </View>
          <Text style={styles.headerTitle}>Cross-Training</Text>
          <Text style={styles.headerSubtitle}>
            Get certified to work at other restaurants in your network
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color="#4a90d9" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Certified */}
            {certifiedTrainings.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#22c55e"
                  />
                  <Text style={styles.sectionTitle}>Certified</Text>
                  <Text style={styles.sectionCount}>
                    {certifiedTrainings.length}
                  </Text>
                </View>

                {certifiedTrainings.map((ct) => (
                  <CrossTrainingCard
                    key={ct.id}
                    status={ct.status}
                    restaurantName={ct.restaurantName}
                    positions={ct.positions}
                    certifiedSince={
                      ct.certifiedAt
                        ? format(parseISO(ct.certifiedAt), 'MMM d, yyyy')
                        : undefined
                    }
                  />
                ))}
              </View>
            )}

            {/* Pending */}
            {pendingTrainings.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="time" size={20} color="#f59e0b" />
                  <Text style={styles.sectionTitle}>Pending Approval</Text>
                  <Text style={styles.sectionCount}>
                    {pendingTrainings.length}
                  </Text>
                </View>

                {pendingTrainings.map((ct) => (
                  <CrossTrainingCard
                    key={ct.id}
                    status={ct.status}
                    restaurantName={ct.restaurantName}
                    positions={ct.positions}
                    pendingSince={
                      ct.requestedAt
                        ? format(parseISO(ct.requestedAt), 'MMM d, yyyy')
                        : undefined
                    }
                  />
                ))}
              </View>
            )}

            {/* Available to Request */}
            {uncertifiedRestaurants.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="add-circle" size={20} color="#4a90d9" />
                  <Text style={styles.sectionTitle}>Available</Text>
                  <Text style={styles.sectionCount}>
                    {uncertifiedRestaurants.length}
                  </Text>
                </View>

                {uncertifiedRestaurants.map((restaurant) => (
                  <CrossTrainingCard
                    key={restaurant.id}
                    status="NOT_CERTIFIED"
                    restaurantName={restaurant.name}
                    onRequestCertification={() =>
                      handleRequestCertification(restaurant)
                    }
                  />
                ))}
              </View>
            )}

            {/* Empty state */}
            {certifiedTrainings.length === 0 &&
              pendingTrainings.length === 0 &&
              uncertifiedRestaurants.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="school-outline" size={48} color="#666" />
                  <Text style={styles.emptyStateText}>
                    No other restaurants in your network
                  </Text>
                  <Text style={styles.emptyStateSubtext}>
                    When your network expands, you can request certification
                    here
                  </Text>
                </View>
              )}
          </>
        )}
      </ScrollView>

      {/* Request Certification Modal */}
      <Modal
        visible={requestModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRequestModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setRequestModalVisible(false)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Request Certification</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedRestaurant && (
              <>
                <View style={styles.modalRestaurant}>
                  <Text style={styles.modalRestaurantName}>
                    {selectedRestaurant.name}
                  </Text>
                  <Text style={styles.modalRestaurantSubtext}>
                    Select the positions you want to be certified for
                  </Text>
                </View>

                {/* Requirements if any */}
                {selectedRestaurant.requirements &&
                  selectedRestaurant.requirements.length > 0 && (
                    <View style={styles.requirementsBox}>
                      <View style={styles.requirementsHeader}>
                        <Ionicons
                          name="information-circle"
                          size={18}
                          color="#f59e0b"
                        />
                        <Text style={styles.requirementsTitle}>
                          Requirements
                        </Text>
                      </View>
                      {selectedRestaurant.requirements.map((req, index) => (
                        <Text key={index} style={styles.requirementItem}>
                          - {req}
                        </Text>
                      ))}
                    </View>
                  )}

                {/* Position selection */}
                <Text style={styles.positionsLabel}>Positions</Text>
                <View style={styles.positionsGrid}>
                  {(selectedRestaurant.availablePositions?.length > 0
                    ? selectedRestaurant.availablePositions
                    : COMMON_POSITIONS
                  ).map((position) => {
                    const isSelected = selectedPositions.includes(position);
                    return (
                      <TouchableOpacity
                        key={position}
                        style={[
                          styles.positionChip,
                          isSelected && styles.positionChipSelected,
                        ]}
                        onPress={() => togglePosition(position)}
                      >
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color="#fff"
                            style={{ marginRight: 4 }}
                          />
                        )}
                        <Text
                          style={[
                            styles.positionChipText,
                            isSelected && styles.positionChipTextSelected,
                          ]}
                        >
                          {position}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                selectedPositions.length === 0 && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitRequest}
              disabled={
                selectedPositions.length === 0 ||
                requestCertification.isPending
              }
            >
              {requestCertification.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>
                  Request Certification ({selectedPositions.length} positions)
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
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
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4a90d920',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  sectionCount: {
    color: '#888',
    fontSize: 14,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
    gap: 12,
  },
  emptyStateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyStateSubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalRestaurant: {
    marginBottom: 24,
  },
  modalRestaurantName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalRestaurantSubtext: {
    color: '#888',
    fontSize: 14,
  },
  requirementsBox: {
    backgroundColor: '#f59e0b15',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  requirementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  requirementsTitle: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
  },
  requirementItem: {
    color: '#888',
    fontSize: 13,
    marginBottom: 4,
    paddingLeft: 8,
  },
  positionsLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  positionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  positionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  positionChipSelected: {
    backgroundColor: '#4a90d9',
    borderColor: '#4a90d9',
  },
  positionChipText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  positionChipTextSelected: {
    color: '#fff',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  submitButton: {
    backgroundColor: '#4a90d9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#666',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
