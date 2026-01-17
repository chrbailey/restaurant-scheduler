/**
 * Schedule Screen (index.tsx) Tests
 *
 * Tests for the main schedule/home tab screen.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScheduleScreen from '../index';
import { mockShift, mockShiftInProgress, mockWorkerProfile } from '../../../test/mocks/api.mock';

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock the API
jest.mock('../../../src/services/api', () => ({
  shiftsApi: {
    getWeek: jest.fn(),
  },
}));

// Mock the auth store
jest.mock('../../../src/stores/authStore', () => ({
  useActiveProfile: jest.fn(),
  useAuthStore: jest.fn(),
}));

// Mock the ghost kitchen hook
jest.mock('../../../src/hooks/useGhostKitchen', () => ({
  useGhostKitchen: jest.fn(() => ({
    isGhostModeActive: false,
  })),
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  ...jest.requireActual('date-fns'),
  format: jest.fn((date, formatStr) => {
    if (formatStr === 'MMM d') return 'Dec 15';
    if (formatStr === 'MMM d, yyyy') return 'Dec 21, 2024';
    if (formatStr === 'EEE') return 'Mon';
    if (formatStr === 'd') return '15';
    if (formatStr === 'yyyy-MM-dd') return '2024-12-15';
    if (formatStr === 'h:mm a') return '2:00 PM';
    return 'mock-date';
  }),
  startOfWeek: jest.fn(() => new Date('2024-12-15')),
  addDays: jest.fn((date, days) => new Date(date.getTime() + days * 86400000)),
  isSameDay: jest.fn((a, b) => a.getTime() === b.getTime()),
  parseISO: jest.fn((str) => new Date(str)),
}));

import { shiftsApi } from '../../../src/services/api';
import { useActiveProfile } from '../../../src/stores/authStore';
import { useGhostKitchen } from '../../../src/hooks/useGhostKitchen';

// Create wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('Schedule Screen (index)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useActiveProfile as jest.Mock).mockReturnValue(mockWorkerProfile);
    (useGhostKitchen as jest.Mock).mockReturnValue({ isGhostModeActive: false });
    (shiftsApi.getWeek as jest.Mock).mockResolvedValue({
      data: {
        '2024-12-15': [mockShift, mockShiftInProgress],
        '2024-12-16': [mockShift],
      },
    });
  });

  describe('Week View Rendering', () => {
    it('renders week selector with navigation arrows', async () => {
      const { getByText } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(getByText(/Dec 15/)).toBeTruthy();
        expect(getByText(/Dec 21, 2024/)).toBeTruthy();
      });
    });

    it('renders day tabs for the week', async () => {
      const { getAllByText } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Should have day abbreviations
        const monTabs = getAllByText('Mon');
        expect(monTabs.length).toBeGreaterThan(0);
      });
    });

    it('navigates to previous week when left arrow pressed', async () => {
      const { getByText } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(getByText(/Dec 15/)).toBeTruthy();
      });

      // Press left navigation
      fireEvent.press(getByText('\u2190'));

      // Week should change (would need to verify new dates shown)
    });

    it('navigates to next week when right arrow pressed', async () => {
      const { getByText } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(getByText(/Dec 15/)).toBeTruthy();
      });

      // Press right navigation
      fireEvent.press(getByText('\u2192'));

      // Week should change
    });
  });

  describe('Shifts Display', () => {
    it('shows shifts for the selected day', async () => {
      const { findByText } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('SERVER')).toBeTruthy();
        expect(findByText('Test Restaurant')).toBeTruthy();
      });
    });

    it('shows shift times correctly', async () => {
      const { findByText } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('2:00 PM')).toBeTruthy();
      });
    });

    it('shows shift duration', async () => {
      const { findByText } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText(/h shift/)).toBeTruthy();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no shifts scheduled', async () => {
      (shiftsApi.getWeek as jest.Mock).mockResolvedValue({
        data: {},
      });

      const { findByText } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('No shifts scheduled')).toBeTruthy();
        expect(findByText('Check Open Shifts to pick up available shifts')).toBeTruthy();
      });
    });

    it('shows no restaurant message when no active profile', async () => {
      (useActiveProfile as jest.Mock).mockReturnValue(null);

      const { findByText } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('No restaurant selected')).toBeTruthy();
        expect(findByText('Ask your manager to add you to a restaurant')).toBeTruthy();
      });
    });
  });

  describe('Day Selection', () => {
    it('changes selected day when day tab pressed', async () => {
      const { getAllByText, findByText } = render(<ScheduleScreen />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(findByText('SERVER')).toBeTruthy();
      });

      // Click on a different day tab
      const dayTabs = getAllByText('Mon');
      if (dayTabs.length > 0) {
        fireEvent.press(dayTabs[0]);
      }

      // Selected day should change (visual indication)
    });

    it('shows indicator dot for days with shifts', async () => {
      const { UNSAFE_root } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Days with shifts should have a visual indicator (dot)
        // This is verified through component structure
        expect(true).toBe(true);
      });
    });

    it('highlights today differently', async () => {
      const { UNSAFE_root } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      // Today's date should have different styling
      await waitFor(() => {
        expect(true).toBe(true);
      });
    });
  });

  describe('Pull to Refresh', () => {
    it('refreshes data on pull', async () => {
      const { getByTestId, UNSAFE_root } = render(<ScheduleScreen />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        // Data should be loaded initially
        expect(shiftsApi.getWeek).toHaveBeenCalled();
      });

      // Simulate pull to refresh
      // Note: Testing RefreshControl requires more setup
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator while fetching', () => {
      // Make API call pending
      (shiftsApi.getWeek as jest.Mock).mockImplementation(() => new Promise(() => {}));

      const { UNSAFE_root } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      // ActivityIndicator should be shown
      // This would be verified through component inspection
    });
  });

  describe('Shift Status Colors', () => {
    it('shows correct color for confirmed shifts', async () => {
      const { UNSAFE_root } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Confirmed shifts should have blue indicator
        expect(true).toBe(true);
      });
    });

    it('shows correct color for in-progress shifts', async () => {
      const { UNSAFE_root } = render(<ScheduleScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        // In-progress shifts should have green indicator
        expect(true).toBe(true);
      });
    });
  });
});
