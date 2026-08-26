module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  // The first mount in a suite that renders a real react-native tree costs
  // ~0.6-4.9s — loading and JIT-ing those modules — while every later mount in
  // the same suite is ~3ms. That one-off cost lands inside whichever test runs
  // first, so jest's 5s default left the slowest suites (ChatInputActionSheet at
  // 4.9s, PaintingTemplateRow at 4.5s) overrunning it whenever workers contended
  // for CPU during a full run: the historical list-flake failures.
  // Raised here rather than warmed up per suite because the cost is
  // environmental — every component suite needs the headroom, not just the ones
  // that have tripped so far.
  testTimeout: 20_000,
  // `expo prebuild` output: Pods vendor their own test suites, which jest would
  // otherwise collect (hundreds of failing foreign suites drowning real results).
  testPathIgnorePatterns: [
    '/node_modules/',
    // Conductor review artifacts live here and are not repository test suites.
    '/.context/',
    '/ios/',
    '/android/',
    '/packages/ai-core/',
    '/packages/ai-runtime/',
    '/packages/ai-sdk-provider/',
    // Underscore-prefixed files inside __tests__ are shared harnesses, not suites.
    '/__tests__/_',
    // The desktop-sync audits spawn hundreds of real git subprocesses against
    // fixture repos in tmpdir (~13s of the run). They guard against desktop
    // drift, which is a local-sync concern rather than a per-PR one, so PR CI
    // skips them and a full local run still covers them.
    ...(process.env.PRCI ? ['/scripts/__tests__/'] : []),
  ],
  // Local build/export artifacts can contain copied workspace packages. Keep
  // them out of the Haste map so package names remain unique during tests.
  modulePathIgnorePatterns: ['<rootDir>/.context/', '<rootDir>/.local/'],
  moduleNameMapper: {
    // These patched Pi subpaths intentionally expose ESM through import-only
    // conditions. Jest resolves the app tests as CommonJS, so point it at the
    // same published files directly and let babel-jest transform them below.
    '^@earendil-works/pi-agent-core/compaction$':
      '<rootDir>/node_modules/@earendil-works/pi-agent-core/dist/harness/compaction/compaction.js',
    '^@earendil-works/pi-ai/utils/(.*)$':
      '<rootDir>/node_modules/@earendil-works/pi-ai/dist/utils/$1.js',
    '^@cherrystudio/ui/background-activity/ios$':
      '<rootDir>/packages/ui/src/background-activity/background-activity.ios.tsx',
    '^@cherrystudio/ui/icons/providers$': '<rootDir>/packages/ui/src/icons-webp/providers/index.ts',
    '^vitest$': '<rootDir>/packages/provider-registry/vitestJestShim.ts',
    '^@cherrystudio/universal/(.*)$': '<rootDir>/packages/universal/src/$1',
    '^@cherrystudio/ai-runtime/(.*)$': '<rootDir>/packages/ai-runtime/src/$1/index.ts',
    '^@shared/(.*)$': '<rootDir>/packages/universal/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
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
    // `fractional-indexing`, `standard-navigation`, and `uuid` are ESM-only, so
    // they need transforming for any suite that reaches them. `standard-navigation`
    // arrives transitively through Expo Router's public exports.
    // `uuid` arrives transitively: the service registry names `DbService`, which
    // pulls in the drizzle schemas, which generate ids.
    '/node_modules/(?!((\\.pnpm/[^/]+/node_modules/)?(react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|standard-navigation|@sentry/react-native|native-base|tokenx|fractional-indexing|uuid|voyage-ai-provider|@opeoginni|@earendil-works)))',
    '/node_modules/react-native-reanimated/plugin/',
  ],
};
