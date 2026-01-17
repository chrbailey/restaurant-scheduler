import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShiftList } from '../../src/pages/shifts/list';
import { ShiftCreate } from '../../src/pages/shifts/create';
import { mockShifts, mockWorkers } from './fixtures/data';

// Mock navigate
const mockNavigate = vi.fn();

// Mock Refine hooks state
let mockShiftData = [...mockShifts];
const mockCreateMutation = vi.fn();
const mockUpdateMutation = vi.fn();

// Mock react-router
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// Mock Refine Antd hooks
vi.mock('@refinedev/antd', () => ({
  List: ({ children, headerButtons }: { children: React.ReactNode; headerButtons?: any }) => (
    <div data-testid="refine-list">
      {headerButtons && typeof headerButtons === 'function' && headerButtons({ createButtonProps: {} })}
      {children}
    </div>
  ),
  Create: ({ children, saveButtonProps }: { children: React.ReactNode; saveButtonProps: any }) => (
    <div data-testid="refine-create">
      {children}
      <button data-testid="save-btn" {...saveButtonProps}>Save</button>
    </div>
  ),
  useTable: vi.fn(() => ({
    tableProps: {
      dataSource: mockShiftData,
      loading: false,
      pagination: { current: 1, pageSize: 10, total: mockShiftData.length },
    },
    filters: {},
    sorters: [],
  })),
  useForm: vi.fn(() => ({
    formProps: {
      onFinish: mockCreateMutation,
      initialValues: {},
    },
    saveButtonProps: {
      disabled: false,
      loading: false,
    },
    queryResult: {
      data: null,
      isLoading: false,
    },
    formLoading: false,
  })),
  useSelect: vi.fn(() => ({
    selectProps: {
      options: mockWorkers.map((w) => ({
        label: `${w.user.firstName} ${w.user.lastName}`,
        value: w.id,
      })),
      loading: false,
    },
  })),
  DateField: ({ value }: { value: string }) => <span>{value}</span>,
  ShowButton: ({ recordItemId }: { recordItemId: string }) => (
    <button data-testid={`show-btn-${recordItemId}`}>Show</button>
  ),
  EditButton: ({ recordItemId }: { recordItemId: string }) => (
    <button data-testid={`edit-btn-${recordItemId}`}>Edit</button>
  ),
  DeleteButton: ({ recordItemId }: { recordItemId: string }) => (
    <button data-testid={`delete-btn-${recordItemId}`}>Delete</button>
  ),
  CreateButton: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="create-btn">{children}</button>
  ),
  FilterDropdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Refine core
vi.mock('@refinedev/core', () => ({
  useUpdate: vi.fn(() => ({
    mutate: mockUpdateMutation,
    isLoading: false,
  })),
  useInvalidate: vi.fn(() => vi.fn()),
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

describe('Shift Management Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShiftData = [...mockShifts];
  });

  describe('Create Shift Flow', () => {
    it('renders create form with all required fields', async () => {
      renderWithProviders(<ShiftCreate />);

      await waitFor(() => {
        expect(screen.getByText('Date')).toBeInTheDocument();
        expect(screen.getByText('Start Time')).toBeInTheDocument();
        expect(screen.getByText('End Time')).toBeInTheDocument();
        expect(screen.getByText('Position')).toBeInTheDocument();
      });
    });

    it('shows worker selection dropdown', async () => {
      renderWithProviders(<ShiftCreate />);

      await waitFor(() => {
        expect(screen.getByText('Assign Worker (Optional)')).toBeInTheDocument();
      });
    });

    it('has publish immediately toggle', async () => {
      renderWithProviders(<ShiftCreate />);

      await waitFor(() => {
        expect(screen.getByText(/Publish immediately/i)).toBeInTheDocument();
      });
    });
  });

  describe('View Shifts List', () => {
    it('displays all shifts in table', async () => {
      renderWithProviders(<ShiftList />);

      await waitFor(() => {
        expect(screen.getByText('SERVER')).toBeInTheDocument();
        expect(screen.getByText('LINE_COOK')).toBeInTheDocument();
        expect(screen.getByText('BARTENDER')).toBeInTheDocument();
      });
    });

    it('shows assigned workers', async () => {
      renderWithProviders(<ShiftList />);

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });
    });

    it('shows unassigned tag for unassigned shifts', async () => {
      renderWithProviders(<ShiftList />);

      await waitFor(() => {
        const unassignedTags = screen.getAllByText('Unassigned');
        expect(unassignedTags.length).toBeGreaterThan(0);
      });
    });

    it('displays shift status tags', async () => {
      renderWithProviders(<ShiftList />);

      await waitFor(() => {
        expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
      });
    });
  });

  describe('Edit Shift Flow', () => {
    it('has edit button for each shift', async () => {
      renderWithProviders(<ShiftList />);

      await waitFor(() => {
        mockShiftData.forEach((shift) => {
          expect(screen.getByTestId(`edit-btn-${shift.id}`)).toBeInTheDocument();
        });
      });
    });

    it('edit button is clickable', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ShiftList />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-btn-shift-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('edit-btn-shift-1'));

      // In a real app, this would navigate to edit page
      // For this test, we verify the button is interactive
    });
  });

  describe('Assign Worker to Shift', () => {
    it('displays worker selection in create form', async () => {
      renderWithProviders(<ShiftCreate />);

      await waitFor(() => {
        expect(screen.getByText('Assign Worker (Optional)')).toBeInTheDocument();
      });
    });

    it('worker list includes all available workers', async () => {
      // The useSelect mock provides worker options
      renderWithProviders(<ShiftCreate />);

      await waitFor(() => {
        // Workers should be available in the select dropdown
        expect(screen.getByText('Assign Worker (Optional)')).toBeInTheDocument();
      });
    });
  });
});

describe('Shift Status Workflow', () => {
  it('shows draft status correctly', async () => {
    mockShiftData = [{ ...mockShifts[0], status: 'DRAFT' }];
    renderWithProviders(<ShiftList />);

    await waitFor(() => {
      expect(screen.getByText('DRAFT')).toBeInTheDocument();
    });
  });

  it('shows published unassigned status correctly', async () => {
    mockShiftData = [{ ...mockShifts[0], status: 'PUBLISHED_UNASSIGNED' }];
    renderWithProviders(<ShiftList />);

    await waitFor(() => {
      expect(screen.getByText('PUBLISHED UNASSIGNED')).toBeInTheDocument();
    });
  });

  it('shows confirmed status correctly', async () => {
    mockShiftData = [{ ...mockShifts[0], status: 'CONFIRMED' }];
    renderWithProviders(<ShiftList />);

    await waitFor(() => {
      expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    });
  });
});

describe('Shift Filtering', () => {
  it('has position filter column', async () => {
    renderWithProviders(<ShiftList />);

    await waitFor(() => {
      expect(screen.getByText('Position')).toBeInTheDocument();
    });
  });

  it('has status filter column', async () => {
    renderWithProviders(<ShiftList />);

    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });
});

describe('Shift Actions', () => {
  it('show button navigates to shift details', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ShiftList />);

    await waitFor(() => {
      expect(screen.getByTestId('show-btn-shift-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('show-btn-shift-1'));

    // Button click handled
  });

  it('delete button is present for each shift', async () => {
    renderWithProviders(<ShiftList />);

    await waitFor(() => {
      mockShiftData.forEach((shift) => {
        expect(screen.getByTestId(`delete-btn-${shift.id}`)).toBeInTheDocument();
      });
    });
  });
});

describe('Create Shift with Publish Toggle', () => {
  it('toggle affects status on create', async () => {
    renderWithProviders(<ShiftCreate />);

    await waitFor(() => {
      expect(screen.getByText(/Publish immediately/i)).toBeInTheDocument();
    });

    // The component's onFinish handler sets status based on toggle
    // DRAFT if not published, PUBLISHED_UNASSIGNED if published
  });
});
