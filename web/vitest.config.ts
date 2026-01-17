import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    css: true,
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000, // 30s for complex Antd component tests
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**'],
    },
    server: {
      deps: {
        inline: ['@tanstack/react-query'],
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './test'),
      // Force all packages to use the same React instance (resolves duplicate React issue)
      'react': resolve(__dirname, '../node_modules/react'),
      'react-dom': resolve(__dirname, '../node_modules/react-dom'),
    },
  },
});
