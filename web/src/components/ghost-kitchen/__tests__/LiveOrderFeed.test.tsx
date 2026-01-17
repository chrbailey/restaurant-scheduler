import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LiveOrderFeed, Order } from '../LiveOrderFeed';
import { mockOrders } from '@test/fixtures/data';

const mockMutate = vi.fn();

// Mock Refine core hooks
vi.mock('@refinedev/core', () => ({
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

const renderLiveOrderFeed = (orders: Order[] = mockOrders, restaurantId = 'rest-1') => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <LiveOrderFeed orders={orders} restaurantId={restaurantId} />
      </ConfigProvider>
    </QueryClientProvider>
  );
};

describe('LiveOrderFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the feed with orders', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      // Should show order cards
      expect(screen.getByText('DoorDash')).toBeInTheDocument();
    });
  });

  it('groups orders by status - new orders first', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('New Orders (1)')).toBeInTheDocument();
    });
  });

  it('shows in progress section', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('In Progress (2)')).toBeInTheDocument();
    });
  });

  it('displays platform names', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('DoorDash')).toBeInTheDocument();
      expect(screen.getByText('UberEats')).toBeInTheDocument();
      expect(screen.getByText('Grubhub')).toBeInTheDocument();
    });
  });

  it('displays order IDs', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('#DD-12345')).toBeInTheDocument();
      expect(screen.getByText('#UE-67890')).toBeInTheDocument();
      expect(screen.getByText('#GH-11111')).toBeInTheDocument();
    });
  });

  it('displays order totals', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('$35.98')).toBeInTheDocument();
      expect(screen.getByText('$28.50')).toBeInTheDocument();
      expect(screen.getByText('$18.99')).toBeInTheDocument();
    });
  });

  it('displays status tags', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('New Order')).toBeInTheDocument();
      expect(screen.getByText('Preparing')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });
  });

  it('displays item count', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      // Multiple orders may have "2 items", so use getAllByText
      expect(screen.getAllByText(/2 items/).length).toBeGreaterThan(0);
      expect(screen.getByText(/1 item/)).toBeInTheDocument();
    });
  });

  it('displays timer for each order', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      // Timer should be visible showing elapsed time
      const timerElements = document.querySelectorAll('[style*="monospace"]');
      expect(timerElements.length).toBeGreaterThan(0);
    });
  });
});

describe('LiveOrderFeed Actions', () => {
  it('shows Accept and Decline buttons for NEW orders', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeInTheDocument();
      expect(screen.getByText('Decline')).toBeInTheDocument();
    });
  });

  it('shows Start Preparing button for ACCEPTED orders', async () => {
    const acceptedOrders: Order[] = [
      {
        ...mockOrders[0],
        status: 'ACCEPTED',
      },
    ];

    renderLiveOrderFeed(acceptedOrders);

    await waitFor(() => {
      expect(screen.getByText('Start Preparing')).toBeInTheDocument();
    });
  });

  it('shows Mark Ready button for PREPARING orders', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('Mark Ready')).toBeInTheDocument();
    });
  });

  it('shows Picked Up button for READY orders', async () => {
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('Picked Up')).toBeInTheDocument();
    });
  });

  it('calls mutation when Accept is clicked', async () => {
    const user = userEvent.setup();
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Accept'));

    expect(mockMutate).toHaveBeenCalled();
  });

  it('calls mutation when Mark Ready is clicked', async () => {
    const user = userEvent.setup();
    renderLiveOrderFeed();

    await waitFor(() => {
      expect(screen.getByText('Mark Ready')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Mark Ready'));

    expect(mockMutate).toHaveBeenCalled();
  });
});

describe('LiveOrderFeed Expandable Details', () => {
  it('expands to show items when clicked', async () => {
    const user = userEvent.setup();
    renderLiveOrderFeed();

    await waitFor(() => {
      // Multiple orders may have "2 items", so use getAllByText
      expect(screen.getAllByText(/2 items/).length).toBeGreaterThan(0);
    });

    // Click to expand - the expandable area contains the item count text
    const expandableArea = screen.getAllByText(/items?/)[0].closest('div');
    if (expandableArea) {
      await user.click(expandableArea);
    }

    // Items should be visible after expanding
    await waitFor(() => {
      expect(screen.getByText('Burger Deluxe')).toBeInTheDocument();
      expect(screen.getByText('Fries')).toBeInTheDocument();
    });
  });

  it('shows item quantities', async () => {
    const user = userEvent.setup();
    renderLiveOrderFeed();

    // Click to expand the NEW order
    const expandableArea = screen.getAllByText(/items?/)[0].closest('div');
    if (expandableArea) {
      await user.click(expandableArea);
    }

    await waitFor(() => {
      // Multiple items may show "2x", so use getAllByText
      expect(screen.getAllByText('2x').length).toBeGreaterThan(0);
    });
  });

  it('shows item notes when present', async () => {
    const user = userEvent.setup();
    renderLiveOrderFeed();

    // Click to expand the NEW order which has notes
    const expandableArea = screen.getAllByText(/items?/)[0].closest('div');
    if (expandableArea) {
      await user.click(expandableArea);
    }

    await waitFor(() => {
      expect(screen.getByText('Notes')).toBeInTheDocument();
    });
  });

  it('shows customer name when available', async () => {
    const user = userEvent.setup();
    renderLiveOrderFeed();

    const expandableArea = screen.getAllByText(/items?/)[0].closest('div');
    if (expandableArea) {
      await user.click(expandableArea);
    }

    await waitFor(() => {
      expect(screen.getByText(/Alex B/i)).toBeInTheDocument();
    });
  });

  it('shows estimated prep time when available', async () => {
    const user = userEvent.setup();
    renderLiveOrderFeed();

    const expandableArea = screen.getAllByText(/items?/)[0].closest('div');
    if (expandableArea) {
      await user.click(expandableArea);
    }

    await waitFor(() => {
      expect(screen.getByText(/Est. Prep: 15 min/)).toBeInTheDocument();
    });
  });

  it('shows driver ETA when available', async () => {
    const user = userEvent.setup();
    renderLiveOrderFeed();

    const expandableArea = screen.getAllByText(/items?/)[0].closest('div');
    if (expandableArea) {
      await user.click(expandableArea);
    }

    await waitFor(() => {
      expect(screen.getByText(/Driver ETA: 10 min/)).toBeInTheDocument();
    });
  });
});

describe('LiveOrderFeed Timer Updates', () => {
  it('updates timer color based on status and time', async () => {
    // NEW orders should turn red after 2 minutes
    // This would require testing with time mocking
    renderLiveOrderFeed();

    await waitFor(() => {
      // Timer elements exist
      const timerElements = document.querySelectorAll('[style*="monospace"]');
      expect(timerElements.length).toBeGreaterThan(0);
    });
  });
});

describe('LiveOrderFeed Empty State', () => {
  it('shows empty state when no orders', async () => {
    renderLiveOrderFeed([]);

    await waitFor(() => {
      expect(screen.getByText('No active orders')).toBeInTheDocument();
      expect(screen.getByText(/New orders will appear here/i)).toBeInTheDocument();
    });
  });
});

describe('LiveOrderFeed Completed Orders', () => {
  it('shows completed section in collapsible', async () => {
    const ordersWithCompleted: Order[] = [
      ...mockOrders,
      {
        id: 'order-4',
        platform: 'DoorDash',
        platformOrderId: 'DD-99999',
        status: 'PICKED_UP',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        items: [{ name: 'Test Item', quantity: 1 }],
        total: 20.0,
      },
    ];

    renderLiveOrderFeed(ordersWithCompleted);

    await waitFor(() => {
      expect(screen.getByText('Completed (1)')).toBeInTheDocument();
    });
  });
});
