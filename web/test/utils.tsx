import { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { vi } from 'vitest';

// Create a test query client
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface WrapperProps {
  children: ReactNode;
}

// Test wrapper with all providers
const AllTheProviders = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#4a90d9',
          },
        }}
      >
        {children}
      </ConfigProvider>
    </QueryClientProvider>
  );
};

// Custom render with providers
const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Mock navigate function
export const mockNavigate = vi.fn();

// Setup mock for react-router
export const setupRouterMock = () => {
  vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    return {
      ...actual,
      useNavigate: () => mockNavigate,
      useLocation: () => ({
        pathname: '/',
        search: '',
        hash: '',
        state: null,
      }),
      useParams: () => ({}),
    };
  });
};

// Helper to wait for async operations
export const waitForLoadingToFinish = () => {
  return new Promise((resolve) => setTimeout(resolve, 0));
};

// Helper to mock Refine hooks
export const mockRefineHooks = (mocks: {
  useList?: any;
  useOne?: any;
  useCreate?: any;
  useUpdate?: any;
  useCustom?: any;
  useCustomMutation?: any;
  useGetIdentity?: any;
  useInvalidate?: any;
}) => {
  vi.mock('@refinedev/core', async () => {
    const actual = await vi.importActual('@refinedev/core');
    return {
      ...actual,
      useList: vi.fn(() => mocks.useList ?? { data: { data: [] }, isLoading: false }),
      useOne: vi.fn(() => mocks.useOne ?? { data: { data: null }, isLoading: false }),
      useCreate: vi.fn(() => mocks.useCreate ?? { mutate: vi.fn(), isLoading: false }),
      useUpdate: vi.fn(() => mocks.useUpdate ?? { mutate: vi.fn(), isLoading: false }),
      useCustom: vi.fn(() => mocks.useCustom ?? { data: { data: null }, isLoading: false }),
      useCustomMutation: vi.fn(() => mocks.useCustomMutation ?? { mutate: vi.fn(), isLoading: false }),
      useGetIdentity: vi.fn(() => mocks.useGetIdentity ?? { data: null, isLoading: false }),
      useInvalidate: vi.fn(() => vi.fn()),
    };
  });
};

// Helper to mock Refine Antd hooks
export const mockRefineAntdHooks = (mocks: {
  useTable?: any;
  useForm?: any;
  useSelect?: any;
}) => {
  vi.mock('@refinedev/antd', async () => {
    const actual = await vi.importActual('@refinedev/antd');
    return {
      ...actual,
      useTable: vi.fn(() => mocks.useTable ?? { tableProps: { dataSource: [], loading: false }, filters: {} }),
      useForm: vi.fn(() => mocks.useForm ?? { formProps: {}, saveButtonProps: {} }),
      useSelect: vi.fn(() => mocks.useSelect ?? { selectProps: { options: [] } }),
    };
  });
};
