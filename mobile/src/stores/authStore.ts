import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

/**
 * Auth Store
 *
 * Manages authentication state with secure token storage.
 * Uses Expo SecureStore for encrypted token persistence.
 */

interface User {
  id: string;
  phone: string;
  email?: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  phoneVerified: boolean;
  locale: string;
  timezone: string;
}

interface WorkerProfile {
  id: string;
  restaurantId: string;
  restaurantName: string;
  role: string;
  positions: string[];
  tier: string;
}

interface AuthState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  profiles: WorkerProfile[];
  activeProfileId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;

  // Actions
  setTokens: (accessToken: string, refreshToken: string, expiresAt: string) => void;
  setUser: (user: User) => void;
  setProfiles: (profiles: WorkerProfile[]) => void;
  setActiveProfile: (profileId: string) => void;
  setDeviceId: (deviceId: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

// Custom storage adapter for Expo SecureStore
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (error) {
      console.error('SecureStore setItem error:', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      console.error('SecureStore removeItem error:', error);
    }
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      isLoading: true,
      user: null,
      profiles: [],
      activeProfileId: null,
      accessToken: null,
      refreshToken: null,
      deviceId: null,

      // Actions
      setTokens: (accessToken, refreshToken, expiresAt) => {
        set({
          accessToken,
          refreshToken,
          isAuthenticated: true,
        });
      },

      setUser: (user) => {
        set({ user });
      },

      setProfiles: (profiles) => {
        set({ profiles });
        // Auto-select first profile if none selected
        if (profiles.length > 0 && !get().activeProfileId) {
          set({ activeProfileId: profiles[0].id });
        }
      },

      setActiveProfile: (profileId) => {
        set({ activeProfileId: profileId });
      },

      setDeviceId: (deviceId) => {
        set({ deviceId });
      },

      logout: () => {
        set({
          isAuthenticated: false,
          user: null,
          profiles: [],
          activeProfileId: null,
          accessToken: null,
          refreshToken: null,
        });
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        deviceId: state.deviceId,
        user: state.user,
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
      }),
    },
  ),
);

// Selectors
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useActiveProfile = () => {
  const profiles = useAuthStore((state) => state.profiles);
  const activeProfileId = useAuthStore((state) => state.activeProfileId);
  return profiles.find((p) => p.id === activeProfileId) || null;
};
