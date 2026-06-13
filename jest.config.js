module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^lucide-uniwind/png/generated/(.*)$':
      '<rootDir>/packages/lucide-uniwind/src/png-icons/generated/$1',
    '^lucide-uniwind/png$': '<rootDir>/packages/lucide-uniwind/src/png-icons/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!((\\.pnpm/[^/]+/node_modules/)?(react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base)))',
    '/node_modules/react-native-reanimated/plugin/',
  ],
};
