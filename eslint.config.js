const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

// Layer dependency direction (ADR 0011):
// app -> {bootstrap, frontend, shared}
// bootstrap -> {backend, frontend, shared}
// frontend -> {frontend, shared}
// backend -> {backend, shared}
// backend internals: ai -> {services, data}; services -> data
// shared -> shared

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

const tombstonePatterns = [
  {
    group: retiredRootPatterns,
    message:
      'This root path was retired by ADR 0011. Import from @/frontend, @/backend, @/shared, or @/bootstrap.',
  },
  {
    group: ['@/config/constants'],
    message: 'Constants now live in the owning layer under its utils directory.',
  },
  {
    group: ['@/shared/domain', '@/shared/domain/*', '@/shared/domain/*/**'],
    message:
      'The generic shared domain root was retired. Use @/shared/ai for AI rules, @/shared/data for data vocabulary, or @/shared/utils for pure helpers.',
  },
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
  restrictedImports(
    ['src/frontend/**/*.{ts,tsx}'],
    [
      layerPattern(
        ['app', 'backend', 'bootstrap'],
        'Frontend may depend only on frontend and shared modules. Use Data API hooks for resources, preference hooks for settings, and useBackendModule() for workflows.',
      ),
    ],
  ),
  restrictedImports(
    ['src/backend/**/*.{ts,tsx}'],
    [
      layerPattern(
        ['app', 'bootstrap', 'frontend'],
        'Backend may depend only on backend and shared modules. Bootstrap owns cross-layer assembly.',
      ),
    ],
  ),
  restrictedImports(
    ['src/backend/services/**/*.{ts,tsx}'],
    [
      {
        group: aliasRoots(['backend/ai']),
        message:
          'Backend services receive AI capabilities through constructor interfaces; bootstrap owns concrete assembly.',
      },
    ],
  ),
  restrictedImports(
    ['src/backend/data/**/*.{ts,tsx}'],
    [
      {
        group: aliasRoots(['backend/ai', 'backend/services']),
        message: 'Backend data modules must not depend on AI or general backend services.',
      },
    ],
  ),
  restrictedImports(
    ['src/shared/**/*.{ts,tsx}'],
    [
      layerPattern(
        ['app', 'backend', 'bootstrap', 'frontend'],
        'Shared modules must not depend on an upper layer.',
      ),
    ],
  ),
  restrictedImports(
    [
      'src/shared/ai/**/*.{ts,tsx}',
      'src/shared/contracts/**/*.{ts,tsx}',
      'src/shared/data/**/*.{ts,tsx}',
      'src/shared/utils/**/*.{ts,tsx}',
    ],
    [
      {
        group: [
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
        ],
        message:
          'Shared contracts, data, AI rules, and utilities must remain platform- and React-independent.',
      },
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
  restrictedImports(
    [
      'src/frontend/components/**/*.{ts,tsx}',
      'src/frontend/data/**/*.{ts,tsx}',
      'src/frontend/hooks/**/*.{ts,tsx}',
      'src/frontend/i18n/**/*.{ts,tsx}',
      'src/frontend/types/**/*.{ts,tsx}',
      'src/frontend/utils/**/*.{ts,tsx}',
    ],
    [
      {
        group: ['@/frontend/features/*', '@/frontend/features/*/**'],
        message:
          'Shared frontend modules must not depend on features; move the shared capability down instead.',
      },
    ],
  ),
  restrictedImports(
    ['src/frontend/features/**/*.{ts,tsx}'],
    [
      {
        // Cross-feature imports go through a feature's public surface:
        // `@/frontend/features/<feature>` or one documented area below it.
        // Gitignore-style negations must first unban each ancestor directory.
        group: [
          '@/frontend/features/*/*/*',
          '@/frontend/features/*/*/*/*',
          '@/frontend/features/*/*/*/*/*',
          '@/frontend/features/*/*/*/*/*/*',
          '!@/frontend/features/chat/input/chatInputLayout',
          '!@/frontend/features/chat/input/utils',
          '@/frontend/features/chat/input/utils/*',
          '!@/frontend/features/chat/input/utils/chatInputAttachments',
          '!@/frontend/features/chat/input/hooks',
          '@/frontend/features/chat/input/hooks/*',
          '!@/frontend/features/chat/input/hooks/useChatInputPhotoPicker',
          '!@/frontend/features/settings/components',
          '@/frontend/features/settings/components/*',
          '!@/frontend/features/settings/components/SettingSelect',
        ],
        allowTypeImports: true,
        message:
          "Deep cross-feature import: use the feature's public surface or add a deliberate sanctioned export.",
      },
    ],
  ),
]);
