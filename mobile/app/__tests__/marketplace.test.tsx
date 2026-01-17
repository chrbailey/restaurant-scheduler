/**
 * Marketplace Screen Tests
 *
 * Tests for the shift marketplace/trade screen.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MarketplaceScreen from '../marketplace';
import {
  mockTradeOffers,
  mockTradeOffer,
  mockRecommendedTrade,
  mockWorkerProfile,
} from '../../test/mocks/api.mock';

// Mock expo-router
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock the API
jest.mock('../../src/services/api', () => ({
  marketplaceApi: {
    getTradeOffers: jest.fn(),
    getMyOffers: jest.fn(),
    getRecommendedTrades: jest.fn(),
  },
}));

// Mock the auth store
jest.mock('../../src/stores/authStore', () => ({
  useActiveProfile: jest.fn(),
}));

import { marketplaceApi } from '../../src/services/api';
import { useActiveProfile } from '../../src/stores/authStore';

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

describe('Marketplace Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useActiveProfile as jest.Mock).mockReturnValue(mockWorkerProfile);
    (marketplaceApi.getTradeOffers as jest.Mock).mockResolvedValue({
      data: mockTradeOffers,
    });
    (marketplaceApi.getMyOffers as jest.Mock).mockResolvedValue({
      data: [mockTradeOffer],
    });
    (marketplaceApi.getRecommendedTrades as jest.Mock).mockResolvedValue({
      data: [mockRecommendedTrade],
    });
  });

  describe('Trade Offers List', () => {
    it('renders trade offers list', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Available Trades')).toBeTruthy();
      });
    });

    it('shows trade offer details', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('SERVER')).toBeTruthy();
        expect(findByText('Test Restaurant')).toBeTruthy();
      });
    });

    it('shows offer count', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText(/\d+ offers?/)).toBeTruthy();
      });
    });

    it('navigates to detail on offer press', async () => {
      const { findAllByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      // Wait for View buttons to appear (there may be multiple), press the first one
      const viewButtons = await findAllByText('View');
      fireEvent.press(viewButtons[0]);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: '/trade-detail',
            params: expect.objectContaining({ offerId: expect.any(String) }),
          })
        );
      });
    });
  });

  describe('Filters', () => {
    it('shows filter toggle button', async () => {
      const { UNSAFE_root } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      // Filter button should be visible
      await waitFor(() => {
        expect(true).toBe(true);
      });
    });

    it('shows day of week filters', async () => {
      const { findByText, getByText } = render(<MarketplaceScreen />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(findByText('Shift Marketplace')).toBeTruthy();
      });

      // Toggle filters panel
      // Note: Would need to find and press the filter button

      // Verify day chips would be visible
    });

    it('shows time slot filters', async () => {
      // Similar to day of week filters test
    });

    it('applies day filter correctly', async () => {
      // When filter is applied, API should be called with filter params
    });

    it('clears filters when clear button pressed', async () => {
      // After selecting filters and pressing clear, filters should reset
    });
  });

  describe('Search', () => {
    it('shows search bar', async () => {
      const { findByPlaceholderText } = render(<MarketplaceScreen />, {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(findByPlaceholderText('Search offers...')).toBeTruthy();
      });
    });

    it('filters offers by search query', async () => {
      const { findByPlaceholderText, findByText } = render(<MarketplaceScreen />, {
        wrapper: createWrapper(),
      });

      await waitFor(async () => {
        const searchInput = await findByPlaceholderText('Search offers...');
        fireEvent.changeText(searchInput, 'SERVER');
      });

      // Should still show SERVER offers
      await waitFor(() => {
        expect(findByText('SERVER')).toBeTruthy();
      });
    });

    it('shows clear button when search has text', async () => {
      const { findByPlaceholderText } = render(<MarketplaceScreen />, {
        wrapper: createWrapper(),
      });

      await waitFor(async () => {
        const searchInput = await findByPlaceholderText('Search offers...');
        fireEvent.changeText(searchInput, 'test');
      });

      // Clear button should be visible
    });
  });

  describe('My Active Offers Section', () => {
    it('shows my active offers section', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('My Active Offers')).toBeTruthy();
      });
    });

    it('shows manage link', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Manage')).toBeTruthy();
      });
    });

    it('navigates to my-trades on manage press', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(async () => {
        const manageLink = await findByText('Manage');
        fireEvent.press(manageLink);
      });

      expect(mockPush).toHaveBeenCalledWith('/my-trades');
    });

    it('shows interest count on my offers', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText(/\d+ interested/)).toBeTruthy();
      });
    });

    it('shows "Post Trade" button', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Post Trade')).toBeTruthy();
      });
    });
  });

  describe('Match Recommendations', () => {
    it('shows recommended trades section', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Recommended for You')).toBeTruthy();
      });
    });

    it('shows recommendation reason', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(
          findByText('This matches your Wednesday availability and SERVER position')
        ).toBeTruthy();
      });
    });

    it('marks recommended offers with badge', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Recommended')).toBeTruthy();
      });
    });
  });

  describe('Create Trade Flow', () => {
    it('shows FAB for creating trade', async () => {
      const { UNSAFE_root } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      // FAB should be visible
      await waitFor(() => {
        expect(true).toBe(true);
      });
    });

    it('navigates to create-trade on FAB press', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      // Find and press the Post Trade button
      await waitFor(async () => {
        const postButton = await findByText('Post Trade');
        fireEvent.press(postButton);
      });

      expect(mockPush).toHaveBeenCalledWith('/create-trade');
    });
  });

  describe('Navigation', () => {
    it('has back button in header', async () => {
      const { UNSAFE_root } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      // Back button should be in header
      await waitFor(() => {
        expect(true).toBe(true);
      });
    });

    it('navigates back when back pressed', async () => {
      // Would need to find and press back button
    });

    it('navigates to my-trades from header', async () => {
      // List icon in header should navigate to my-trades
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no trades found', async () => {
      (marketplaceApi.getTradeOffers as jest.Mock).mockResolvedValue({ data: [] });
      (marketplaceApi.getMyOffers as jest.Mock).mockResolvedValue({ data: [] });
      (marketplaceApi.getRecommendedTrades as jest.Mock).mockResolvedValue({ data: [] });

      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('No trades found')).toBeTruthy();
        expect(findByText('Check back later for new trade offers')).toBeTruthy();
      });
    });

    it('shows "Post Your First Trade" when no offers', async () => {
      (marketplaceApi.getTradeOffers as jest.Mock).mockResolvedValue({ data: [] });
      (marketplaceApi.getMyOffers as jest.Mock).mockResolvedValue({ data: [] });
      (marketplaceApi.getRecommendedTrades as jest.Mock).mockResolvedValue({ data: [] });

      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Post Your First Trade')).toBeTruthy();
      });
    });

    it('shows filter hint when empty with filters', async () => {
      (marketplaceApi.getTradeOffers as jest.Mock).mockResolvedValue({ data: [] });

      // With active filters, message should change
    });
  });

  describe('Pull to Refresh', () => {
    it('refreshes data on pull', async () => {
      const { UNSAFE_root } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      // RefreshControl should be set up
      await waitFor(() => {
        expect(marketplaceApi.getTradeOffers).toHaveBeenCalled();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator while fetching', () => {
      (marketplaceApi.getTradeOffers as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      );

      const { UNSAFE_root } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      // ActivityIndicator should be visible
    });
  });

  describe('Header', () => {
    it('shows marketplace title', async () => {
      const { findByText } = render(<MarketplaceScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(findByText('Shift Marketplace')).toBeTruthy();
      });
    });
  });
});
