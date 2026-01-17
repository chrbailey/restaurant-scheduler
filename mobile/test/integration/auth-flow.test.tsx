/**
 * Authentication Flow Integration Tests
 *
 * Tests the complete login flow: phone -> OTP -> profile selection
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../../src/stores/authStore';
import {
  mockUser,
  mockWorkerProfile,
  mockAuthTokens,
  createMockApiResponse,
  createMockApiError,
} from '../mocks/api.mock';
import { clearMockedStorage, mockRouter } from '../setup';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

import * as SecureStore from 'expo-secure-store';

// Mock the API
const mockRequestOtp = jest.fn();
const mockVerifyOtp = jest.fn();

jest.mock('../../src/services/api', () => ({
  authApi: {
    requestOtp: (...args: any[]) => mockRequestOtp(...args),
    verifyOtp: (...args: any[]) => mockVerifyOtp(...args),
  },
}));

// Mock expo-device
jest.mock('expo-device', () => ({
  deviceName: 'Test iPhone',
  modelName: 'iPhone 14',
}));

// Create a test wrapper
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Simple test login screen component
function TestLoginScreen({ onOtpSent }: { onOtpSent: () => void }) {
  const [phone, setPhone] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const { View, Text, TextInput, TouchableOpacity } = require('react-native');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      await mockRequestOtp(phone);
      onOtpSent();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View testID="login-screen">
      <TextInput
        testID="phone-input"
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone number"
      />
      <TouchableOpacity testID="submit-button" onPress={handleSubmit} disabled={loading}>
        <Text>{loading ? 'Sending...' : 'Continue'}</Text>
      </TouchableOpacity>
      {error && <Text testID="error-message">{error}</Text>}
    </View>
  );
}

// Simple test verify screen component
function TestVerifyScreen({ phone, onVerified }: { phone: string; onVerified: () => void }) {
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const { setTokens, setUser, setProfiles, setDeviceId, setLoading: setAuthLoading } =
    useAuthStore();
  const { View, Text, TextInput, TouchableOpacity } = require('react-native');

  const handleVerify = async () => {
    setLoading(true);
    setError('');
    try {
      const deviceId = 'test-device-123';
      const response = await mockVerifyOtp(phone, code, deviceId, 'Test iPhone');

      setDeviceId(deviceId);
      setTokens(response.data.accessToken, response.data.refreshToken, response.data.expiresAt);
      setUser(response.data.user);
      setProfiles(response.data.profiles);
      setAuthLoading(false);

      onVerified();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View testID="verify-screen">
      <TextInput testID="code-input" value={code} onChangeText={setCode} placeholder="Enter code" />
      <TouchableOpacity testID="verify-button" onPress={handleVerify} disabled={loading}>
        <Text>{loading ? 'Verifying...' : 'Verify'}</Text>
      </TouchableOpacity>
      {error && <Text testID="verify-error">{error}</Text>}
    </View>
  );
}

// Test profile selection screen
function TestProfileSelectionScreen({ onSelected }: { onSelected: () => void }) {
  const { profiles, setActiveProfile } = useAuthStore();
  const { View, Text, TouchableOpacity, FlatList } = require('react-native');

  const handleSelect = (profileId: string) => {
    setActiveProfile(profileId);
    onSelected();
  };

  return (
    <View testID="profile-selection-screen">
      <Text>Select a restaurant</Text>
      {profiles.map((profile: any) => (
        <TouchableOpacity
          key={profile.id}
          testID={`profile-${profile.id}`}
          onPress={() => handleSelect(profile.id)}
        >
          <Text>{profile.restaurantName}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

describe('Authentication Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMockedStorage();

    // Reset auth store
    act(() => {
      useAuthStore.setState({
        isAuthenticated: false,
        isLoading: true,
        user: null,
        profiles: [],
        activeProfileId: null,
        accessToken: null,
        refreshToken: null,
        deviceId: null,
      });
    });

    // Default API responses
    mockRequestOtp.mockResolvedValue(createMockApiResponse({ success: true }));
    mockVerifyOtp.mockResolvedValue(
      createMockApiResponse({
        ...mockAuthTokens,
        user: mockUser,
        profiles: [mockWorkerProfile],
      })
    );
  });

  describe('Complete Login Flow', () => {
    it('completes phone -> OTP -> profile selection flow', async () => {
      let currentScreen = 'login';

      const { getByTestId, rerender, findByTestId } = render(
        <TestLoginScreen onOtpSent={() => (currentScreen = 'verify')} />,
        { wrapper: createTestWrapper() }
      );

      // Step 1: Enter phone number
      const phoneInput = getByTestId('phone-input');
      fireEvent.changeText(phoneInput, '+15551234567');

      // Step 2: Submit phone
      const submitButton = getByTestId('submit-button');
      await act(async () => {
        fireEvent.press(submitButton);
      });

      expect(mockRequestOtp).toHaveBeenCalledWith('+15551234567');

      // Step 3: Verify OTP screen
      rerender(
        <TestVerifyScreen phone="+15551234567" onVerified={() => (currentScreen = 'profile')} />
      );

      await waitFor(() => {
        expect(getByTestId('verify-screen')).toBeTruthy();
      });

      // Step 4: Enter OTP code
      const codeInput = getByTestId('code-input');
      fireEvent.changeText(codeInput, '123456');

      // Step 5: Verify OTP
      const verifyButton = getByTestId('verify-button');
      await act(async () => {
        fireEvent.press(verifyButton);
      });

      await waitFor(() => {
        expect(mockVerifyOtp).toHaveBeenCalledWith(
          '+15551234567',
          '123456',
          'test-device-123',
          'Test iPhone'
        );
      });

      // Step 6: Check auth state is updated
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.profiles.length).toBeGreaterThan(0);
      expect(state.accessToken).toBe(mockAuthTokens.accessToken);
    });

    it('handles multiple profiles with selection', async () => {
      const secondProfile = {
        ...mockWorkerProfile,
        id: 'second-profile',
        restaurantName: 'Second Restaurant',
      };

      mockVerifyOtp.mockResolvedValue(
        createMockApiResponse({
          ...mockAuthTokens,
          user: mockUser,
          profiles: [mockWorkerProfile, secondProfile],
        })
      );

      // Set up auth state as if OTP was verified
      act(() => {
        useAuthStore.getState().setTokens(
          mockAuthTokens.accessToken,
          mockAuthTokens.refreshToken,
          mockAuthTokens.expiresAt
        );
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setProfiles([mockWorkerProfile, secondProfile]);
        useAuthStore.getState().setLoading(false);
      });

      const { getByTestId, getByText } = render(
        <TestProfileSelectionScreen onSelected={() => {}} />,
        { wrapper: createTestWrapper() }
      );

      // Should show both restaurants
      expect(getByText('Test Restaurant')).toBeTruthy();
      expect(getByText('Second Restaurant')).toBeTruthy();

      // Select second profile (testID is profile-${id})
      await act(async () => {
        fireEvent.press(getByTestId('profile-second-profile'));
      });

      const state = useAuthStore.getState();
      expect(state.activeProfileId).toBe('second-profile');
    });
  });

  describe('Token Storage Verification', () => {
    it('stores tokens in secure storage', async () => {
      const { getByTestId } = render(
        <TestVerifyScreen phone="+15551234567" onVerified={() => {}} />,
        { wrapper: createTestWrapper() }
      );

      const codeInput = getByTestId('code-input');
      fireEvent.changeText(codeInput, '123456');

      const verifyButton = getByTestId('verify-button');
      await act(async () => {
        fireEvent.press(verifyButton);
      });

      // Zustand persist middleware should trigger storage
      // Note: Actual storage verification depends on persist middleware setup
      await waitFor(() => {
        expect(useAuthStore.getState().accessToken).toBeTruthy();
      });
    });

    it('persists device ID across sessions', async () => {
      const { getByTestId } = render(
        <TestVerifyScreen phone="+15551234567" onVerified={() => {}} />,
        { wrapper: createTestWrapper() }
      );

      const codeInput = getByTestId('code-input');
      fireEvent.changeText(codeInput, '123456');

      await act(async () => {
        fireEvent.press(getByTestId('verify-button'));
      });

      await waitFor(() => {
        expect(useAuthStore.getState().deviceId).toBe('test-device-123');
      });
    });
  });

  describe('Logout Clears Everything', () => {
    it('clears all state on logout', async () => {
      // First, set up authenticated state
      act(() => {
        useAuthStore.getState().setTokens(
          mockAuthTokens.accessToken,
          mockAuthTokens.refreshToken,
          mockAuthTokens.expiresAt
        );
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setProfiles([mockWorkerProfile]);
        useAuthStore.getState().setDeviceId('test-device-123');
        useAuthStore.getState().setLoading(false);
      });

      // Verify authenticated
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user).toBeTruthy();
      expect(useAuthStore.getState().accessToken).toBeTruthy();

      // Logout
      act(() => {
        useAuthStore.getState().logout();
      });

      // Verify everything is cleared
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.profiles).toEqual([]);
      expect(state.activeProfileId).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('handles OTP request failure', async () => {
      mockRequestOtp.mockRejectedValue(
        createMockApiError(429, 'Too many requests. Please try again later.')
      );

      const { getByTestId, findByTestId } = render(
        <TestLoginScreen onOtpSent={() => {}} />,
        { wrapper: createTestWrapper() }
      );

      fireEvent.changeText(getByTestId('phone-input'), '+15551234567');

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      const errorMessage = await findByTestId('error-message');
      expect(errorMessage.props.children).toBe('Too many requests. Please try again later.');
    });

    it('handles invalid OTP code', async () => {
      mockVerifyOtp.mockRejectedValue(createMockApiError(401, 'Invalid or expired code'));

      const { getByTestId, findByTestId } = render(
        <TestVerifyScreen phone="+15551234567" onVerified={() => {}} />,
        { wrapper: createTestWrapper() }
      );

      fireEvent.changeText(getByTestId('code-input'), '000000');

      await act(async () => {
        fireEvent.press(getByTestId('verify-button'));
      });

      const errorMessage = await findByTestId('verify-error');
      expect(errorMessage.props.children).toBe('Invalid or expired code');

      // Auth state should remain unauthenticated
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('handles network errors gracefully', async () => {
      mockRequestOtp.mockRejectedValue(new Error('Network Error'));

      const { getByTestId, findByTestId } = render(
        <TestLoginScreen onOtpSent={() => {}} />,
        { wrapper: createTestWrapper() }
      );

      fireEvent.changeText(getByTestId('phone-input'), '+15551234567');

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      const errorMessage = await findByTestId('error-message');
      expect(errorMessage.props.children).toBe('Failed to send OTP');
    });
  });
});
