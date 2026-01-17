import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GhostKitchenDashboard } from '../dashboard';
import {
  mockIdentity,
  mockGhostKitchenStatus,
  mockOrders,
  mockForecast,
  mockGhostKitchenStats,
} from '@test/fixtures/data';

// Mock react-router
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock the WebSocket hook
vi.mock('../../../hooks/useGhostKitchenSocket', () => ({
  useGhostKitchenSocket: vi.fn(() => ({
    orders: mockOrders,
    currentCapacity: 8,
    isConnected: true,
    sessionDuration: 7200,
  })),
}));

const mockMutate = vi.fn();

// Mock Refine core hooks
vi.mock('@refinedev/core', () => ({
  useGetIdentity: vi.fn(() => ({
    data: mockIdentity,
    isLoading: false,
  })),
  useCustom: vi.fn((config: any) => {
    if (config.url?.includes('/status')) {
      return {
        data: { data: mockGhostKitchenStatus },
        isLoading: false,
        refetch: vi.fn(),
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
    mutate: mockMutate,
    isLoading: false,
  })),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderDashboard = () => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <GhostKitchenDashboard />
      </ConfigProvider>
    </QueryClientProvider>
  );
};

describe('GhostKitchenDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Ghost Kitchen')).toBeInTheDocument();
    });
  });

  it('displays description text', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Delivery-only mode/i)).toBeInTheDocument();
    });
  });

  it('renders the toggle switch', async () => {
    renderDashboard();

    await waitFor(() => {
      const switchElement = document.querySelector('.ant-switch');
      expect(switchElement).toBeInTheDocument();
    });
  });

  it('shows ACTIVE tag when ghost kitchen is active', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    });
  });

  it('shows active status text', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Ghost Kitchen Active')).toBeInTheDocument();
    });
  });

  it('displays session time when active', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Session Time')).toBeInTheDocument();
    });
  });

  it('displays order count when active', async () => {
    renderDashboard();

    await waitFor(() => {
      // "Orders" appears in multiple places (session info and stats)
      const ordersElements = screen.getAllByText('Orders');
      expect(ordersElements.length).toBeGreaterThan(0);
    });
  });

  it('renders the capacity meter', async () => {
    renderDashboard();

    await waitFor(() => {
      // CapacityMeter renders as "8 / 15" format
      expect(screen.getByText('8 / 15')).toBeInTheDocument();
    });
  });

  it('shows live orders section when active', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Live Orders')).toBeInTheDocument();
    });
  });

  it('displays forecast section', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Today's Demand Forecast")).toBeInTheDocument();
    });
  });

  it('displays performance stats', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Today's Performance")).toBeInTheDocument();
    });
  });

  it('shows weather info in forecast', async () => {
    renderDashboard();

    // Forecast data loads asynchronously - use findByText for automatic retry
    const weatherElement = await screen.findByText(/Cloudy/i, {}, { timeout: 5000 });
    expect(weatherElement).toBeInTheDocument();
  });

  it('shows delivery boost when weather affects delivery', async () => {
    renderDashboard();

    // Delivery boost text: "+12% delivery expected" - use findByText for automatic retry
    const boostElement = await screen.findByText(/\+12%.*delivery/i, {}, { timeout: 5000 });
    expect(boostElement).toBeInTheDocument();
  });
});

describe('GhostKitchenDashboard Toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls mutation when toggle is clicked', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      const switchElement = document.querySelector('.ant-switch');
      expect(switchElement).toBeInTheDocument();
    });

    const switchElement = document.querySelector('.ant-switch') as HTMLElement;
    await user.click(switchElement);

    expect(mockMutate).toHaveBeenCalled();
  });
});

describe('GhostKitchenDashboard Stats', () => {
  it('displays total orders', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('47')).toBeInTheDocument();
    });
  });

  it('displays total revenue', async () => {
    renderDashboard();

    await waitFor(() => {
      // Revenue value from stats - may be formatted with comma (1,289.50)
      const revenueElements = screen.getAllByText(/1,?289/);
      expect(revenueElements.length).toBeGreaterThan(0);
    });
  });

  it('displays avg prep time', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Avg Prep Time')).toBeInTheDocument();
    });
  });

  it('displays comparison to yesterday', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Compared to Yesterday')).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenDashboard Settings', () => {
  it('shows capacity slider when active', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Max Capacity')).toBeInTheDocument();
    });
  });

  it('shows auto-accept toggle when active', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Auto-Accept')).toBeInTheDocument();
    });
  });

  it('has link to more settings', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('More Settings')).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenDashboard Links', () => {
  it('has link to full forecast', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Full Forecast')).toBeInTheDocument();
    });
  });

  it('has link to analytics', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Analytics')).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenDashboard Connection Status', () => {
  it('does not show connection warning when connected', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/connection lost/i)).not.toBeInTheDocument();
    });
  });
});
