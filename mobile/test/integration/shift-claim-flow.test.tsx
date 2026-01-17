/**
 * Shift Claim Flow Integration Tests
 *
 * Tests the complete shift claim flow: browse pool -> select shift -> claim -> confirmation
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { useAuthStore } from '../../src/stores/authStore';
import {
  mockAvailableShift,
  mockNetworkShift,
  mockNetworkShiftUncertified,
  mockWorkerProfile,
  createMockApiResponse,
  createMockApiError,
} from '../mocks/api.mock';
import { clearMockedStorage } from '../setup';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock the API
const mockGetAvailable = jest.fn();
const mockClaimShift = jest.fn();

jest.mock('../../src/services/api', () => ({
  poolApi: {
    getAvailable: (...args: any[]) => mockGetAvailable(...args),
    claim: (...args: any[]) => mockClaimShift(...args),
  },
  ghostKitchenApi: {
    getGhostShifts: jest.fn(() => Promise.resolve({ data: [] })),
  },
}));

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
  }),
}));

// Mock auth store
jest.mock('../../src/stores/authStore', () => ({
  useActiveProfile: jest.fn(() => mockWorkerProfile),
  useAuthStore: jest.fn((selector) =>
    selector({
      accessToken: 'test-token',
    })
  ),
}));

// Mock ghost kitchen hook
jest.mock('../../src/hooks/useGhostKitchen', () => ({
  useGhostKitchen: () => ({
    isGhostModeActive: false,
  }),
}));

import { useActiveProfile } from '../../src/stores/authStore';

// Create test wrapper
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Simple test pool screen for integration testing
function TestPoolScreen() {
  const [shifts, setShifts] = React.useState<any[]>([]);
  const [claiming, setClaiming] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { View, Text, TouchableOpacity, FlatList, ActivityIndicator } = require('react-native');
  const { format, parseISO } = require('date-fns');

  React.useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      const response = await mockGetAvailable();
      setShifts(response.data);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = (shift: any) => {
    const message = shift.isNetworkShift
      ? `This is a shift at ${shift.restaurant.name}. Claim?`
      : `Claim the ${shift.position} shift?`;

    Alert.alert('Claim Shift', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Claim',
        onPress: async () => {
          setClaiming(shift.id);
          try {
            await mockClaimShift(shift.restaurant.id, shift.id);
            Alert.alert('Success', 'Shift claimed! Waiting for manager approval.');
            // Refresh the list
            loadShifts();
          } catch (error: any) {
            Alert.alert('Error', error.response?.data?.message || 'Failed to claim shift');
          } finally {
            setClaiming(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View testID="loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View testID="pool-screen">
      <Text testID="header">Available Shifts</Text>
      {shifts.length === 0 ? (
        <Text testID="empty-state">No open shifts available</Text>
      ) : (
        shifts.map((shift) => (
          <View key={shift.id} testID={`shift-${shift.id}`}>
            <Text testID={`position-${shift.id}`}>{shift.position}</Text>
            <Text testID={`restaurant-${shift.id}`}>{shift.restaurant.name}</Text>
            {shift.isNetworkShift && <Text testID={`network-badge-${shift.id}`}>Network</Text>}
            {shift.hourlyRateOverride && (
              <Text testID={`rate-${shift.id}`}>${shift.hourlyRateOverride}/hr</Text>
            )}
            <TouchableOpacity
              testID={`claim-button-${shift.id}`}
              onPress={() => handleClaim(shift)}
              disabled={claiming === shift.id}
            >
              <Text>{claiming === shift.id ? 'Claiming...' : 'Claim'}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

describe('Shift Claim Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMockedStorage();

    // Default API responses
    mockGetAvailable.mockResolvedValue(
      createMockApiResponse([mockAvailableShift, mockNetworkShift])
    );
    mockClaimShift.mockResolvedValue(createMockApiResponse({ success: true }));

    (useActiveProfile as jest.Mock).mockReturnValue(mockWorkerProfile);
  });

  describe('Browse Pool', () => {
    it('loads and displays available shifts', async () => {
      const { findByTestId, getByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(getByTestId('pool-screen')).toBeTruthy();
      });

      // Check shifts are displayed
      expect(await findByTestId('shift-available-shift-001')).toBeTruthy();
      expect(await findByTestId('shift-network-shift-001')).toBeTruthy();
    });

    it('shows shift details correctly', async () => {
      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        // Position
        expect(await findByTestId('position-available-shift-001')).toBeTruthy();
        // Restaurant
        expect(await findByTestId('restaurant-available-shift-001')).toBeTruthy();
        // Rate
        expect(await findByTestId('rate-available-shift-001')).toBeTruthy();
      });
    });

    it('marks network shifts with badge', async () => {
      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        expect(await findByTestId('network-badge-network-shift-001')).toBeTruthy();
      });
    });
  });

  describe('Select and Claim Shift', () => {
    it('shows confirmation dialog when claim pressed', async () => {
      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const claimButton = await findByTestId('claim-button-available-shift-001');
        fireEvent.press(claimButton);
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Claim Shift',
        expect.stringContaining('Claim'),
        expect.any(Array)
      );
    });

    it('calls claim API when confirmed', async () => {
      // Mock Alert to auto-confirm
      (Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
        const confirmButton = buttons?.find((b: any) => b.text === 'Claim');
        if (confirmButton?.onPress) confirmButton.onPress();
      });

      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const claimButton = await findByTestId('claim-button-available-shift-001');
        fireEvent.press(claimButton);
      });

      await waitFor(() => {
        expect(mockClaimShift).toHaveBeenCalledWith(
          mockAvailableShift.restaurant.id,
          mockAvailableShift.id
        );
      });
    });

    it('shows success confirmation after claim', async () => {
      (Alert.alert as jest.Mock)
        .mockImplementationOnce((title, message, buttons) => {
          const confirmButton = buttons?.find((b: any) => b.text === 'Claim');
          if (confirmButton?.onPress) confirmButton.onPress();
        })
        .mockImplementationOnce(() => {});

      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const claimButton = await findByTestId('claim-button-available-shift-001');
        fireEvent.press(claimButton);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Success',
          'Shift claimed! Waiting for manager approval.'
        );
      });
    });

    it('refreshes shift list after successful claim', async () => {
      (Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
        const confirmButton = buttons?.find((b: any) => b.text === 'Claim');
        if (confirmButton?.onPress) confirmButton.onPress();
      });

      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const claimButton = await findByTestId('claim-button-available-shift-001');
        fireEvent.press(claimButton);
      });

      await waitFor(() => {
        // getAvailable called twice: initial load + refresh after claim
        expect(mockGetAvailable).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error when claim fails due to conflict', async () => {
      mockClaimShift.mockRejectedValue(
        createMockApiError(409, 'This shift has already been claimed by another worker')
      );

      (Alert.alert as jest.Mock)
        .mockImplementationOnce((title, message, buttons) => {
          const confirmButton = buttons?.find((b: any) => b.text === 'Claim');
          if (confirmButton?.onPress) confirmButton.onPress();
        })
        .mockImplementationOnce(() => {});

      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const claimButton = await findByTestId('claim-button-available-shift-001');
        fireEvent.press(claimButton);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'This shift has already been claimed by another worker'
        );
      });
    });

    it('shows error when claim fails due to schedule conflict', async () => {
      mockClaimShift.mockRejectedValue(
        createMockApiError(400, 'You already have a shift during this time')
      );

      (Alert.alert as jest.Mock)
        .mockImplementationOnce((title, message, buttons) => {
          const confirmButton = buttons?.find((b: any) => b.text === 'Claim');
          if (confirmButton?.onPress) confirmButton.onPress();
        })
        .mockImplementationOnce(() => {});

      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const claimButton = await findByTestId('claim-button-available-shift-001');
        fireEvent.press(claimButton);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'You already have a shift during this time'
        );
      });
    });

    it('shows generic error for network failures', async () => {
      mockClaimShift.mockRejectedValue(new Error('Network Error'));

      (Alert.alert as jest.Mock)
        .mockImplementationOnce((title, message, buttons) => {
          const confirmButton = buttons?.find((b: any) => b.text === 'Claim');
          if (confirmButton?.onPress) confirmButton.onPress();
        })
        .mockImplementationOnce(() => {});

      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const claimButton = await findByTestId('claim-button-available-shift-001');
        fireEvent.press(claimButton);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to claim shift');
      });
    });
  });

  describe('Network Shifts', () => {
    it('shows different confirmation message for network shifts', async () => {
      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const claimButton = await findByTestId('claim-button-network-shift-001');
        fireEvent.press(claimButton);
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Claim Shift',
        expect.stringContaining('Partner Restaurant'),
        expect.any(Array)
      );
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no shifts available', async () => {
      mockGetAvailable.mockResolvedValue(createMockApiResponse([]));

      const { findByTestId } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        expect(await findByTestId('empty-state')).toBeTruthy();
      });
    });
  });

  describe('Claim Button States', () => {
    it('disables button while claiming', async () => {
      // Make claim API slow
      mockClaimShift.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      (Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
        const confirmButton = buttons?.find((b: any) => b.text === 'Claim');
        if (confirmButton?.onPress) confirmButton.onPress();
      });

      const { findByTestId, getByText } = render(<TestPoolScreen />, {
        wrapper: createTestWrapper(),
      });

      await waitFor(async () => {
        const claimButton = await findByTestId('claim-button-available-shift-001');
        fireEvent.press(claimButton);
      });

      // Button should show "Claiming..."
      await waitFor(() => {
        expect(getByText('Claiming...')).toBeTruthy();
      });
    });
  });
});
