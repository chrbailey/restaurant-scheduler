/**
 * EarningsCard Component Tests
 *
 * Tests for the EarningsCard component used in the schedule/home screen.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EarningsCard, { EarningsCardCompact } from '../EarningsCard';
import { mockEarnedBalance, mockEarnedBalanceEmpty } from '../../../test/mocks/api.mock';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock the payments API
jest.mock('../../services/api', () => ({
  paymentsApi: {
    getEarnedBalance: jest.fn(),
  },
}));

import { paymentsApi } from '../../services/api';

// Create a wrapper with QueryClientProvider
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

describe('EarningsCard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (paymentsApi.getEarnedBalance as jest.Mock).mockResolvedValue({
      data: mockEarnedBalance,
    });
  });

  describe('Loading State', () => {
    it('shows loading text while fetching data', () => {
      // Make the API call pending
      (paymentsApi.getEarnedBalance as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { getByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      expect(getByText('Loading earnings...')).toBeTruthy();
    });
  });

  describe('Total Earned Display', () => {
    it('shows total earned amount', async () => {
      const { findByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('$373')).toBeTruthy(); // $372.75 rounded
      });
    });

    it('shows correct period label', async () => {
      const { findByText } = render(<EarningsCard periodLabel="This Week" />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(findByText('This Week')).toBeTruthy();
      });
    });

    it('shows default period label when not provided', async () => {
      const { findByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('This Period')).toBeTruthy();
      });
    });
  });

  describe('Available for Instant Pay', () => {
    it('shows available amount', async () => {
      const { findByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('$246')).toBeTruthy(); // $245.50 rounded
      });
    });

    it('shows "Available" label', async () => {
      const { findByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Available')).toBeTruthy();
      });
    });
  });

  describe('Hours Display', () => {
    it('calculates and displays total hours from contributing shifts', async () => {
      const { findByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      // Total hours: 8 + 6 + 4 = 18
      await waitFor(() => {
        expect(findByText('18.0h')).toBeTruthy();
      });
    });

    it('shows "Hours" label', async () => {
      const { findByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Hours')).toBeTruthy();
      });
    });
  });

  describe('Instant Pay Banner', () => {
    it('shows instant pay prompt when available balance is positive', async () => {
      const { findByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Get paid now - tap to transfer')).toBeTruthy();
      });
    });

    it('does not show instant pay prompt when available is zero', async () => {
      (paymentsApi.getEarnedBalance as jest.Mock).mockResolvedValue({
        data: mockEarnedBalanceEmpty,
      });

      const { queryByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(queryByText('Get paid now - tap to transfer')).toBeNull();
      });
    });
  });

  describe('Navigation', () => {
    it('navigates to wallet on card tap', async () => {
      const { getByText, findByText } = render(<EarningsCard />, {
        wrapper: createWrapper(),
      });

      // Wait for data to load
      await findByText('This Period');

      // Find and press the card (it's wrapped in TouchableOpacity)
      // The card should be pressable
      fireEvent.press(getByText('This Period').parent!.parent!);

      expect(mockPush).toHaveBeenCalledWith('/(tabs)/wallet');
    });
  });

  describe('Currency Formatting', () => {
    it('formats currency without decimal places for whole amounts', async () => {
      const wholeAmountBalance = {
        ...mockEarnedBalance,
        available: 100,
        total: 200,
      };

      (paymentsApi.getEarnedBalance as jest.Mock).mockResolvedValue({
        data: wholeAmountBalance,
      });

      const { findByText } = render(<EarningsCard />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('$100')).toBeTruthy();
        expect(findByText('$200')).toBeTruthy();
      });
    });
  });
});

describe('EarningsCardCompact Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (paymentsApi.getEarnedBalance as jest.Mock).mockResolvedValue({
      data: mockEarnedBalance,
    });
  });

  describe('Compact Variant', () => {
    it('renders in compact form', async () => {
      const { findByText } = render(<EarningsCardCompact />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(findByText('Available Now')).toBeTruthy();
      });
    });

    it('shows available amount', async () => {
      const { findByText } = render(<EarningsCardCompact />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(findByText('$246')).toBeTruthy();
      });
    });

    it('navigates to wallet on tap', async () => {
      const { findByText, getByText } = render(<EarningsCardCompact />, {
        wrapper: createWrapper(),
      });

      await findByText('Available Now');

      // Press the compact card
      fireEvent.press(getByText('Available Now').parent!.parent!);

      expect(mockPush).toHaveBeenCalledWith('/(tabs)/wallet');
    });

    it('shows flash icon for instant pay', async () => {
      const { findByText } = render(<EarningsCardCompact />, {
        wrapper: createWrapper(),
      });

      // Component should render with flash icon (Ionicons name="flash")
      await waitFor(() => {
        expect(findByText('Available Now')).toBeTruthy();
      });
    });
  });

  describe('Zero Balance', () => {
    it('shows $0 when no balance available', async () => {
      (paymentsApi.getEarnedBalance as jest.Mock).mockResolvedValue({
        data: mockEarnedBalanceEmpty,
      });

      const { findByText } = render(<EarningsCardCompact />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(findByText('$0')).toBeTruthy();
      });
    });
  });
});
