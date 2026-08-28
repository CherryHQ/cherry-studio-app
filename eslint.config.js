const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

// Layer dependency direction from the current architecture reference:
// app -> {bootstrap, frontend, shared}
// bootstrap -> {backend, frontend, shared}
// frontend -> {frontend, shared}
// backend -> {backend, shared}
// backend internals: ai -> {services, data}; services -> data
// shared -> shared
// packages/universal (@cherrystudio/universal) sits below every layer: any layer
// may import it, it must not import app code or react/react-native/expo.

const retiredRootPatterns = [
  'ai',
  'components',
  'core',
  'data',
  'features',
  'hooks',
  'i18n',
  'mocks',
  'polyfills',
  'runtime',
  'services',
  'styles',
  'utils',
].flatMap((root) => [`@/${root}`, `@/${root}/*`, `@/${root}/*/**`]);

const universalDataTombstone = {
  group: [
    '@cherrystudio/universal/data/api/*',
    '@cherrystudio/universal/data/api/*/**',
    '@cherrystudio/universal/data/cache/*',
    '@cherrystudio/universal/data/preference',
    '@cherrystudio/universal/data/preference/*',
    '@cherrystudio/universal/data/presets/*',
    '@cherrystudio/universal/data/types',
    '@cherrystudio/universal/data/types/*',
  ],
  message:
    'The mobile data layer moved out of packages/universal. Import @/shared/data/* instead; the entity types packages/ai-runtime still shares are re-exported from @/shared/data/types.',
};

const tombstonePatterns = [
  {
    group: retiredRootPatterns,
    message:
      'This root path is retired. Import from @/frontend, @/backend, @/shared, or @/bootstrap.',
  },
  {
    group: ['@/config/constants'],
    message: 'Constants now live in the owning layer under its utils directory.',
  },
  {
    // Lives on the base rule rather than beside the layer rules below, so that a
    // later @typescript-eslint/no-restricted-imports block cannot replace it.
    group: ['@shared/*', '@shared/*/**'],
    message:
      '@shared/* is the package-internal alias inside packages/universal (it matches desktop verbatim); app code imports @cherrystudio/universal/*.',
  },
  {
    group: ['@/shared/domain', '@/shared/domain/*', '@/shared/domain/*/**'],
    message:
      'The generic shared domain root was retired. Use @cherrystudio/universal/ai for AI rules, @/shared/data for data vocabulary, or @cherrystudio/universal/utils and @/shared/utils for pure helpers.',
  },
  universalDataTombstone,
  {
    group: ['@/screens', '@/screens/*', '@/screens/*/**'],
    message: 'Screens moved to @/frontend/features/<name>.',
  },
  {
    group: [
      '@/bootstrap/DataProvider',
      '@/bootstrap/InitialDataGate',
      '@/bootstrap/createDataServices',
    ],
    message: 'Use AppBootstrapProvider/AppBootstrapGate; the concrete backend graph is private.',
  },
  {
    group: [
      '@/bootstrap/AppBootstrapGate',
      '@/bootstrap/AppBootstrapProvider',
      '@/bootstrap/appRuntime',
      '@/bootstrap/createAppBootstrapRuntime',
      '@/bootstrap/createBackend',
      '@/bootstrap/createBackendServices',
      '@/bootstrap/polyfills',
      '@/bootstrap/polyfills/*',
      '@/bootstrap/polyfills/*/**',
    ],
    message:
      'Bootstrap is split by ownership. Use @/bootstrap for its public React interface, or the preboot, composition, and runtime directories internally.',
  },
  {
    group: [
      '@/backend/application',
      '@/backend/application/*',
      '@/backend/application/*/**',
      '@/backend/infrastructure',
      '@/backend/infrastructure/*',
      '@/backend/infrastructure/*/**',
    ],
    message: 'Use @/backend/ai, @/backend/data, or @/backend/services.',
  },
  {
    group: [
      '@/bootstrap/createMobileBackend',
      '@/shared/contracts/mobileBackend',
      '@/shared/contracts/assistants',
      '@/shared/contracts/files',
      '@/shared/contracts/pins',
      '@/shared/contracts/preferences',
      '@/shared/contracts/topics',
    ],
    message:
      'Resource data moved to shared/data and the Data API. shared/contracts now contains workflow/session capabilities only.',
  },
];

const retiredImports = [
  {
    name: 'heroui-native/toast',
    message: 'Use Toast and useToast from @cherrystudio/ui/components.',
  },
  {
    name: '@/frontend/data',
    importNames: ['useDataModule'],
    message: 'Use the typed Data API hooks: useQuery, useMutation, or useInfiniteQuery.',
  },
  {
    name: '@/shared/contracts',
    importNames: [
      'AssistantsBackend',
      'FilesBackend',
      'MobileBackend',
      'MobileBackendModule',
      'MobileBackendModuleKey',
      'PinsBackend',
      'PreferencesBackend',
      'TopicsBackend',
    ],
    message:
      'Resource interfaces moved to shared/data; Backend now contains workflow/session modules only.',
  },
];

const aliasRoots = (roots) =>
  roots.flatMap((root) => [`@/${root}`, `@/${root}/*`, `@/${root}/*/**`]);

const restrictedImports = (files, patterns) => ({
  files,
  rules: {
    '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
  },
});

const layerPattern = (roots, message) => ({
  group: aliasRoots(roots),
  message,
});

// A flat-config block *replaces* a rule it shares with an earlier block rather
// than adding to it, so a narrower file set never inherits the layer rule of the
// directory above it. Each pattern is named here and every block below spells
// out the full union that applies to its files.
const backendLayer = layerPattern(
  ['app', 'bootstrap', 'frontend'],
  'Backend may depend only on backend and shared modules. Bootstrap owns cross-layer assembly.',
);

const backendServicesLayer = {
  group: aliasRoots(['backend/ai']),
  message:
    'Backend services receive AI capabilities through constructor interfaces; bootstrap owns concrete assembly.',
};

const backendDataLayer = {
  group: aliasRoots(['backend/ai', 'backend/services']),
  message: 'Backend data modules must not depend on AI or general backend services.',
};

// The lifecycle core sits below every backend module: data services resolve
// `DbService` through `application`, so anything the core imported would become
// a cycle. `serviceRegistry.ts` is exempted below because registration *is*
// assembly — it is the one place that names concrete classes.
const backendCoreLayer = {
  group: aliasRoots(['backend/ai', 'backend/data', 'backend/services']),
  message:
    'The lifecycle core must not depend on the modules it manages. Register concrete services in serviceRegistry.ts instead.',
};

const runtimeContractLayer = {
  group: aliasRoots(['backend/data', 'backend/services']),
  message:
    'The Agent Runtime contract must not depend on persistence or the Data API; the Host adapts them.',
};

// Pi isolation (Success Criterion 1 in docs/references/ai/target-architecture.md):
// outside the Pi zone, backend code reaches Pi only through the AgentRuntime
// contract. The zone is the single directory agent/runtime/pi; its own block
// below spells its union without this ban, and `serviceRegistry.ts` stays
// exempt because binding the concrete Runtime is assembly. Relative specifiers
// bypass alias globs, so the raw directory name is banned as well.
const piZoneFiles = ['src/backend/ai/agent/runtime/pi/**/*.{ts,tsx}'];

const piIsolation = {
  group: [
    '@earendil-works/*',
    '@earendil-works/*/**',
    ...aliasRoots(['backend/ai/agent/runtime/pi']),
    '**/pi',
    '**/pi/**',
  ],
  message:
    'Pi is one Runtime implementation. Depend on the AgentRuntime contract; only agent/runtime/pi may name Pi modules or @earendil-works packages.',
};

// `generation/` is the private implementation of AiService: the AI SDK path
// for non-conversation work. Only `AiService.ts` may reach into it, so the
// facade stays the single entry point and provider/ keeps to runtime-agnostic
// connection facts. Relative specifiers bypass alias globs, hence the bare
// directory name as well.
const aiSdkGenerationZoneFiles = [
  'src/backend/ai/AiService.ts',
  'src/backend/ai/generation/**/*.{ts,tsx}',
  'src/backend/ai/__tests__/**/*.{ts,tsx}',
];

const aiSdkGenerationPrivacy = {
  group: [...aliasRoots(['backend/ai/generation']), '**/generation', '**/generation/**'],
  message:
    'generation/ is AiService private implementation. Depend on AiService instead of its AI SDK internals.',
};

const frontendLayer = layerPattern(
  ['app', 'backend', 'bootstrap'],
  'Frontend may depend only on frontend and shared modules. Use Data API hooks for resources, preference hooks for settings, and useBackendModule() for workflows.',
);

const frontendSharedLayer = {
  group: ['@/frontend/features/*', '@/frontend/features/*/**'],
  message:
    'Shared frontend modules must not depend on features; move the shared capability down instead.',
};

const frontendFeatureLayer = {
  // Cross-feature imports go through a feature's public surface:
  // `@/frontend/features/<feature>` or one documented area below it.
  // Gitignore-style negations must first unban each ancestor directory.
  group: [
    '@/frontend/features/*/*/*',
    '@/frontend/features/*/*/*/*',
    '@/frontend/features/*/*/*/*/*',
    '@/frontend/features/*/*/*/*/*/*',
    '!@/frontend/features/settings/components',
    '@/frontend/features/settings/components/*',
    '!@/frontend/features/settings/components/SettingSelect',
  ],
  allowTypeImports: true,
  message:
    "Deep cross-feature import: use the feature's public surface or add a deliberate sanctioned export.",
};

const sharedLayer = layerPattern(
  ['app', 'backend', 'bootstrap', 'frontend'],
  'Shared modules must not depend on an upper layer.',
);

const platformIndependentPackages = [
  'react',
  'react/*',
  'react-native',
  'react-native/*',
  'react-native-*',
  'react-native-*/*',
  'expo',
  'expo-*',
  'expo-*/*',
  '@expo/*',
  '@expo/*/**',
];

const sharedPlatformIndependence = {
  group: platformIndependentPackages,
  message:
    'Shared contracts, data, AI rules, and utilities must remain platform- and React-independent.',
};

const sharedFrontendDirectories = [
  'src/frontend/components/**/*.{ts,tsx}',
  'src/frontend/data/**/*.{ts,tsx}',
  'src/frontend/hooks/**/*.{ts,tsx}',
  'src/frontend/i18n/**/*.{ts,tsx}',
  'src/frontend/types/**/*.{ts,tsx}',
  'src/frontend/utils/**/*.{ts,tsx}',
];

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // Reanimated SharedValue.value mutation is idiomatic inside worklets and
      // gesture callbacks, but the React Compiler rule cannot distinguish it.
      'react-hooks/immutability': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: retiredImports, patterns: tombstonePatterns }],
    },
  },
  {
    // src/shared/data/types re-exports the entity declarations that stay in
    // packages/universal while packages/ai-runtime imports them, so it is the
    // one place allowed to spell that path. Every other tombstone still applies.
    files: ['src/shared/data/types/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: retiredImports,
          patterns: tombstonePatterns.filter((pattern) => pattern !== universalDataTombstone),
        },
      ],
    },
  },
  restrictedImports(
    ['src/bootstrap/preboot/**/*.{ts,tsx}'],
    [
      layerPattern(
        ['app', 'backend', 'frontend', 'bootstrap/composition', 'bootstrap/runtime'],
        'Preboot may patch the global runtime before composition, but must not depend on app code or composed frontend/backend modules.',
      ),
    ],
  ),
  restrictedImports(
    ['src/bootstrap/composition/**/*.{ts,tsx}'],
    [
      layerPattern(
        ['app', 'frontend', 'bootstrap/preboot', 'bootstrap/runtime'],
        'Bootstrap composition may construct backend/shared modules, but must not depend on app, frontend, preboot, or runtime owners.',
      ),
    ],
  ),
  restrictedImports(
    ['src/bootstrap/runtime/**/*.{ts,tsx}'],
    [
      layerPattern(
        ['app', 'bootstrap/preboot'],
        'Bootstrap runtime may consume composition and frontend/backend interfaces, but must not depend on app routes or rerun preboot modules.',
      ),
    ],
  ),
  restrictedImports(
    ['src/app/**/*.{ts,tsx}'],
    [
      layerPattern(
        ['app', 'backend'],
        'Expo Router files may depend only on bootstrap, frontend, and shared modules.',
      ),
    ],
  ),
  {
    files: ['src/backend/**/*.{ts,tsx}'],
    ignores: [...piZoneFiles, ...aiSdkGenerationZoneFiles],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [backendLayer, piIsolation, aiSdkGenerationPrivacy] },
      ],
    },
  },
  // The facade and its own implementation are the inside of the generation
  // boundary; the Pi ban still applies to them.
  restrictedImports(aiSdkGenerationZoneFiles, [backendLayer, piIsolation]),
  // The Agent Runtime contract and its FakeRuntime are process-local but must
  // stay independent of the application protocol, persistence, React, and Expo
  // (Runtime dependency rule and conformance item 11 in
  // docs/references/agent/agent-runtime.md). Tests under __tests__ arrange
  // requests and may touch node builtins, so they are exempt.
  {
    files: ['src/backend/ai/agent/runtime/**/*.{ts,tsx}'],
    ignores: [
      'src/backend/ai/agent/runtime/**/__tests__/**/*.{ts,tsx}',
      'src/backend/ai/agent/runtime/pi/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [backendLayer, runtimeContractLayer, sharedPlatformIndependence, piIsolation] },
      ],
    },
  },
  // The Pi implementation honors the same contract constraints but is the one
  // Runtime directory allowed to name Pi modules and @earendil-works packages.
  // The exception below matches the boundary the PiRuntime conformance harness
  // draws with its `sourceFiles` list, so lint and conformance agree on which
  // files must stay pure.
  {
    files: ['src/backend/ai/agent/runtime/pi/**/*.{ts,tsx}'],
    ignores: [
      'src/backend/ai/agent/runtime/pi/__tests__/**/*.{ts,tsx}',
      'src/backend/ai/agent/runtime/pi/piModelResolver.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [backendLayer, runtimeContractLayer, sharedPlatformIndependence] },
      ],
    },
  },
  // `piModelResolver.ts` is the Pi zone's one bridge from app entities to Pi: it
  // reads Provider and Model records and materializes an Expo-backed fetch,
  // which is precisely what the contract layer may not do. Pi runtime tests
  // arrange fixtures with node builtins. Both keep only the backend layer rule.
  restrictedImports(
    [
      'src/backend/ai/agent/runtime/pi/piModelResolver.ts',
      'src/backend/ai/agent/runtime/pi/__tests__/**/*.{ts,tsx}',
    ],
    [backendLayer],
  ),
  restrictedImports(
    ['src/backend/services/**/*.{ts,tsx}'],
    [backendLayer, backendServicesLayer, piIsolation],
  ),
  restrictedImports(
    ['src/backend/data/**/*.{ts,tsx}'],
    [backendLayer, backendDataLayer, piIsolation],
  ),
  restrictedImports(
    ['src/backend/core/**/*.{ts,tsx}'],
    [backendLayer, backendCoreLayer, piIsolation],
  ),
  // Registration is assembly: this file names every concrete service class —
  // including the Pi Runtime binding — so it keeps only the backend layer rule.
  restrictedImports(['src/backend/core/application/serviceRegistry.ts'], [backendLayer]),
  restrictedImports(['src/frontend/**/*.{ts,tsx}'], [frontendLayer]),
  restrictedImports(sharedFrontendDirectories, [frontendLayer, frontendSharedLayer]),
  restrictedImports(['src/frontend/features/**/*.{ts,tsx}'], [frontendLayer, frontendFeatureLayer]),
  restrictedImports(['src/shared/**/*.{ts,tsx}'], [sharedLayer]),
  restrictedImports(
    ['src/shared/contracts/**/*.{ts,tsx}'],
    [sharedLayer, sharedPlatformIndependence],
  ),
  restrictedImports(
    ['packages/universal/src/**/*.{ts,tsx}'],
    [
      {
        group: ['@/*', '@/*/**', '@src/*', '@src/*/**', '@logger'],
        message:
          '@cherrystudio/universal must not depend on app code; the dependency direction is app -> package.',
      },
      {
        group: platformIndependentPackages,
        message:
          '@cherrystudio/universal mirrors desktop src/shared and must remain platform- and React-independent.',
      },
    ],
  ),
]);
