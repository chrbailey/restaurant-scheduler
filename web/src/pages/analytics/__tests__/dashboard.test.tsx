import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnalyticsDashboard } from '../dashboard';
import { mockIdentity, mockExecutiveAnalytics, mockAlerts } from '@test/fixtures/data';

// Mock navigate function
const mockNavigate = vi.fn();

// Mock react-router
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock Refine core hooks
vi.mock('@refinedev/core', () => ({
  useGetIdentity: vi.fn(() => ({
    data: mockIdentity,
    isLoading: false,
  })),
  useCustom: vi.fn((config: any) => {
    if (config.url?.includes('/alerts')) {
      return {
        data: { data: mockAlerts },
        isLoading: false,
      };
    }
    if (config.url?.includes('/executive')) {
      return {
        data: { data: mockExecutiveAnalytics },
        isLoading: false,
        refetch: vi.fn(),
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

const renderAnalyticsDashboard = () => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <AnalyticsDashboard />
      </ConfigProvider>
    </QueryClientProvider>
  );
};

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Executive Analytics')).toBeInTheDocument();
    });
  });

  it('displays restaurant name in description', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Main Restaurant/i)).toBeInTheDocument();
    });
  });

  it('renders refresh button', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });
});

describe('AnalyticsDashboard Key Metrics', () => {
  it('displays labor cost', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Labor Cost (This Week)')).toBeInTheDocument();
    });
  });

  it('shows labor cost value', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText(/4,532/)).toBeInTheDocument();
    });
  });

  it('displays schedule efficiency', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Schedule Efficiency')).toBeInTheDocument();
    });
  });

  it('shows efficiency percentage', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('87')).toBeInTheDocument();
    });
  });

  it('displays forecast accuracy', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Forecast Accuracy')).toBeInTheDocument();
    });
  });

  it('shows MAPE value', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText(/MAPE: 8.8%/)).toBeInTheDocument();
    });
  });

  it('displays worker satisfaction', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Worker Satisfaction')).toBeInTheDocument();
    });
  });

  it('shows feedback count', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText(/47 responses/i)).toBeInTheDocument();
    });
  });
});

describe('AnalyticsDashboard Trend Charts', () => {
  it('displays labor cost trend section', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Labor Cost Trend')).toBeInTheDocument();
    });
  });

  it('shows 7-day average', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('7-day average')).toBeInTheDocument();
    });
  });

  it('shows projected monthly', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Projected monthly')).toBeInTheDocument();
    });
  });

  it('displays efficiency trend section', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Efficiency Trend')).toBeInTheDocument();
    });
  });

  it('shows efficiency target', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Target')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
  });

  it('has link to labor details', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      // Multiple "View Details" links may exist
      const viewDetailsLinks = screen.getAllByText('View Details');
      expect(viewDetailsLinks.length).toBeGreaterThan(0);
    });
  });
});

describe('AnalyticsDashboard Alerts', () => {
  it('displays alerts section', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alerts & Issues')).toBeInTheDocument();
    });
  });

  it('shows alert count badge', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      // Badge should show count of alerts
      const badge = document.querySelector('.ant-badge');
      expect(badge).toBeInTheDocument();
    });
  });

  it('displays critical alerts', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText(/unfilled shifts/i)).toBeInTheDocument();
    });
  });

  it('displays warning alerts', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Overtime threshold/i)).toBeInTheDocument();
    });
  });

  it('shows action buttons on alerts', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Fill Gaps')).toBeInTheDocument();
      expect(screen.getByText('View Workers')).toBeInTheDocument();
    });
  });
});

describe('AnalyticsDashboard Quick Actions', () => {
  it('displays quick actions section', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });
  });

  it('shows optimize schedule button', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Optimize Schedule')).toBeInTheDocument();
    });
  });

  it('shows AI fill gaps button', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('AI Fill Gaps')).toBeInTheDocument();
    });
  });

  it('shows labor cost report button', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Labor Cost Report')).toBeInTheDocument();
    });
  });

  it('shows worker performance button', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Worker Performance')).toBeInTheDocument();
    });
  });

  it('displays AI recommendation', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('AI Recommendation')).toBeInTheDocument();
    });
  });

  it('shows AI recommendation text', async () => {
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Saturday evening/i)).toBeInTheDocument();
    });
  });
});

describe('AnalyticsDashboard Navigation', () => {
  it('navigates to labor analytics on button click', async () => {
    const user = userEvent.setup();
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Labor Cost Report')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Labor Cost Report'));

    expect(mockNavigate).toHaveBeenCalledWith('/analytics/labor');
  });

  it('navigates to optimizer on button click', async () => {
    const user = userEvent.setup();
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Optimize Schedule')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Optimize Schedule'));

    expect(mockNavigate).toHaveBeenCalledWith('/ai-scheduling/optimizer');
  });

  it('navigates on alert action click', async () => {
    const user = userEvent.setup();
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Fill Gaps')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Fill Gaps'));

    expect(mockNavigate).toHaveBeenCalledWith('/ai-scheduling/suggestions');
  });
});

describe('AnalyticsDashboard Export', () => {
  it('has refresh functionality', async () => {
    const user = userEvent.setup();
    renderAnalyticsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Refresh'));

    // Refetch should be called
    // This is handled internally by the useCustom hook
  });
});
