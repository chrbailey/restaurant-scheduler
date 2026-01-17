import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Configure testing-library with longer timeouts for Ant Design
configure({
  asyncUtilTimeout: 10000, // 10 seconds for waitFor/findBy
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock scrollTo
window.scrollTo = vi.fn();

// Mock getComputedStyle for Ant Design
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt) => {
  const style = originalGetComputedStyle(elt);
  return {
    ...style,
    getPropertyValue: (prop: string) => {
      return style.getPropertyValue(prop);
    },
  };
};

// Suppress console errors for known warnings in tests
const originalError = console.error;
console.error = (...args) => {
  const message = args[0]?.toString() || '';

  // Suppress specific React/Ant Design warnings during tests
  if (
    message.includes('Warning: ReactDOM.render is no longer supported') ||
    message.includes('Warning: `ReactDOMTestUtils.act`') ||
    message.includes('Warning: An update to') ||
    message.includes('Not implemented: window.computedStyle')
  ) {
    return;
  }

  originalError.apply(console, args);
};
