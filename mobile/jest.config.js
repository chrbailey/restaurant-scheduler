/**
 * Jest Configuration for React Native (Expo)
 *
 * Use the ios preset which properly handles native modules.
 */
const path = require('path');

module.exports = {
  preset: 'jest-expo/ios',
  setupFilesAfterEnv: [
    '<rootDir>/test/setup.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Force React resolution to the version specified in mobile's dependencies
    '^react$': path.resolve(__dirname, '../node_modules/react-native/node_modules/react'),
    '^react/jsx-runtime$': path.resolve(__dirname, '../node_modules/react-native/node_modules/react/jsx-runtime'),
    '^react/jsx-dev-runtime$': path.resolve(__dirname, '../node_modules/react-native/node_modules/react/jsx-dev-runtime'),
  },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.expo/',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  testTimeout: 30000,
};
