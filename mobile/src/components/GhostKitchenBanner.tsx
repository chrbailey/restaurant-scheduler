import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useGhostKitchen } from '../hooks/useGhostKitchen';

/**
 * GhostKitchenBanner Component
 *
 * Attention-grabbing banner shown on schedule/pool screens when ghost mode is active.
 * Features:
 * - Animated glow effect
 * - Shows active order count
 * - Tap to navigate to ghost tab
 */

interface GhostKitchenBannerProps {
  onPress?: () => void;
}

export default function GhostKitchenBanner({ onPress }: GhostKitchenBannerProps) {
  const router = useRouter();
  const { isGhostModeActive, activeOrders, pendingOrderCount } = useGhostKitchen();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for urgency
  useEffect(() => {
    if (!isGhostModeActive) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    return () => pulse.stop();
  }, [isGhostModeActive, pulseAnim]);

  // Glow animation
  useEffect(() => {
    if (!isGhostModeActive) return;

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    glow.start();
    return () => glow.stop();
  }, [isGhostModeActive, glowAnim]);

  // Don't render if ghost mode is not active
  if (!isGhostModeActive) {
    return null;
  }

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push('/(tabs)/ghost');
    }
  };

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      {/* Animated glow background */}
      <Animated.View style={[styles.glowBackground, { opacity: glowOpacity }]} />

      <TouchableOpacity
        style={styles.touchable}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.leftSection}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name="ghost" size={24} color="#fff" />
            <View style={styles.pulsingDot} />
          </View>
          <View>
            <Text style={styles.title}>Ghost Kitchen Active</Text>
            <Text style={styles.subtitle}>
              {pendingOrderCount > 0
                ? `${pendingOrderCount} new order${pendingOrderCount > 1 ? 's' : ''} waiting!`
                : 'Claim delivery shifts now'}
            </Text>
          </View>
        </View>

        <View style={styles.rightSection}>
          {activeOrders.length > 0 && (
            <View style={styles.orderBadge}>
              <Text style={styles.orderCount}>{activeOrders.length}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  glowBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#9333ea',
  },
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#9333ea',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulsingDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#9333ea',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    marginTop: 2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderBadge: {
    backgroundColor: '#fff',
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  orderCount: {
    color: '#9333ea',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
