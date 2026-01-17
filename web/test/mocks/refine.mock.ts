import { vi } from 'vitest';
import type { ReactNode } from 'react';

// Types for mock data
export interface MockListResult<T = any> {
  data: T[];
  total?: number;
}

export interface MockOneResult<T = any> {
  data: T;
}

export interface MockMutationResult {
  mutate: ReturnType<typeof vi.fn>;
  isLoading: boolean;
}

export interface MockIdentity {
  name?: string;
  restaurantId?: string;
  restaurantName?: string;
}

// Factory functions for mock hooks
export const mockUseList = <T = any>(result: MockListResult<T>) => {
  return {
    data: {
      data: result.data,
      total: result.total ?? result.data.length,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
};

export const mockUseOne = <T = any>(result: MockOneResult<T>) => {
  return {
    data: {
      data: result.data,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
};

export const mockUseCreate = (): MockMutationResult => {
  const mutate = vi.fn();
  return {
    mutate,
    isLoading: false,
  };
};

export const mockUseUpdate = (): MockMutationResult => {
  const mutate = vi.fn();
  return {
    mutate,
    isLoading: false,
  };
};

export const mockUseDelete = (): MockMutationResult => {
  const mutate = vi.fn();
  return {
    mutate,
    isLoading: false,
  };
};

export const mockUseCustom = <T = any>(result: T) => {
  return {
    data: {
      data: result,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
};

export const mockUseCustomMutation = () => {
  const mutate = vi.fn();
  return {
    mutate,
    isLoading: false,
  };
};

export const mockUseGetIdentity = (identity: MockIdentity) => {
  return {
    data: identity,
    isLoading: false,
    isError: false,
  };
};

export const mockUseTable = <T = any>(data: T[]) => {
  return {
    tableProps: {
      dataSource: data,
      loading: false,
      pagination: {
        current: 1,
        pageSize: 10,
        total: data.length,
      },
    },
    filters: {},
    sorters: [],
    setFilters: vi.fn(),
    setSorters: vi.fn(),
  };
};

export const mockUseSelect = (options: { label: string; value: string }[]) => {
  return {
    selectProps: {
      options,
      loading: false,
    },
  };
};

export const mockUseForm = () => {
  return {
    formProps: {
      onFinish: vi.fn(),
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
  };
};

export const mockUseInvalidate = () => {
  return vi.fn();
};

// Create mock for the entire @refinedev/core module
export const createRefineMock = (overrides: {
  useList?: ReturnType<typeof mockUseList>;
  useOne?: ReturnType<typeof mockUseOne>;
  useCreate?: MockMutationResult;
  useUpdate?: MockMutationResult;
  useDelete?: MockMutationResult;
  useCustom?: ReturnType<typeof mockUseCustom>;
  useCustomMutation?: ReturnType<typeof mockUseCustomMutation>;
  useGetIdentity?: ReturnType<typeof mockUseGetIdentity>;
  useInvalidate?: ReturnType<typeof mockUseInvalidate>;
}) => {
  return {
    useList: vi.fn(() => overrides.useList ?? mockUseList({ data: [] })),
    useOne: vi.fn(() => overrides.useOne ?? mockUseOne({ data: null })),
    useCreate: vi.fn(() => overrides.useCreate ?? mockUseCreate()),
    useUpdate: vi.fn(() => overrides.useUpdate ?? mockUseUpdate()),
    useDelete: vi.fn(() => overrides.useDelete ?? mockUseDelete()),
    useCustom: vi.fn(() => overrides.useCustom ?? mockUseCustom(null)),
    useCustomMutation: vi.fn(() => overrides.useCustomMutation ?? mockUseCustomMutation()),
    useGetIdentity: vi.fn(() => overrides.useGetIdentity ?? mockUseGetIdentity({})),
    useInvalidate: vi.fn(() => overrides.useInvalidate ?? mockUseInvalidate()),
  };
};

// Create mock for @refinedev/antd module
export const createRefineAntdMock = (overrides: {
  useTable?: ReturnType<typeof mockUseTable>;
  useForm?: ReturnType<typeof mockUseForm>;
  useSelect?: ReturnType<typeof mockUseSelect>;
}) => {
  return {
    useTable: vi.fn(() => overrides.useTable ?? mockUseTable([])),
    useForm: vi.fn(() => overrides.useForm ?? mockUseForm()),
    useSelect: vi.fn(() => overrides.useSelect ?? mockUseSelect([])),
    List: ({ children }: { children: ReactNode }) => children,
    Create: ({ children }: { children: ReactNode }) => children,
    Edit: ({ children }: { children: ReactNode }) => children,
    Show: ({ children }: { children: ReactNode }) => children,
    DateField: ({ value }: { value: string }) => value,
    TagField: ({ value }: { value: string }) => value,
    ShowButton: ({ children }: { children?: ReactNode }) => children ?? 'Show',
    EditButton: ({ children }: { children?: ReactNode }) => children ?? 'Edit',
    DeleteButton: ({ children }: { children?: ReactNode }) => children ?? 'Delete',
    CreateButton: ({ children }: { children?: ReactNode }) => children ?? 'Create',
    FilterDropdown: ({ children }: { children: ReactNode }) => children,
  };
};

// Mock router
export const mockNavigate = vi.fn();

export const mockUseNavigate = () => mockNavigate;

export const createRouterMock = () => {
  return {
    useNavigate: mockUseNavigate,
    useLocation: vi.fn(() => ({
      pathname: '/',
      search: '',
      hash: '',
      state: null,
    })),
    useParams: vi.fn(() => ({})),
    useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
  };
};
