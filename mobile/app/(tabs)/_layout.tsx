import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useGhostKitchenTabVisible, useGhostKitchen } from '../../src/hooks/useGhostKitchen';
import { paymentsApi } from '../../src/services/api';
import { useActiveProfile } from '../../src/stores/authStore';

type TabBarIconProps = { color: string; size: number; focused?: boolean };

/**
 * Tabs Layout
 *
 * Main tab navigation for the app.
 * Includes: Schedule, Open Shifts (Pool), Wallet, Ghost (conditional), Network, Swaps, and Profile.
 *
 * The Ghost Kitchen tab is only visible when:
 * 1. Worker has DELIVERY_PACK position AND
 * 2. Restaurant has active ghost kitchen session
 */

export default function TabsLayout() {
  const showGhostTab = useGhostKitchenTabVisible();
  const { activeOrders } = useGhostKitchen();
  const activeOrderCount = activeOrders.length;
  const activeProfile = useActiveProfile();

  // Fetch wallet balance for badge
  const { data: balance } = useQuery({
    queryKey: ['earned-balance'],
    queryFn: async () => {
      const response = await paymentsApi.getEarnedBalance();
      return response.data;
    },
    enabled: !!activeProfile,
    staleTime: 60000, // Cache for 1 minute
  });

  // Format balance for badge
  const formatBalanceBadge = (amount?: number) => {
    if (!amount || amount <= 0) return null;
    if (amount >= 100) {
      return `$${Math.floor(amount)}`;
    }
    return `$${amount.toFixed(0)}`;
  };

  const walletBadge = formatBalanceBadge(balance?.available);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4a90d9',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: '#2a2a4e',
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        headerStyle: {
          backgroundColor: '#1a1a2e',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }: TabBarIconProps) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pool"
        options={{
          title: 'Open Shifts',
          tabBarIcon: ({ color, size }: TabBarIconProps) => (
            <Ionicons name="add-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, size, focused }: TabBarIconProps) => (
            <View>
              <MaterialCommunityIcons
                name="wallet"
                size={size}
                color={focused ? '#22c55e' : color}
              />
              {walletBadge && (
                <View style={styles.walletBadge}>
                  <Text style={styles.walletBadgeText}>{walletBadge}</Text>
                </View>
              )}
            </View>
          ),
          tabBarActiveTintColor: '#22c55e',
        }}
      />
      <Tabs.Screen
        name="ghost"
        options={{
          title: 'Ghost',
          href: showGhostTab ? '/(tabs)/ghost' : null, // Hide tab when not applicable
          tabBarIcon: ({ color, size, focused }: TabBarIconProps) => (
            <View>
              <MaterialCommunityIcons
                name="ghost"
                size={size}
                color={focused ? '#9333ea' : color}
              />
              {activeOrderCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {activeOrderCount > 9 ? '9+' : activeOrderCount}
                  </Text>
                </View>
              )}
            </View>
          ),
          tabBarActiveTintColor: '#9333ea',
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: 'Network',
          tabBarIcon: ({ color, size }: TabBarIconProps) => (
            <Ionicons name="globe" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="swaps"
        options={{
          title: 'Swaps',
          tabBarIcon: ({ color, size }: TabBarIconProps) => (
            <Ionicons name="swap-horizontal" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }: TabBarIconProps) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  walletBadge: {
    position: 'absolute',
    top: -6,
    right: -16,
    backgroundColor: '#22c55e',
    borderRadius: 8,
    minWidth: 28,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  walletBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
