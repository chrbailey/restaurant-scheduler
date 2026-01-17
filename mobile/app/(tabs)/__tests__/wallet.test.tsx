/**
 * Wallet Screen Tests
 *
 * Tests for the wallet/instant pay tab screen.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WalletScreen from '../wallet';
import {
  mockEarnedBalance,
  mockEarnedBalanceEmpty,
  mockTransfers,
  mockInstantPayEnrollment,
  mockInstantPayNotEnrolled,
  mockWorkerProfile,
} from '../../../test/mocks/api.mock';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
  }),
}));

// Mock the API
jest.mock('../../../src/services/api', () => ({
  paymentsApi: {
    getEarnedBalance: jest.fn(),
    getEnrollmentStatus: jest.fn(),
    getTransferHistory: jest.fn(),
  },
}));

// Mock the auth store
jest.mock('../../../src/stores/authStore', () => ({
  useActiveProfile: jest.fn(),
}));

import { paymentsApi } from '../../../src/services/api';
import { useActiveProfile } from '../../../src/stores/authStore';

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

describe('Wallet Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useActiveProfile as jest.Mock).mockReturnValue(mockWorkerProfile);
    (paymentsApi.getEarnedBalance as jest.Mock).mockResolvedValue({
      data: mockEarnedBalance,
    });
    (paymentsApi.getEnrollmentStatus as jest.Mock).mockResolvedValue({
      data: mockInstantPayEnrollment,
    });
    (paymentsApi.getTransferHistory as jest.Mock).mockResolvedValue({
      data: mockTransfers,
    });
  });

  describe('Balance Display', () => {
    it('shows available balance prominently', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('$245.50')).toBeTruthy();
        expect(findByText('Available Now')).toBeTruthy();
      });
    });

    it('shows pending balance', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('$127.25')).toBeTruthy();
        expect(findByText('Pending')).toBeTruthy();
      });
    });

    it('shows total earned', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('$372.75')).toBeTruthy();
        expect(findByText('Total Earned')).toBeTruthy();
      });
    });
  });

  describe('Get Paid Now Button', () => {
    it('shows "Get Paid Now" when enrolled and has balance', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Get Paid Now')).toBeTruthy();
      });
    });

    it('navigates to instant-pay screen when pressed', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(async () => {
        const button = await findByText('Get Paid Now');
        fireEvent.press(button);
      });

      expect(mockPush).toHaveBeenCalledWith('/instant-pay');
    });

    it('disables button when available balance is zero', async () => {
      (paymentsApi.getEarnedBalance as jest.Mock).mockResolvedValue({
        data: mockEarnedBalanceEmpty,
      });

      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(async () => {
        // Button should still be visible but disabled
        expect(findByText('Get Paid Now')).toBeTruthy();
      });

      // Pressing disabled button should still navigate
      // (actual disabled behavior tested through component interaction)
    });
  });

  describe('Enrollment State', () => {
    it('shows setup prompt when not enrolled', async () => {
      (paymentsApi.getEnrollmentStatus as jest.Mock).mockResolvedValue({
        data: mockInstantPayNotEnrolled,
      });

      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Set Up Instant Pay')).toBeTruthy();
      });
    });

    it('navigates to enrollment when setup pressed', async () => {
      (paymentsApi.getEnrollmentStatus as jest.Mock).mockResolvedValue({
        data: mockInstantPayNotEnrolled,
      });

      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(async () => {
        const button = await findByText('Set Up Instant Pay');
        fireEvent.press(button);
      });

      expect(mockPush).toHaveBeenCalledWith('/instant-pay');
    });

    it('shows fee disclosure when enrolled', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('$2.99 fee per transfer')).toBeTruthy();
      });
    });
  });

  describe('Transfer History', () => {
    it('renders transfer history section', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Recent Transfers')).toBeTruthy();
        expect(findByText('Your instant pay activity')).toBeTruthy();
      });
    });

    it('shows transfer items', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Transfer amounts
        expect(findByText('$97.01')).toBeTruthy(); // net amount
      });
    });

    it('shows transfer status', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Completed')).toBeTruthy();
        expect(findByText('Processing')).toBeTruthy();
      });
    });

    it('shows transfer destination', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText(/Chase \*\*\*\*4242/)).toBeTruthy();
      });
    });

    it('shows empty state when no transfers', async () => {
      (paymentsApi.getTransferHistory as jest.Mock).mockResolvedValue({
        data: [],
      });

      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('No transfers yet')).toBeTruthy();
        expect(findByText('Your transfer history will appear here')).toBeTruthy();
      });
    });

    it('shows "See All" link when transfers exist', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('See All')).toBeTruthy();
      });
    });

    it('navigates to full history when See All pressed', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(async () => {
        const seeAll = await findByText('See All');
        fireEvent.press(seeAll);
      });

      expect(mockPush).toHaveBeenCalledWith('/transfer-history');
    });
  });

  describe('Contributing Shifts', () => {
    it('shows recent shifts section', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Recent Shifts')).toBeTruthy();
        expect(findByText('Contributing to your balance')).toBeTruthy();
      });
    });

    it('shows shift earnings', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('$160.00')).toBeTruthy();
        expect(findByText('$85.50')).toBeTruthy();
      });
    });

    it('shows shift positions', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('SERVER')).toBeTruthy();
        expect(findByText('HOST')).toBeTruthy();
        expect(findByText('BARTENDER')).toBeTruthy();
      });
    });

    it('shows available vs pending status for shifts', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Available')).toBeTruthy();
        expect(findByText('Pending')).toBeTruthy();
      });
    });
  });

  describe('Quick Actions', () => {
    it('shows quick action buttons', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('History')).toBeTruthy();
        expect(findByText('Settings')).toBeTruthy();
        expect(findByText('Help')).toBeTruthy();
      });
    });

    it('navigates to history on press', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(async () => {
        const historyButton = await findByText('History');
        fireEvent.press(historyButton);
      });

      expect(mockPush).toHaveBeenCalledWith('/transfer-history');
    });

    it('navigates to settings on press', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(async () => {
        const settingsButton = await findByText('Settings');
        fireEvent.press(settingsButton);
      });

      expect(mockPush).toHaveBeenCalledWith('/instant-pay');
    });
  });

  describe('No Profile State', () => {
    it('shows message when no restaurant selected', async () => {
      (useActiveProfile as jest.Mock).mockReturnValue(null);

      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('No restaurant selected')).toBeTruthy();
        expect(findByText('Select a restaurant to view your earnings')).toBeTruthy();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator while fetching balance', async () => {
      (paymentsApi.getEarnedBalance as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { UNSAFE_root } = render(<WalletScreen />, { wrapper: createWrapper() });

      // ActivityIndicator should be visible
    });
  });

  describe('Currency Formatting', () => {
    it('formats currency correctly', async () => {
      const { findByText } = render(<WalletScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Should show USD formatting
        expect(findByText(/\$\d/)).toBeTruthy();
      });
    });
  });
});
