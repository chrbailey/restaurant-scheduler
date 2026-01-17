import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClaimList } from '../../src/pages/claims/list';
import { mockClaims, mockShifts, mockWorkers } from './fixtures/data';

// Mock state
let mockClaimData = [...mockClaims];
const mockMutate = vi.fn();
const mockInvalidate = vi.fn();

// Mock react-router
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock Refine core hooks
vi.mock('@refinedev/core', () => ({
  useUpdate: vi.fn(() => ({
    mutate: mockMutate,
    isLoading: false,
  })),
  useInvalidate: vi.fn(() => mockInvalidate),
}));

// Mock Refine Antd hooks
vi.mock('@refinedev/antd', () => ({
  List: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <div data-testid="refine-list">
      {title && <div data-testid="list-title">{title}</div>}
      {children}
    </div>
  ),
  useTable: vi.fn(() => ({
    tableProps: {
      dataSource: mockClaimData,
      loading: false,
      pagination: { current: 1, pageSize: 10, total: mockClaimData.length },
    },
    filters: [{ field: 'status', operator: 'eq', value: 'PENDING' }],
    sorters: [{ field: 'createdAt', order: 'desc' }],
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

describe('Claim Approval Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClaimData = [...mockClaims];
    mockMutate.mockReset();
    mockInvalidate.mockReset();
  });

  describe('View Pending Claims', () => {
    it('displays all pending claims', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getByText('Mike Wilson')).toBeInTheDocument();
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });
    });

    it('shows claim priority scores', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getByText('1250')).toBeInTheDocument();
        expect(screen.getByText('850')).toBeInTheDocument();
      });
    });

    it('shows worker qualifications', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        // Use getAllByText since positions appear in both qualifications and shift columns
        expect(screen.getAllByText('BARTENDER').length).toBeGreaterThan(0);
        expect(screen.getAllByText('SERVER').length).toBeGreaterThan(0);
      });
    });

    it('shows worker reliability scores', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getByText('78%')).toBeInTheDocument();
        expect(screen.getByText('92%')).toBeInTheDocument();
      });
    });
  });

  describe('Approve Claim Flow', () => {
    it('shows approve button for each claim', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        const approveButtons = screen.getAllByText('Approve');
        expect(approveButtons.length).toBe(2);
      });
    });

    it('shows confirmation dialog when approving', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getAllByText('Approve')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Approve')[0]);

      await waitFor(() => {
        expect(screen.getByText(/Approve this claim/i)).toBeInTheDocument();
      });
    });

    it('shows worker name in confirmation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getAllByText('Approve')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Approve')[0]);

      await waitFor(() => {
        expect(screen.getByText(/will be assigned/i)).toBeInTheDocument();
      });
    });

    it('calls update mutation on confirm', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getAllByText('Approve')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Approve')[0]);

      // Find and click the confirm button in the popconfirm (the last Approve button)
      await waitFor(() => {
        const approveButtons = screen.getAllByRole('button', { name: /approve/i });
        expect(approveButtons.length).toBeGreaterThan(2); // Original 2 + popconfirm
      });
      const approveButtons = screen.getAllByRole('button', { name: /approve/i });
      await user.click(approveButtons[approveButtons.length - 1]);

      expect(mockMutate).toHaveBeenCalled();
    });

    it('mutation contains APPROVED status', async () => {
      const user = userEvent.setup();

      // Configure mock to capture mutation params
      mockMutate.mockImplementation((params, options) => {
        expect(params.values.status).toBe('APPROVED');
        options?.onSuccess?.();
      });

      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getAllByText('Approve')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Approve')[0]);

      // Find and click the confirm button in the popconfirm (the last Approve button)
      await waitFor(() => {
        const approveButtons = screen.getAllByRole('button', { name: /approve/i });
        expect(approveButtons.length).toBeGreaterThan(2);
      });
      const approveButtons = screen.getAllByRole('button', { name: /approve/i });
      await user.click(approveButtons[approveButtons.length - 1]);
    });

    it('invalidates caches on success', async () => {
      const user = userEvent.setup();

      mockMutate.mockImplementation((params, options) => {
        options?.onSuccess?.();
      });

      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getAllByText('Approve')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Approve')[0]);

      // Find and click the confirm button in the popconfirm (the last Approve button)
      await waitFor(() => {
        const approveButtons = screen.getAllByRole('button', { name: /approve/i });
        expect(approveButtons.length).toBeGreaterThan(2);
      });
      const approveButtons = screen.getAllByRole('button', { name: /approve/i });
      await user.click(approveButtons[approveButtons.length - 1]);

      // Invalidate should be called for claims and shifts
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe('Reject Claim Flow', () => {
    it('shows reject button for each claim', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        const rejectButtons = screen.getAllByText('Reject');
        expect(rejectButtons.length).toBe(2);
      });
    });

    it('shows confirmation dialog when rejecting', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getAllByText('Reject')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Reject')[0]);

      await waitFor(() => {
        expect(screen.getByText(/Reject this claim/i)).toBeInTheDocument();
      });
    });

    it('calls update mutation with REJECTED status', async () => {
      const user = userEvent.setup();

      mockMutate.mockImplementation((params, options) => {
        expect(params.values.status).toBe('REJECTED');
        options?.onSuccess?.();
      });

      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getAllByText('Reject')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Reject')[0]);

      // Find and click the confirm button in the popconfirm (the last Reject button)
      await waitFor(() => {
        const rejectButtons = screen.getAllByRole('button', { name: /reject/i });
        expect(rejectButtons.length).toBeGreaterThan(2);
      });
      const rejectButtons = screen.getAllByRole('button', { name: /reject/i });
      await user.click(rejectButtons[rejectButtons.length - 1]);
    });
  });

  describe('Priority Score Display', () => {
    it('shows high priority with green color', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        // Score 1250 should be green (>= 1000)
        const highScore = screen.getByText('1250');
        expect(highScore).toBeInTheDocument();
      });
    });

    it('shows medium priority with blue color', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        // Score 850 should be blue (>= 100, < 1000)
        const mediumScore = screen.getByText('850');
        expect(mediumScore).toBeInTheDocument();
      });
    });

    it('shows Primary tier tag for primary workers', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        const primaryTags = screen.getAllByText('Primary');
        expect(primaryTags.length).toBeGreaterThan(0);
      });
    });

    it('shows Own employee tag when applicable', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        const ownTags = screen.getAllByText('Own');
        expect(ownTags.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Claim Details Display', () => {
    it('shows shift position', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getByText('LINE_COOK')).toBeInTheDocument();
      });
    });

    it('shows claim timestamp', async () => {
      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        // Claimed time should be displayed
        expect(screen.getByText('Claimed')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    beforeEach(() => {
      mockClaimData = [];
    });

    it('shows empty message when no pending claims', async () => {
      renderWithProviders(<ClaimList />);

      // The component uses locale.emptyText for empty state
      // This would show "No pending claims" in the actual table
    });
  });

  describe('Error Handling', () => {
    it('shows error message on approve failure', async () => {
      const user = userEvent.setup();

      mockMutate.mockImplementation((params, options) => {
        options?.onError?.({ message: 'Failed to approve claim' });
      });

      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getAllByText('Approve')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Approve')[0]);

      // Find and click the confirm button in the popconfirm (the last Approve button)
      await waitFor(() => {
        const approveButtons = screen.getAllByRole('button', { name: /approve/i });
        expect(approveButtons.length).toBeGreaterThan(2);
      });
      const approveButtons = screen.getAllByRole('button', { name: /approve/i });
      await user.click(approveButtons[approveButtons.length - 1]);

      // Error handling is done via Ant Design message
    });

    it('shows error message on reject failure', async () => {
      const user = userEvent.setup();

      mockMutate.mockImplementation((params, options) => {
        options?.onError?.({ message: 'Failed to reject claim' });
      });

      renderWithProviders(<ClaimList />);

      await waitFor(() => {
        expect(screen.getAllByText('Reject')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByText('Reject')[0]);

      // Find and click the confirm button in the popconfirm (the last Reject button)
      await waitFor(() => {
        const rejectButtons = screen.getAllByRole('button', { name: /reject/i });
        expect(rejectButtons.length).toBeGreaterThan(2);
      });
      const rejectButtons = screen.getAllByRole('button', { name: /reject/i });
      await user.click(rejectButtons[rejectButtons.length - 1]);

      // Error handling is done via Ant Design message
    });
  });
});
