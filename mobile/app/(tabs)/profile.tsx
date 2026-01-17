import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useAuthStore,
  useUser,
  useActiveProfile,
} from '../../src/stores/authStore';
import { authApi, networkApi, paymentsApi } from '../../src/services/api';

/**
 * Profile Screen
 *
 * Shows user profile, current restaurant, stats, and settings.
 * Updated to include network stats section.
 */

interface NetworkStats {
  reputationScore: number;
  totalNetworkShifts: number;
  crossTrainingCount: number;
  networksCount: number;
  reliabilityRating: number;
}

export default function ProfileScreen() {
  const router = useRouter();
  const user = useUser();
  const activeProfile = useActiveProfile();
  const { profiles, setActiveProfile, logout, refreshToken, deviceId } =
    useAuthStore();

  // Fetch network stats
  const { data: networkStats, isLoading: statsLoading } = useQuery({
    queryKey: ['network-stats'],
    queryFn: async () => {
      const response = await networkApi.getNetworkStats();
      return response.data as NetworkStats;
    },
    enabled: !!activeProfile,
  });

  // Fetch cross-training count
  const { data: crossTrainings } = useQuery({
    queryKey: ['my-cross-trainings'],
    queryFn: async () => {
      const response = await networkApi.getMyCrossTrainings();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  // Fetch instant pay enrollment status
  const { data: instantPayEnrollment } = useQuery({
    queryKey: ['instant-pay-enrollment'],
    queryFn: async () => {
      const response = await paymentsApi.getEnrollmentStatus();
      return response.data;
    },
    enabled: !!activeProfile,
  });

  const certifiedCount =
    crossTrainings?.filter((ct: any) => ct.status === 'CERTIFIED').length || 0;

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            if (refreshToken) {
              await authApi.logout(refreshToken);
            }
          } catch (error) {
            console.error('Logout error:', error);
          }
          logout();
        },
      },
    ]);
  };

  const handleSwitchRestaurant = () => {
    if (profiles.length <= 1) {
      Alert.alert('Info', 'You are only a member of one restaurant');
      return;
    }

    Alert.alert(
      'Switch Restaurant',
      'Select a restaurant',
      profiles.map((p) => ({
        text: `${p.restaurantName} (${p.role})`,
        onPress: () => setActiveProfile(p.id),
      })),
    );
  };

  const getReputationColor = (score: number) => {
    if (score >= 90) return '#22c55e';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.firstName?.[0] || '?'}
            {user?.lastName?.[0] || ''}
          </Text>
        </View>
        <Text style={styles.userName}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={styles.userPhone}>{user?.phone}</Text>
      </View>

      {/* Active Restaurant */}
      {activeProfile && (
        <TouchableOpacity
          style={styles.section}
          onPress={handleSwitchRestaurant}
        >
          <View style={styles.sectionIcon}>
            <Ionicons name="restaurant" size={24} color="#4a90d9" />
          </View>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionLabel}>Current Restaurant</Text>
            <Text style={styles.sectionValue}>{activeProfile.restaurantName}</Text>
            <Text style={styles.sectionMeta}>
              {activeProfile.role} - {activeProfile.positions.join(', ')}
            </Text>
          </View>
          {profiles.length > 1 && (
            <Ionicons name="chevron-forward" size={20} color="#666" />
          )}
        </TouchableOpacity>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Shifts This Week</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Hours Worked</Text>
        </View>
      </View>

      {/* Network Stats Section */}
      <View style={styles.networkSection}>
        <View style={styles.networkSectionHeader}>
          <Ionicons name="globe" size={20} color="#4a90d9" />
          <Text style={styles.networkSectionTitle}>Network Stats</Text>
        </View>

        {statsLoading ? (
          <ActivityIndicator color="#4a90d9" style={{ marginVertical: 20 }} />
        ) : (
          <>
            {/* Reputation score */}
            <View style={styles.reputationCard}>
              <View style={styles.reputationMain}>
                <Text style={styles.reputationLabel}>Network Reputation</Text>
                <Text
                  style={[
                    styles.reputationScore,
                    {
                      color: getReputationColor(
                        networkStats?.reputationScore || 0,
                      ),
                    },
                  ]}
                >
                  {networkStats?.reputationScore || 0}
                </Text>
              </View>
              <View style={styles.reputationBar}>
                <View
                  style={[
                    styles.reputationFill,
                    {
                      width: `${networkStats?.reputationScore || 0}%`,
                      backgroundColor: getReputationColor(
                        networkStats?.reputationScore || 0,
                      ),
                    },
                  ]}
                />
              </View>
              <Text style={styles.reputationHint}>
                {(networkStats?.reputationScore || 0) >= 90
                  ? 'Excellent! You are a top performer.'
                  : (networkStats?.reputationScore || 0) >= 70
                    ? 'Good standing. Keep it up!'
                    : 'Build your reputation by completing shifts reliably.'}
              </Text>
            </View>

            {/* Network stats grid */}
            <View style={styles.networkStatsGrid}>
              <View style={styles.networkStatBox}>
                <Text style={styles.networkStatValue}>
                  {networkStats?.totalNetworkShifts || 0}
                </Text>
                <Text style={styles.networkStatLabel}>Network Shifts</Text>
              </View>
              <View style={styles.networkStatBox}>
                <Text style={styles.networkStatValue}>{certifiedCount}</Text>
                <Text style={styles.networkStatLabel}>Certifications</Text>
              </View>
              <View style={styles.networkStatBox}>
                <Text style={styles.networkStatValue}>
                  {networkStats?.networksCount || 0}
                </Text>
                <Text style={styles.networkStatLabel}>Networks</Text>
              </View>
              <View style={styles.networkStatBox}>
                <Text style={styles.networkStatValue}>
                  {networkStats?.reliabilityRating
                    ? `${networkStats.reliabilityRating}%`
                    : '--'}
                </Text>
                <Text style={styles.networkStatLabel}>Reliability</Text>
              </View>
            </View>

            {/* Cross-training link */}
            <TouchableOpacity
              style={styles.crossTrainingLink}
              onPress={() => router.push('/cross-training')}
            >
              <View style={styles.crossTrainingLinkContent}>
                <Ionicons name="school-outline" size={20} color="#4a90d9" />
                <View style={styles.crossTrainingLinkText}>
                  <Text style={styles.crossTrainingLinkTitle}>
                    Cross-Training
                  </Text>
                  <Text style={styles.crossTrainingLinkSubtitle}>
                    {certifiedCount > 0
                      ? `Certified at ${certifiedCount} restaurant${certifiedCount > 1 ? 's' : ''}`
                      : 'Get certified to work at other locations'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Instant Pay Section */}
      <View style={styles.instantPaySection}>
        <View style={styles.instantPayHeader}>
          <MaterialCommunityIcons name="lightning-bolt" size={20} color="#22c55e" />
          <Text style={styles.instantPayTitle}>Instant Pay</Text>
        </View>

        <TouchableOpacity
          style={styles.instantPayCard}
          onPress={() => router.push('/(tabs)/wallet')}
        >
          <View style={styles.instantPayInfo}>
            <View style={styles.instantPayStatus}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: instantPayEnrollment?.isEnrolled
                      ? '#22c55e'
                      : '#f59e0b',
                  },
                ]}
              />
              <Text style={styles.instantPayStatusText}>
                {instantPayEnrollment?.isEnrolled ? 'Enrolled' : 'Not Enrolled'}
              </Text>
            </View>
            {instantPayEnrollment?.isEnrolled && instantPayEnrollment.paymentMethod && (
              <Text style={styles.instantPayMethod}>
                {instantPayEnrollment.paymentMethod.bankName || 'Card'} ****
                {instantPayEnrollment.paymentMethod.last4}
              </Text>
            )}
            {!instantPayEnrollment?.isEnrolled && (
              <Text style={styles.instantPayPrompt}>
                Get access to earned wages before payday
              </Text>
            )}
          </View>
          <View style={styles.instantPayAction}>
            <Text style={styles.instantPayActionText}>
              {instantPayEnrollment?.isEnrolled ? 'Wallet' : 'Set Up'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#4a90d9" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Shift Trading Section */}
      <View style={styles.tradingSection}>
        <View style={styles.tradingSectionHeader}>
          <Ionicons name="swap-horizontal" size={20} color="#4a90d9" />
          <Text style={styles.tradingSectionTitle}>Shift Trading</Text>
        </View>

        <TouchableOpacity
          style={styles.tradingLink}
          onPress={() => router.push('/marketplace')}
        >
          <View style={styles.tradingLinkContent}>
            <Ionicons name="storefront-outline" size={20} color="#4a90d9" />
            <View style={styles.tradingLinkText}>
              <Text style={styles.tradingLinkTitle}>Trade Marketplace</Text>
              <Text style={styles.tradingLinkSubtitle}>
                Browse and post shift trades
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tradingLink}
          onPress={() => router.push('/my-trades')}
        >
          <View style={styles.tradingLinkContent}>
            <Ionicons name="list-outline" size={20} color="#4a90d9" />
            <View style={styles.tradingLinkText}>
              <Text style={styles.tradingLinkTitle}>My Trades</Text>
              <Text style={styles.tradingLinkSubtitle}>
                Manage offers and proposals
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Menu Items */}
      <View style={styles.menu}>
        <MenuItem
          icon="calendar-outline"
          label="Availability"
          onPress={() => {}}
        />
        <MenuItem
          icon="notifications-outline"
          label="Notification Settings"
          onPress={() => {}}
        />
        <MenuItem
          icon="help-circle-outline"
          label="Help & Support"
          onPress={() => {}}
        />
        <MenuItem
          icon="document-text-outline"
          label="Terms of Service"
          onPress={() => {}}
        />
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Version 1.0.0</Text>
    </ScrollView>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon as any} size={22} color="#888" />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#666" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4a90d9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  userName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userPhone: {
    color: '#666',
    fontSize: 14,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  sectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4a90d920',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  sectionContent: {
    flex: 1,
  },
  sectionLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 2,
  },
  sectionValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    color: '#666',
    fontSize: 12,
  },
  // Network stats section
  networkSection: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  networkSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  networkSectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reputationCard: {
    marginBottom: 16,
  },
  reputationMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reputationLabel: {
    color: '#888',
    fontSize: 13,
  },
  reputationScore: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  reputationBar: {
    height: 6,
    backgroundColor: '#2a2a4e',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  reputationFill: {
    height: '100%',
    borderRadius: 3,
  },
  reputationHint: {
    color: '#666',
    fontSize: 12,
  },
  networkStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  networkStatBox: {
    width: '47%',
    backgroundColor: '#0f0f23',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  networkStatValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  networkStatLabel: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  crossTrainingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f0f23',
    borderRadius: 8,
    padding: 12,
  },
  crossTrainingLinkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  crossTrainingLinkText: {},
  crossTrainingLinkTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  crossTrainingLinkSubtitle: {
    color: '#666',
    fontSize: 12,
  },
  // Instant Pay Section
  instantPaySection: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  instantPayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  instantPayTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  instantPayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f0f23',
    borderRadius: 8,
    padding: 12,
  },
  instantPayInfo: {},
  instantPayStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  instantPayStatusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  instantPayMethod: {
    color: '#888',
    fontSize: 12,
  },
  instantPayPrompt: {
    color: '#666',
    fontSize: 12,
  },
  instantPayAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  instantPayActionText: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '500',
  },
  // Trading Section
  tradingSection: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  tradingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tradingSectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  tradingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f0f23',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  tradingLinkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tradingLinkText: {},
  tradingLinkTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  tradingLinkSubtitle: {
    color: '#666',
    fontSize: 12,
  },
  menu: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  menuLabel: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    marginLeft: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    paddingVertical: 14,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  version: {
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 48,
  },
});
