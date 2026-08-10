module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  // The first mount in a suite that renders a real react-native tree costs
  // ~0.6-4.9s — loading and JIT-ing those modules — while every later mount in
  // the same suite is ~3ms. That one-off cost lands inside whichever test runs
  // first, so jest's 5s default left the slowest suites (ChatInputActionSheet at
  // 4.9s, PaintingTemplateRow at 4.5s) overrunning it whenever workers contended
  // for CPU during a full run: the "DrawingList/TopicList is flaky" failures.
  // Raised here rather than warmed up per suite because the cost is
  // environmental — every component suite needs the headroom, not just the ones
  // that have tripped so far.
  testTimeout: 20_000,
  // `expo prebuild` output: Pods vendor their own test suites, which jest would
  // otherwise collect (hundreds of failing foreign suites drowning real results).
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.context/',
    '/ios/',
    '/android/',
    '/packages/ai-core/',
    '/packages/ai-sdk-provider/',
    // Underscore-prefixed files inside __tests__ are shared harnesses, not suites.
    '/__tests__/_',
  ],
  moduleNameMapper: {
    '^lucide-uniwind/png/generated/(.*)$':
      '<rootDir>/packages/lucide-uniwind/src/png-icons/generated/$1',
    '^lucide-uniwind/png$': '<rootDir>/packages/lucide-uniwind/src/png-icons/index.ts',
    '^vitest$': '<rootDir>/packages/provider-registry/vitestJestShim.ts',
    '^@cherrystudio/universal/(.*)$': '<rootDir>/packages/universal/src/$1',
    '^@shared/(.*)$': '<rootDir>/packages/universal/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@logger$': '<rootDir>/src/shared/core/logger/LoggerService.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // tokenx ships ESM-only (.mjs, no CJS build); jest-expo's preset transform
  // only matches `.[jt]sx?$`, so `.mjs` needs its own babel-jest entry.
  transform: {
    '\\.mjs$': 'babel-jest',
  },
  transformIgnorePatterns: [
    // `fractional-indexing` is ESM-only (`"type": "module"`, no CJS build), so it
    // needs transforming for any suite that imports it directly.
    '/node_modules/(?!((\\.pnpm/[^/]+/node_modules/)?(react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|tokenx|fractional-indexing)))',
    '/node_modules/react-native-reanimated/plugin/',
  ],
};
