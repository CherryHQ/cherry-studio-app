const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

// ── Layer boundaries (ADR 0010) ──
// Dependency direction: app → features → {runtime, components, hooks} →
// {ai, services} → data → {core, utils}. The blocks below make the
// upward edges lint errors so the layering cannot silently regress.

// Retired module paths. These exist so a stale branch or muscle memory gets a
// pointer to the new home instead of a bare "module not found".
const tombstonePatterns = [
  { group: ['@/config/constants'], message: 'Moved to @/utils/constants.' },
  {
    group: ['@/screens', '@/screens/*', '@/screens/*/**'],
    message: 'Screens moved to @/features/<name> (ADR 0010).',
  },
  { group: ['@/data/runtime', '@/data/runtime/*'], message: 'Moved to @/runtime.' },
  {
    group: ['@/data/services/createDataServices'],
    message: 'Moved to @/runtime/createDataServices.',
  },
  { group: ['@/data/bootstrap', '@/data/bootstrap/*'], message: 'Moved to @/runtime/appRuntime.' },
  { group: ['@/data/hooks', '@/data/hooks/*'], message: 'Moved to @/hooks/data.' },
  {
    group: ['@/integration', '@/integration/*', '@/integration/*/**'],
    message: 'cherryAi moved to @/services/cherryin/signature.',
  },
  {
    group: ['@/hooks/paintings', '@/hooks/paintings/*'],
    message: 'Moved into @/features/paintings/hooks/usePaintings.',
  },
];

const noUpwardImport = (layer, groups) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    '@typescript-eslint/no-restricted-imports': ['error', { patterns: groups }],
  },
});

const uiLayerMessage = (layer) => `src/${layer} must not depend on UI or app layers.`;

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // react-hooks/immutability is a React Compiler rule that doesn't understand
      // react-native-reanimated's SharedValue.value mutation pattern, which is the
      // idiomatic way to update shared values from worklets and gesture callbacks.
      'react-hooks/immutability': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: tombstonePatterns }],
    },
  },
  noUpwardImport('data', [
    {
      group: ['@/features/*', '@/components/*', '@/app/*', '@/ai', '@/ai/*', '@/hooks/*'],
      message: uiLayerMessage('data') + ' The data layer is the bottom tier.',
    },
    {
      group: ['@/runtime', '@/runtime/*'],
      allowTypeImports: true,
      message:
        'src/data must not reach the runtime tier at runtime; only type-only imports (e.g. DataServices) are allowed.',
    },
  ]),
  noUpwardImport('ai', [
    {
      group: ['@/features/*', '@/components/*', '@/app/*', '@/hooks/*'],
      message: uiLayerMessage('ai'),
    },
    {
      group: ['@/runtime', '@/runtime/*'],
      allowTypeImports: true,
      message:
        'src/ai is constructed by the runtime tier, never the reverse; type-only imports allowed.',
    },
    {
      group: ['@/data/*', '@/data/*/*', '@/data/*/*/**', '!@/data/types', '!@/data/types/*'],
      allowTypeImports: true,
      message:
        'src/ai may value-import only @/data/types; services and other data modules are injected, so import their types only.',
    },
  ]),
  noUpwardImport('services', [
    {
      group: ['@/ai', '@/ai/*'],
      message:
        'src/services must not import src/ai — this direction was a cycle (ADR 0010); shared constants live in @/utils.',
    },
    {
      group: ['@/features/*', '@/components/*', '@/app/*', '@/hooks/*', '@/runtime', '@/runtime/*'],
      message: uiLayerMessage('services'),
    },
  ]),
  noUpwardImport('runtime', [
    {
      group: ['@/features/*', '@/components/*', '@/app/*', '@/hooks/*'],
      message:
        'The runtime tier only wires ai/services/data together; feature-owned runtime owners (e.g. ChatRuntime) stay in their feature (ADR 0001).',
    },
  ]),
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}', 'src/utils/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/app/*'],
              message:
                'Shared UI layers must not depend on features or routes; move the shared piece down instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*'],
              message: 'Features must not import route files; routes import features.',
            },
            {
              // Cross-feature imports go through a feature's public surface:
              // `@/features/<f>` or `@/features/<f>/<area>` (two levels). The
              // exceptions are the sanctioned pure-logic modules documented in
              // features/chat/input/index.ts, plus the shared SettingSelect
              // row. Same-feature files use relative paths, which this alias
              // pattern never matches. Type-only deep imports are allowed.
              // Gitignore semantics: a `!` exception cannot resurrect a path
              // whose ancestor directory is banned, so each sanctioned module
              // needs the classic dance — unban its directory, ban the
              // directory's children, unban the one module.
              group: [
                '@/features/*/*/*',
                '@/features/*/*/*/*',
                '@/features/*/*/*/*/*',
                '@/features/*/*/*/*/*/*',
                '!@/features/chat/input/chatInputLayout',
                '!@/features/chat/input/utils',
                '@/features/chat/input/utils/*',
                '!@/features/chat/input/utils/chatInputAttachments',
                '!@/features/chat/input/hooks',
                '@/features/chat/input/hooks/*',
                '!@/features/chat/input/hooks/useChatInputPhotoPicker',
                '!@/features/settings/components',
                '@/features/settings/components/*',
                '!@/features/settings/components/SettingSelect',
              ],
              allowTypeImports: true,
              message:
                "Deep cross-feature import: use the feature's public surface (@/features/<f> or @/features/<f>/<area>), or add the module to the sanctioned surface deliberately.",
            },
          ],
        },
      ],
    },
  },
]);
