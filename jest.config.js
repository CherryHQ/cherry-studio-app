module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  // `expo prebuild` output: Pods vendor their own test suites, which jest would
  // otherwise collect (hundreds of failing foreign suites drowning real results).
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  moduleNameMapper: {
    '^lucide-uniwind/png/generated/(.*)$':
      '<rootDir>/packages/lucide-uniwind/src/png-icons/generated/$1',
    '^lucide-uniwind/png$': '<rootDir>/packages/lucide-uniwind/src/png-icons/index.ts',
    '^vitest$': '<rootDir>/packages/provider-registry/vitestJestShim.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@logger$': '<rootDir>/src/core/logger/LoggerService.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // tokenx ships ESM-only (.mjs, no CJS build); jest-expo's preset transform
  // only matches `.[jt]sx?$`, so `.mjs` needs its own babel-jest entry.
  transform: {
    '\\.mjs$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!((\\.pnpm/[^/]+/node_modules/)?(react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|tokenx)))',
    '/node_modules/react-native-reanimated/plugin/',
  ],
};
