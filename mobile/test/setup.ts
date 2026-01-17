/**
 * Test Setup
 *
 * Configures mocks for React Native dependencies and test utilities.
 */

import '@testing-library/jest-native/extend-expect';
import { QueryClient } from '@tanstack/react-query';

// Silence console warnings during tests
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Animated') ||
      args[0].includes('useNativeDriver') ||
      args[0].includes('componentWillReceiveProps'))
  ) {
    return;
  }
  originalWarn.apply(console, args);
};

// ==================== Mock expo-secure-store ====================

const secureStoreData: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(secureStoreData[key] || null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStoreData[key] = value;
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    delete secureStoreData[key];
    return Promise.resolve();
  }),
}));

// ==================== Mock expo-router ====================

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  setParams: jest.fn(),
  navigate: jest.fn(),
};

const mockUseLocalSearchParams = jest.fn(() => ({}));
const mockUseGlobalSearchParams = jest.fn(() => ({}));
const mockUsePathname = jest.fn(() => '/');
const mockUseSegments = jest.fn(() => []);

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: mockUseLocalSearchParams,
  useGlobalSearchParams: mockUseGlobalSearchParams,
  usePathname: mockUsePathname,
  useSegments: mockUseSegments,
  Link: ({ children }: { children: React.ReactNode }) => children,
  Redirect: () => null,
  Stack: {
    Screen: () => null,
  },
  Tabs: {
    Screen: () => null,
  },
}));

// Export mocks for direct access in tests
export { mockRouter, mockUseLocalSearchParams };

// ==================== Mock AsyncStorage ====================

const asyncStorageData: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(asyncStorageData[key] || null)),
    setItem: jest.fn((key: string, value: string) => {
      asyncStorageData[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete asyncStorageData[key];
      return Promise.resolve();
    }),
    multiGet: jest.fn((keys: string[]) =>
      Promise.resolve(keys.map((key) => [key, asyncStorageData[key] || null]))
    ),
    multiSet: jest.fn((pairs: [string, string][]) => {
      pairs.forEach(([key, value]) => {
        asyncStorageData[key] = value;
      });
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys: string[]) => {
      keys.forEach((key) => {
        delete asyncStorageData[key];
      });
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(asyncStorageData).forEach((key) => {
        delete asyncStorageData[key];
      });
      return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(asyncStorageData))),
  },
}));

// ==================== Mock expo-constants ====================

jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: 'http://localhost:3000/api/v1',
        socketUrl: 'http://localhost:3000',
      },
    },
  },
}));

// ==================== Mock expo-device ====================

jest.mock('expo-device', () => ({
  deviceName: 'Test Device',
  modelName: 'iPhone 14',
  osName: 'iOS',
  osVersion: '17.0',
}));

// ==================== Mock expo-notifications ====================

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test]' })),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// ==================== Mock socket.io-client ====================

const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  off: jest.fn(),
  disconnect: jest.fn(),
  connect: jest.fn(),
  connected: true,
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

export { mockSocket };

// ==================== Mock react-native-reanimated ====================

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    default: {
      call: () => {},
      createAnimatedComponent: (component: any) => component,
      addWhitelistedNativeProps: () => {},
      addWhitelistedUIProps: () => {},
    },
    useSharedValue: jest.fn((init) => ({ value: init })),
    useAnimatedStyle: jest.fn(() => ({})),
    useAnimatedProps: jest.fn(() => ({})),
    useDerivedValue: jest.fn((fn) => ({ value: fn() })),
    useAnimatedRef: jest.fn(() => ({ current: null })),
    useAnimatedGestureHandler: jest.fn(() => ({})),
    useAnimatedScrollHandler: jest.fn(() => ({})),
    withTiming: jest.fn((val) => val),
    withSpring: jest.fn((val) => val),
    withDecay: jest.fn((val) => val),
    withDelay: jest.fn((_, val) => val),
    withSequence: jest.fn((...vals) => vals[0]),
    withRepeat: jest.fn((val) => val),
    cancelAnimation: jest.fn(),
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      poly: jest.fn(),
      sin: jest.fn(),
      circle: jest.fn(),
      exp: jest.fn(),
      elastic: jest.fn(),
      back: jest.fn(),
      bounce: jest.fn(),
      bezier: jest.fn(),
      in: jest.fn(),
      out: jest.fn(),
      inOut: jest.fn(),
    },
    runOnJS: jest.fn((fn) => fn),
    runOnUI: jest.fn((fn) => fn),
    interpolate: jest.fn(),
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    FadeIn: { duration: jest.fn(() => ({ delay: jest.fn() })) },
    FadeOut: { duration: jest.fn(() => ({ delay: jest.fn() })) },
    SlideInRight: { duration: jest.fn() },
    SlideOutLeft: { duration: jest.fn() },
    Layout: { duration: jest.fn() },
    View,
  };
});

// ==================== Mock react-native-gesture-handler ====================

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  Swipeable: 'Swipeable',
  DrawerLayout: 'DrawerLayout',
  State: {},
  ScrollView: 'ScrollView',
  Slider: 'Slider',
  Switch: 'Switch',
  TextInput: 'TextInput',
  ToolbarAndroid: 'ToolbarAndroid',
  ViewPagerAndroid: 'ViewPagerAndroid',
  DrawerLayoutAndroid: 'DrawerLayoutAndroid',
  WebView: 'WebView',
  NativeViewGestureHandler: 'NativeViewGestureHandler',
  TapGestureHandler: 'TapGestureHandler',
  FlingGestureHandler: 'FlingGestureHandler',
  ForceTouchGestureHandler: 'ForceTouchGestureHandler',
  LongPressGestureHandler: 'LongPressGestureHandler',
  PanGestureHandler: 'PanGestureHandler',
  PinchGestureHandler: 'PinchGestureHandler',
  RotationGestureHandler: 'RotationGestureHandler',
  RawButton: 'RawButton',
  BaseButton: 'BaseButton',
  RectButton: 'RectButton',
  BorderlessButton: 'BorderlessButton',
  TouchableHighlight: 'TouchableHighlight',
  TouchableNativeFeedback: 'TouchableNativeFeedback',
  TouchableOpacity: 'TouchableOpacity',
  TouchableWithoutFeedback: 'TouchableWithoutFeedback',
  Directions: {},
}));

// ==================== Mock @expo/vector-icons ====================

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialCommunityIcons: 'MaterialCommunityIcons',
  FontAwesome: 'FontAwesome',
  MaterialIcons: 'MaterialIcons',
}));

// ==================== React Query Test Client ====================

export function createTestQueryClient() {
  return new QueryClient({
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
}

// ==================== Test Utilities ====================

// Flush promises helper
export function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Wait for queries to settle
export async function waitForQueries(ms = 0) {
  await flushPromises();
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
  await flushPromises();
}

// Clear all mocked storage
export function clearMockedStorage() {
  Object.keys(secureStoreData).forEach((key) => {
    delete secureStoreData[key];
  });
  Object.keys(asyncStorageData).forEach((key) => {
    delete asyncStorageData[key];
  });
}

// Reset all mocks
export function resetAllMocks() {
  jest.clearAllMocks();
  clearMockedStorage();
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.back.mockClear();
}

// ==================== Global Test Setup ====================

// Note: Fake timers are NOT enabled globally to avoid conflicts with @testing-library/react-native's waitFor
// Individual tests that need fake timers should call jest.useFakeTimers() themselves

afterEach(() => {
  // Reset all mocks after each test
  resetAllMocks();
});
