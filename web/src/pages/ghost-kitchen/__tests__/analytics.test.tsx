import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GhostKitchenAnalytics } from '../analytics';
import { mockIdentity, mockGhostKitchenAnalytics } from '@test/fixtures/data';

// Mock react-router
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock Refine core hooks
vi.mock('@refinedev/core', () => ({
  useGetIdentity: vi.fn(() => ({
    data: mockIdentity,
    isLoading: false,
  })),
  useCustom: vi.fn((config: any) => {
    if (config.url?.includes('/analytics/platforms')) {
      return {
        data: {
          data: {
            platforms: [
              {
                platform: 'DoorDash',
                orders: 22,
                revenue: 598.0,
                fees: 89.7,
                feePercent: 15,
                netRevenue: 508.3,
                avgOrderValue: 27.18,
              },
              {
                platform: 'UberEats',
                orders: 15,
                revenue: 421.5,
                fees: 84.3,
                feePercent: 20,
                netRevenue: 337.2,
                avgOrderValue: 28.1,
              },
            ],
          },
        },
        isLoading: false,
      };
    }
    if (config.url?.includes('/analytics/accuracy')) {
      return {
        data: {
          data: {
            overallAccuracy: 87,
            dailyComparison: [
              { x: 'Mon', predicted: 45, actual: 42 },
              { x: 'Tue', predicted: 48, actual: 50 },
              { x: 'Wed', predicted: 52, actual: 49 },
            ],
            insights: [
              'Predictions are most accurate during lunch hours',
              'Weather significantly impacts delivery demand',
            ],
          },
        },
        isLoading: false,
      };
    }
    if (config.url?.includes('/analytics')) {
      return {
        data: { data: mockGhostKitchenAnalytics },
        isLoading: false,
      };
    }
    return { data: { data: null }, isLoading: false };
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderAnalytics = () => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <GhostKitchenAnalytics />
      </ConfigProvider>
    </QueryClientProvider>
  );
};

describe('GhostKitchenAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the analytics page', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Ghost Kitchen Analytics')).toBeInTheDocument();
    });
  });

  it('displays description text', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText(/P&L analysis/i)).toBeInTheDocument();
    });
  });

  it('renders date range filter', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('This Week')).toBeInTheDocument();
      expect(screen.getByText('This Month')).toBeInTheDocument();
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenAnalytics Revenue Card', () => {
  it('displays total revenue', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getAllByText('Revenue').length).toBeGreaterThan(0);
    });
  });

  it('shows revenue amount', async () => {
    renderAnalytics();

    await waitFor(() => {
      // Total revenue from analytics
      const revenueText = screen.getByText(/4,580/);
      expect(revenueText).toBeInTheDocument();
    });
  });

  it('displays revenue breakdown by platform', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('By Platform')).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenAnalytics Costs Card', () => {
  it('displays costs section', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Costs')).toBeInTheDocument();
    });
  });

  it('shows total costs', async () => {
    renderAnalytics();

    await waitFor(() => {
      // Total costs
      const costsText = screen.getByText(/2,890/);
      expect(costsText).toBeInTheDocument();
    });
  });

  it('displays cost breakdown', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Labor')).toBeInTheDocument();
      expect(screen.getByText('Supplies/Packaging')).toBeInTheDocument();
      expect(screen.getAllByText('Platform Fees').length).toBeGreaterThan(0);
    });
  });
});

describe('GhostKitchenAnalytics Profit Card', () => {
  it('displays net profit', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Net Profit')).toBeInTheDocument();
    });
  });

  it('shows profit margin', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Profit Margin')).toBeInTheDocument();
    });
  });

  it('displays profit change vs previous period', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText(/vs. Previous Period/i)).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenAnalytics Performance Metrics', () => {
  it('displays total orders', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Total Orders')).toBeInTheDocument();
    });
  });

  it('displays average prep time', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Avg Prep Time')).toBeInTheDocument();
    });
  });

  it('displays average order value', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Avg Order Value')).toBeInTheDocument();
    });
  });

  it('displays orders per hour', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Orders/Hour (avg)')).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenAnalytics Capacity Utilization', () => {
  it('displays capacity utilization section', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Capacity Utilization')).toBeInTheDocument();
    });
  });

  it('shows average utilization percentage', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Average Utilization')).toBeInTheDocument();
    });
  });

  it('displays peak hours', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Peak Hours')).toBeInTheDocument();
    });
  });

  it('shows optimization tip', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText(/Optimal utilization/i)).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenAnalytics Platform Comparison', () => {
  it('displays platform comparison table', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Platform Comparison')).toBeInTheDocument();
    });
  });

  it('shows platform names', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getAllByText('DoorDash').length).toBeGreaterThan(0);
      expect(screen.getAllByText('UberEats').length).toBeGreaterThan(0);
    });
  });

  it('displays fee percentages', async () => {
    renderAnalytics();

    await waitFor(() => {
      // Column for Fee %
      expect(screen.getByText('Fee %')).toBeInTheDocument();
    });
  });

  it('shows net revenue column', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Net Revenue')).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenAnalytics Forecast Accuracy', () => {
  it('displays forecast accuracy section', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Forecast Accuracy')).toBeInTheDocument();
    });
  });

  it('shows overall accuracy', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Overall Accuracy')).toBeInTheDocument();
    });
  });

  it('displays insights when available', async () => {
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Insights')).toBeInTheDocument();
    });
  });
});

describe('GhostKitchenAnalytics Date Filter', () => {
  it('allows switching between date ranges', async () => {
    const user = userEvent.setup();
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('This Week')).toBeInTheDocument();
    });

    // Click on "This Month"
    await user.click(screen.getByText('This Month'));

    // The segmented control should update
    expect(screen.getByText('This Month')).toBeInTheDocument();
  });

  it('shows date picker for custom range', async () => {
    const user = userEvent.setup();
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    // Click on "Custom"
    await user.click(screen.getByText('Custom'));

    // RangePicker should appear
    await waitFor(() => {
      const rangePicker = document.querySelector('.ant-picker-range');
      expect(rangePicker).toBeInTheDocument();
    });
  });
});
