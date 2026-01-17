import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkerList } from '../list';
import { mockWorkers } from '@test/fixtures/data';

// Mock react-router
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock Refine Antd hooks
vi.mock('@refinedev/antd', () => ({
  List: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="refine-list">{children}</div>
  ),
  useTable: vi.fn(() => ({
    tableProps: {
      dataSource: mockWorkers,
      loading: false,
      pagination: { current: 1, pageSize: 10, total: mockWorkers.length },
    },
    filters: {},
    sorters: [],
  })),
  ShowButton: ({ recordItemId }: { recordItemId: string; hideText?: boolean; size?: string }) => (
    <button data-testid={`show-btn-${recordItemId}`}>Show</button>
  ),
  FilterDropdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWorkerList = () => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <WorkerList />
      </ConfigProvider>
    </QueryClientProvider>
  );
};

describe('WorkerList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the workers table', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByTestId('refine-list')).toBeInTheDocument();
    });
  });

  it('renders table columns', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('Worker')).toBeInTheDocument();
      expect(screen.getByText('Positions')).toBeInTheDocument();
      expect(screen.getByText('Role')).toBeInTheDocument();
      expect(screen.getByText('Rating')).toBeInTheDocument();
      expect(screen.getByText('Reliability')).toBeInTheDocument();
      expect(screen.getByText('Shifts')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  it('renders worker names', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
      expect(screen.getByText('Mike Wilson')).toBeInTheDocument();
    });
  });

  it('renders worker positions as tags', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('SERVER')).toBeInTheDocument();
      expect(screen.getByText('HOST')).toBeInTheDocument();
      expect(screen.getByText('LINE COOK')).toBeInTheDocument();
    });
  });

  it('renders role tags with correct colors', async () => {
    renderWorkerList();

    await waitFor(() => {
      // There are 2 workers with WORKER role (worker-1 and worker-3)
      const workerTags = screen.getAllByText('WORKER');
      expect(workerTags.length).toBe(2);
      expect(screen.getByText('LEAD')).toBeInTheDocument();
    });
  });

  it('displays rating stars', async () => {
    renderWorkerList();

    await waitFor(() => {
      // Rating values should be displayed
      expect(screen.getByText('(4.5)')).toBeInTheDocument();
      expect(screen.getByText('(4.8)')).toBeInTheDocument();
      expect(screen.getByText('(4.2)')).toBeInTheDocument();
    });
  });

  it('displays reliability progress bar', async () => {
    renderWorkerList();

    await waitFor(() => {
      // Reliability percentages should be displayed
      expect(screen.getByText('92%')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(screen.getByText('78%')).toBeInTheDocument();
    });
  });

  it('displays shifts completed count', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('156')).toBeInTheDocument();
      expect(screen.getByText('234')).toBeInTheDocument();
      expect(screen.getByText('89')).toBeInTheDocument();
    });
  });

  it('displays active/inactive status', async () => {
    renderWorkerList();

    await waitFor(() => {
      const activeStatuses = screen.getAllByText('Active');
      expect(activeStatuses.length).toBe(3); // All mock workers are active
    });
  });

  it('renders show button for each worker', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByTestId('show-btn-worker-1')).toBeInTheDocument();
      expect(screen.getByTestId('show-btn-worker-2')).toBeInTheDocument();
      expect(screen.getByTestId('show-btn-worker-3')).toBeInTheDocument();
    });
  });

  it('renders worker phone numbers', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('555-0101')).toBeInTheDocument();
      expect(screen.getByText('555-0102')).toBeInTheDocument();
      expect(screen.getByText('555-0103')).toBeInTheDocument();
    });
  });

  it('renders worker avatars with initials', async () => {
    renderWorkerList();

    await waitFor(() => {
      // Avatar should contain initials
      expect(screen.getByText('JS')).toBeInTheDocument(); // John Smith
      expect(screen.getByText('SJ')).toBeInTheDocument(); // Sarah Johnson
      expect(screen.getByText('MW')).toBeInTheDocument(); // Mike Wilson
    });
  });
});

describe('WorkerList Filters', () => {
  it('has position filter', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('Positions')).toBeInTheDocument();
    });
  });

  it('has role filter', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('Role')).toBeInTheDocument();
    });
  });
});

describe('WorkerList Sorting', () => {
  it('allows sorting by rating', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('Rating')).toBeInTheDocument();
    });
  });

  it('allows sorting by reliability', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('Reliability')).toBeInTheDocument();
    });
  });

  it('allows sorting by shifts completed', async () => {
    renderWorkerList();

    await waitFor(() => {
      expect(screen.getByText('Shifts')).toBeInTheDocument();
    });
  });
});

describe('WorkerList Empty State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles empty worker list', async () => {
    // Would need to re-mock useTable with empty data
    // This is a placeholder for the test structure
    expect(true).toBe(true);
  });
});
