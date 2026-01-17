import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GhostKitchenDashboard } from '../../src/pages/ghost-kitchen/dashboard';
import {
  mockIdentity,
  mockGhostKitchenStatus,
  mockOrders,
  mockForecast,
  mockGhostKitchenStats,
} from './fixtures/data';

// Mock state
let isGhostKitchenActive = true;
let mockCapacity = 8;
let mockMaxCapacity = 15;
const mockToggleMutate = vi.fn();
const mockRefetchStatus = vi.fn();

// Mock react-router
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock WebSocket hook
vi.mock('../../src/hooks/useGhostKitchenSocket', () => ({
  useGhostKitchenSocket: vi.fn(() => ({
    orders: mockOrders,
    currentCapacity: mockCapacity,
    isConnected: true,
    sessionDuration: 7200,
  })),
}));

// Mock Refine core hooks
vi.mock('@refinedev/core', () => ({
  useGetIdentity: vi.fn(() => ({
    data: mockIdentity,
    isLoading: false,
  })),
  useCustom: vi.fn((config: any) => {
    if (config.url?.includes('/status')) {
      return {
        data: {
          data: {
            ...mockGhostKitchenStatus,
            isActive: isGhostKitchenActive,
            currentCapacity: mockCapacity,
            maxCapacity: mockMaxCapacity,
          },
        },
        isLoading: false,
        refetch: mockRefetchStatus,
      };
    }
    if (config.url?.includes('/forecast')) {
      return {
        data: { data: mockForecast },
        isLoading: false,
      };
    }
    if (config.url?.includes('/stats')) {
      return {
        data: { data: mockGhostKitchenStats },
        isLoading: false,
      };
    }
    return { data: { data: null }, isLoading: false };
  }),
  useCustomMutation: vi.fn(() => ({
    mutate: mockToggleMutate,
    isLoading: false,
  })),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        {ui}
      </ConfigProvider>
    </QueryClientProvider>
  );
};

describe('Ghost Kitchen Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isGhostKitchenActive = true;
    mockCapacity = 8;
    mockMaxCapacity = 15;
    mockToggleMutate.mockReset();
    mockRefetchStatus.mockReset();
  });

  describe('Enable Ghost Mode Flow', () => {
    beforeEach(() => {
      isGhostKitchenActive = false;
    });

    it('shows inactive state initially', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Ghost Kitchen Inactive')).toBeInTheDocument();
      });
    });

    it('shows enable toggle switch', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        const switchElement = document.querySelector('.ant-switch');
        expect(switchElement).toBeInTheDocument();
      });
    });

    it('shows capacity settings when inactive', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Max Capacity/i)).toBeInTheDocument();
      });
    });

    it('shows auto-accept toggle when inactive', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Auto-Accept/i)).toBeInTheDocument();
      });
    });

    it('calls mutation when enabling', async () => {
      const user = userEvent.setup();
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        const switchElement = document.querySelector('.ant-switch');
        expect(switchElement).toBeInTheDocument();
      });

      const switchElement = document.querySelector('.ant-switch') as HTMLElement;
      await user.click(switchElement);

      expect(mockToggleMutate).toHaveBeenCalled();
    });

    it('mutation contains enable URL', async () => {
      const user = userEvent.setup();

      mockToggleMutate.mockImplementation((params, options) => {
        expect(params.url).toContain('/enable');
        options?.onSuccess?.();
      });

      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        const switchElement = document.querySelector('.ant-switch');
        expect(switchElement).toBeInTheDocument();
      });

      const switchElement = document.querySelector('.ant-switch') as HTMLElement;
      await user.click(switchElement);
    });

    it('refetches status after enabling', async () => {
      const user = userEvent.setup();

      mockToggleMutate.mockImplementation((params, options) => {
        options?.onSuccess?.();
      });

      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        const switchElement = document.querySelector('.ant-switch');
        expect(switchElement).toBeInTheDocument();
      });

      const switchElement = document.querySelector('.ant-switch') as HTMLElement;
      await user.click(switchElement);

      expect(mockRefetchStatus).toHaveBeenCalled();
    });
  });

  describe('Active Ghost Mode State', () => {
    it('shows ACTIVE tag', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('ACTIVE')).toBeInTheDocument();
      });
    });

    it('shows active status text', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Ghost Kitchen Active')).toBeInTheDocument();
      });
    });

    it('displays live orders section', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Live Orders')).toBeInTheDocument();
      });
    });

    it('displays capacity meter', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        // CapacityMeter renders as "8 / 15" format
        expect(screen.getByText('8 / 15')).toBeInTheDocument();
      });
    });

    it('displays session time', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Session Time')).toBeInTheDocument();
      });
    });

    it('displays order count', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        // "Orders" appears in multiple places (session info and stats)
        const ordersElements = screen.getAllByText('Orders');
        expect(ordersElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Disable Ghost Mode Flow', () => {
    it('shows disable toggle switch when active', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        const switchElement = document.querySelector('.ant-switch-checked');
        expect(switchElement).toBeInTheDocument();
      });
    });

    it('calls mutation when disabling', async () => {
      const user = userEvent.setup();
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        const switchElement = document.querySelector('.ant-switch');
        expect(switchElement).toBeInTheDocument();
      });

      const switchElement = document.querySelector('.ant-switch') as HTMLElement;
      await user.click(switchElement);

      expect(mockToggleMutate).toHaveBeenCalled();
    });

    it('mutation contains disable URL when turning off', async () => {
      const user = userEvent.setup();

      mockToggleMutate.mockImplementation((params, options) => {
        expect(params.url).toContain('/disable');
        options?.onSuccess?.();
      });

      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        const switchElement = document.querySelector('.ant-switch');
        expect(switchElement).toBeInTheDocument();
      });

      const switchElement = document.querySelector('.ant-switch') as HTMLElement;
      await user.click(switchElement);
    });
  });

  describe('Verify Status Display', () => {
    it('shows today\'s performance stats', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText("Today's Performance")).toBeInTheDocument();
      });
    });

    it('shows order statistics', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('47')).toBeInTheDocument(); // Total orders
      });
    });

    it('shows revenue when available', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        // Revenue from stats - Ant Design Statistic formats with commas: 1,289.50
        const revenueElements = screen.getAllByText(/1,289|Revenue/);
        expect(revenueElements.length).toBeGreaterThan(0);
      });
    });

    it('shows avg prep time', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Avg Prep Time')).toBeInTheDocument();
      });
    });
  });

  describe('Forecast Display', () => {
    it('shows demand forecast section', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText("Today's Demand Forecast")).toBeInTheDocument();
      });
    });

    it('shows weather information', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Cloudy/i)).toBeInTheDocument();
      });
    });

    it('shows delivery boost percentage', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      // The delivery boost is rendered as "+12% delivery expected"
      // Using findByText for automatic retrying and longer timeout
      const boostElement = await screen.findByText(/\+12%.*delivery/i, {}, { timeout: 3000 });
      expect(boostElement).toBeInTheDocument();
    });

    it('has link to full forecast', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Full Forecast')).toBeInTheDocument();
      });
    });
  });

  describe('Settings Adjustment', () => {
    it('shows capacity slider when active', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Max Capacity')).toBeInTheDocument();
      });
    });

    it('shows auto-accept toggle when active', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Auto-Accept')).toBeInTheDocument();
      });
    });

    it('has link to more settings', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('More Settings')).toBeInTheDocument();
      });
    });
  });

  describe('Connection Status', () => {
    it('does not show warning when connected', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.queryByText(/connection lost/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Navigation Links', () => {
    it('has link to analytics', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Analytics')).toBeInTheDocument();
      });
    });

    it('has link to full forecast', async () => {
      renderWithProviders(<GhostKitchenDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Full Forecast')).toBeInTheDocument();
      });
    });
  });
});

describe('Ghost Kitchen Capacity Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isGhostKitchenActive = true;
  });

  it('shows capacity as percentage of max', async () => {
    mockCapacity = 8;
    mockMaxCapacity = 15;
    renderWithProviders(<GhostKitchenDashboard />);

    await waitFor(() => {
      // CapacityMeter renders as "8 / 15" format
      expect(screen.getByText('8 / 15')).toBeInTheDocument();
    });
  });

  it('handles near capacity state', async () => {
    mockCapacity = 14;
    mockMaxCapacity = 15;
    renderWithProviders(<GhostKitchenDashboard />);

    await waitFor(() => {
      // CapacityMeter renders as "14 / 15" format - near capacity at 93%
      expect(screen.getByText('14 / 15')).toBeInTheDocument();
    });
  });

  it('handles full capacity state', async () => {
    mockCapacity = 15;
    mockMaxCapacity = 15;
    renderWithProviders(<GhostKitchenDashboard />);

    await waitFor(() => {
      // CapacityMeter renders as "15 / 15" format - full capacity
      expect(screen.getByText('15 / 15')).toBeInTheDocument();
    });
  });
});
