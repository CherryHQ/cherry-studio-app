const { readdirSync } = require('node:fs');
const path = require('node:path');
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');
const [todoConfig] = require('./eslint.todo.config');

const projectRoot = path.dirname(require.resolve('./package.json'));

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

const directExpoHapticsImport = {
  name: 'expo-haptics',
  message:
    'Use haptics or triggerHaptic from @cherrystudio/ui/haptics for cross-platform feedback.',
};

const retiredImports = [
  directExpoHapticsImport,
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

// Pre-existing callers predating `@cherrystudio/ui/haptics`. Do not add new files; shrink by migrating.
const legacyDirectHapticsFiles = [
  'src/frontend/components/ModelPicker/components/ModelPickerFastScroller.tsx',
  'src/frontend/features/chat/components/ChatInput/effortSlider/components/EffortSlider.tsx',
  'src/frontend/features/chat/voice/DictationCancelAction.tsx',
  'src/frontend/features/chat/voice/ChatInputPrimaryAction.tsx',
];

const aliasRoots = (roots) =>
  roots.flatMap((root) => [`@/${root}`, `@/${root}/*`, `@/${root}/*/**`]);

// Protect these deliberate public entries without banning all deep imports.
// Provider injection stays available to bootstrap, data internals, and test files.
const frontendPublicSurfaceZones = [
  {
    target: ['src/app', 'src/frontend/!(data)/**/!(*.test).{ts,tsx}'],
    from: 'src/frontend/data/DataApiProvider.tsx',
    message:
      'Use useApiClient from @/frontend/data for imperative resource work; DataApiProvider is the private injection boundary.',
  },
  {
    target: [
      'src/app',
      'src/frontend/!(components)/**/*',
      'src/frontend/components/!(ModelPicker)/**/*',
    ],
    from: [
      'src/frontend/components/ModelPicker/components',
      'src/frontend/components/ModelPicker/hooks',
      'src/frontend/components/ModelPicker/utils',
    ],
    message:
      'Import ModelPicker UI from @/frontend/components/ModelPicker or capability badges from its /badges entry.',
  },
  {
    target: [
      'src/app',
      'src/frontend/!(components)/**/*',
      'src/frontend/components/!(AgentEditor)/**/*',
    ],
    from: [
      'src/frontend/components/AgentEditor/AgentEditor.tsx',
      'src/frontend/components/AgentEditor/components',
      'src/frontend/components/AgentEditor/hooks',
      'src/frontend/components/AgentEditor/utils',
    ],
    message: 'Import the shared Agent form from @/frontend/components/AgentEditor.',
  },
];

const backendPublicSurfaceZones = [
  {
    target: [
      'src/bootstrap',
      'src/backend/!(ai)/**/*',
      'src/backend/ai/!(agent)/**/*',
      'src/backend/ai/agent/!(diagnostics)/**/*',
    ],
    from: 'src/backend/ai/agent/diagnostics',
    except: ['./index.ts'],
    message:
      'Import the diagnostic Agent from @/backend/ai/agent/diagnostics; its definition and tool adapters are private.',
  },
];

// Reuse the same layer declarations for resolved paths, so relative imports,
// @src aliases, re-exports, require(), and dynamic imports cannot bypass them.
const restrictedImportRules = (patterns, zones = []) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
  // Package restrictions have no app-local target for no-restricted-paths.
  // Apply their same regex to literal import()/require() loads as well.
  'no-restricted-syntax': [
    patterns.some((pattern) => pattern.regex) ? 'error' : 'off',
    ...patterns
      .filter((pattern) => pattern.regex)
      .map(({ regex, message }) => {
        // esquery uses / as its regex delimiter; a Unicode escape keeps package slashes literal.
        const source = regex.replaceAll('/', '\\u002F');
        return {
          selector: [
            `ImportExpression[source.value=/${source}/]`,
            `ImportExpression[source.type=TemplateLiteral][source.expressions.length=0][source.quasis.0.value.cooked=/${source}/]`,
            `CallExpression[callee.name=require][arguments.0.value=/${source}/]`,
            `CallExpression[callee.name=require][arguments.0.type=TemplateLiteral][arguments.0.expressions.length=0][arguments.0.quasis.0.value.cooked=/${source}/]`,
          ].join(', '),
          message,
        };
      }),
  ],
  'import/no-restricted-paths': [
    'error',
    {
      basePath: projectRoot,
      zones: [
        ...frontendPublicSurfaceZones,
        ...backendPublicSurfaceZones,
        ...patterns.flatMap((pattern) =>
          (pattern.group ?? [])
            .filter((entry) => entry.startsWith('@/') && !entry.includes('*'))
            .map((entry) => ({
              target: '.',
              from: `src/${entry.slice(2)}`,
              message: pattern.message,
            })),
        ),
        ...zones,
      ],
    },
  ],
});

const restrictedImports = (files, patterns, zones) => ({
  files,
  rules: restrictedImportRules(patterns, zones),
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

const enterpriseIsolation = layerPattern(
  ['backend/services/enterprise'],
  'Enterprise implementations stay behind shared contracts. Only bootstrap and service registration assemble them.',
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

const piIsolationMessage =
  'Pi is one Runtime implementation. Depend on the AgentRuntime contract; only agent/runtime/pi may name Pi modules or @earendil-works packages.';
const piIsolation = [
  {
    regex: '^@earendil-works/',
    message: piIsolationMessage,
  },
  {
    group: [...aliasRoots(['backend/ai/agent/runtime/pi']), '**/pi', '**/pi/**'],
    message: piIsolationMessage,
  },
];

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

const frontendSharedLayer = layerPattern(
  ['frontend/features'],
  'Shared frontend modules must not depend on pages; move the shared capability down instead.',
);

const frontendImplementationPackages = {
  regex:
    '^(?:ai(?:/|$)|@ai-sdk/|@earendil-works/|@cherrystudio/(?:ai-core|ai-runtime|ai-sdk-provider)(?:/|$)|drizzle-orm(?:/|$)|expo-sqlite(?:/|$))',
  message:
    'Frontend consumes Data API and workflow contracts; AI SDK and database implementations belong to backend.',
};

// Each feature root is a page tree. Imports within it are allowed; independent
// pages must move shared code to a neutral owner, including type-only imports.
const frontendPageZones = readdirSync(path.join(projectRoot, 'src/frontend/features'), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    target: `src/frontend/features/${entry.name}`,
    from: 'src/frontend/features',
    except: [`./${entry.name}`],
    message:
      'Independent page trees must not import each other. Move shared capabilities to frontend components, hooks, data, or utils.',
  }));

const sharedLayer = layerPattern(
  ['app', 'backend', 'bootstrap', 'frontend'],
  'Shared modules must not depend on an upper layer.',
);

const sharedPlatformIndependence = {
  regex: '^(?:react(?:/|$)|react-native(?:[-/]|$)|expo(?:[-/]|$)|@expo/)',
  message:
    'Shared contracts, data, AI rules, and utilities must remain platform- and React-independent.',
};

const sharedFrontendDirectories = [
  'src/frontend/appShell/**/*.{ts,tsx}',
  'src/frontend/components/**/*.{ts,tsx}',
  'src/frontend/data/**/*.{ts,tsx}',
  'src/frontend/hooks/**/*.{ts,tsx}',
  'src/frontend/i18n/**/*.{ts,tsx}',
  'src/frontend/types/**/*.{ts,tsx}',
  'src/frontend/utils/**/*.{ts,tsx}',
];

const toSortedRestriction = {
  property: 'toSorted',
  message: 'Hermes lacks Array.prototype.toSorted. Sort a copy with [...items].sort().',
};

const pageRawSchedulingMessage = {
  setTimeout:
    'Do not call raw setTimeout in page code. Use useDebouncedValue, useTransientValue, createDebouncedAction, createScheduledFlush, or yieldToRuntime from shared building blocks.',
  setInterval:
    'Do not call raw setInterval in page code. Use useElapsedTime or a shared hook in src/frontend/hooks.',
  requestAnimationFrame:
    'Do not call raw requestAnimationFrame in page code. Prefer declarative layout/state, or use useNextFrame / createFrameLoop.',
};

const pageRawSchedulingPropertyRestrictions = ['globalThis', 'window', 'global'].flatMap((object) =>
  Object.entries(pageRawSchedulingMessage).map(([property, message]) => ({
    object,
    property,
    message,
  })),
);

const pageUseEffectMessage =
  'Do not add raw useEffect in page code. Derive state during render, handle actions in event callbacks, read latest values in effects with useEffectEvent, subscribe with useSyncExternalStore, or extract a reusable hook under src/frontend/hooks.';

// Existing direct React effect references are capped per file. Reduce the cap with removals.
const legacyPageUseEffectLimits = {
  'src/app/onboarding/device-connections/pair.tsx': 1,
  'src/frontend/features/chat/ChatScreen.tsx': 1,
  'src/frontend/features/chat/components/ChatInput/ChatInput.tsx': 2,
  'src/frontend/features/chat/components/ChatInput/components/ChatInputPluginSheet.tsx': 1,
  'src/frontend/features/chat/components/ChatInput/components/ChatInputPromptSheet.tsx': 2,
  'src/frontend/features/chat/components/ChatInput/components/ChatInputSkillSheet.tsx': 1,
  'src/frontend/features/chat/components/ChatInput/components/ChatInputSsh.tsx': 1,
  'src/frontend/features/chat/components/ChatInput/effortSlider/components/EffortSlider.tsx': 1,
  'src/frontend/features/chat/components/ChatInput/hooks/useChatInputReasoningEffortSelection.ts': 1,
  'src/frontend/features/chat/components/ChatRouteResolver/ChatRouteResolver.tsx': 1,
  'src/frontend/features/chat/components/ChatWorkspace/ChatWorkspace.tsx': 1,
  'src/frontend/features/chat/components/ChatWorkspace/components/ExpandedAnswer.tsx': 4,
  'src/frontend/features/chat/components/ChatWorkspace/context/AssistantMessageActionsProvider.tsx': 2,
  'src/frontend/features/chat/components/ChatWorkspace/hooks/useConversationFeedbackHint.ts': 2,
  'src/frontend/features/chat/components/ChatWorkspace/hooks/useMessageUsageRecords.ts': 1,
  'src/frontend/features/chat/components/ConversationMessageContent.tsx': 1,
  'src/frontend/features/chat/components/UserQuestionSheet/UserQuestionSheet.tsx': 1,
  'src/frontend/features/chat/components/UserQuestionSheet/useUserQuestionForm.ts': 1,
  'src/frontend/features/chat/composer/useComposerHandoffAppend.ts': 1,
  'src/frontend/features/chat/hooks/useConversationResourceValue.ts': 1,
  'src/frontend/features/chat/quotes/ChatQuoteProvider.tsx': 2,
  'src/frontend/features/chat/remote/RemoteChatScreen.tsx': 1,
  'src/frontend/features/chat/remote/RemoteComposer.tsx': 4,
  'src/frontend/features/chat/remote/useRemoteDraftPersistence.ts': 2,
  'src/frontend/features/chat/runtime/ChatProvider.tsx': 4,
  'src/frontend/features/chat/runtime/useLocalConversation.ts': 2,
  'src/frontend/features/chat/share/ChatShareDragSelection.tsx': 4,
  'src/frontend/features/chat/share/ChatShareSelectionProvider.tsx': 2,
  'src/frontend/features/chat/share/useShareChat.ts': 1,
  'src/frontend/features/chat/voice/ChatInputPrimaryAction.tsx': 2,
  'src/frontend/features/drawings/templates/components/TemplateStage.tsx': 2,
  'src/frontend/features/files/FileViewerScreen.tsx': 1,
  'src/frontend/features/files/components/FileDocumentPreview.tsx': 2,
  'src/frontend/features/files/hooks/useFileImageEdit.ts': 1,
  'src/frontend/features/home/aiUsage/components/AiUsageCalendar.tsx': 1,
  'src/frontend/features/home/aiUsage/hooks/useAiUsageOverview.ts': 1,
  'src/frontend/features/library/hooks/useAudioTranscription.ts': 1,
  'src/frontend/features/library/hooks/useFileEntries.ts': 1,
  'src/frontend/features/onboarding/components/LogoDraw/hooks/useLogoDrawProgress.ts': 3,
  'src/frontend/features/onboarding/components/OnboardingPage/OnboardingPage.tsx': 2,
  'src/frontend/features/onboarding/setup/AccountOnboardingStep.tsx': 1,
  'src/frontend/features/onboarding/setup/ModelSourceOnboardingStep.tsx': 1,
  'src/frontend/features/onboarding/setup/NotificationsOnboardingStep.tsx': 1,
  'src/frontend/features/onboarding/setup/useNotificationOnboardingActions.ts': 1,
  'src/frontend/features/onboarding/setup/useOnboardingProgress.ts': 1,
  'src/frontend/features/paintings/components/PaintingBoardWorkspace.tsx': 1,
  'src/frontend/features/paintings/hooks/usePaintingFocusReference.ts': 1,
  'src/frontend/features/plugin/builtinTool/apiService/components/WebSearchApiServiceCommitInput.tsx': 3,
  'src/frontend/features/plugin/builtinTool/apiService/hooks/useWebSearchProviderCheck.ts': 1,
  'src/frontend/features/plugin/detail/connect/CredentialConnect.tsx': 1,
  'src/frontend/features/plugin/detail/connect/PluginCallbackScreen.tsx': 1,
  'src/frontend/features/plugin/detail/connect/useInteractiveConnect.ts': 1,
  'src/frontend/features/plugin/mcpServer/McpOAuthCallbackScreen.tsx': 1,
  'src/frontend/features/remoteTask/RemoteTaskListScreen.tsx': 1,
  'src/frontend/features/search/SearchScreen.tsx': 1,
  'src/frontend/features/search/useAppSearchResults.ts': 2,
  'src/frontend/features/settings/DeviceConnectionsScreen/DeviceConnectionPairingScreen.tsx': 1,
  'src/frontend/features/settings/about/diagnostics/useDiagnosticBundle.ts': 1,
  'src/frontend/features/settings/data/DataScreen.tsx': 1,
  'src/frontend/features/settings/data/deepseek/DeepseekImportScreen.tsx': 1,
  'src/frontend/features/settings/notifications/NotificationSettingsScreen.tsx': 1,
  'src/frontend/features/settings/profile/ProfileSettingsScreen.tsx': 1,
  'src/frontend/features/settings/provider/account/ProviderAccountCallbackScreen.tsx': 1,
  'src/frontend/features/settings/provider/components/ProviderAccount/useProviderAccount.ts': 1,
  'src/frontend/features/settings/provider/components/ProviderConfiguration/hooks/useSavedProviderConfiguration.ts': 1,
  'src/frontend/features/settings/provider/detail/ProviderDetailScreen.tsx': 1,
  'src/frontend/features/settings/provider/detail/modelAdd/components/ProviderModelSyncTask.tsx': 1,
  'src/frontend/features/settings/provider/detail/modelAdd/hooks/useProviderModelTask.ts': 1,
  'src/frontend/features/settings/provider/hooks/useProviderSetup.ts': 1,
  'src/frontend/features/settings/provider/models/hooks/useProviderModelCheck.ts': 1,
  'src/frontend/features/settings/provider/models/hooks/useProviderModelPull.ts': 1,
  'src/frontend/features/shareDestination/ShareDestinationScreen.tsx': 1,
  'src/frontend/features/sharing/ShareScreen.tsx': 1,
  'src/frontend/features/sharing/components/DocumentPagePreview.tsx': 1,
  'src/frontend/features/sharing/components/DocumentShareSheet.tsx': 1,
  'src/frontend/features/sharing/components/FileShareSheet.tsx': 2,
  'src/frontend/features/sharing/hooks/useDocumentExportHtmlCapture.ts': 1,
  'src/frontend/features/sharing/hooks/useDocumentExportPreview.ts': 1,
  'src/frontend/features/sharing/hooks/useHtmlConversion.tsx': 1,
};

const pageSchedulingPlugin = {
  rules: {
    'use-effect-limit': {
      meta: { schema: [{ type: 'object', additionalProperties: { type: 'integer' } }] },
      create(context) {
        const { sourceCode } = context;
        const filename = path.relative(projectRoot, context.filename).split(path.sep).join('/');
        const limit = context.options[0][filename] ?? 0;
        const imports = [];
        return {
          ImportDeclaration(node) {
            if (node.source.value === 'react') imports.push(...node.specifiers);
          },
          'Program:exit'(program) {
            const effects = [];
            for (const specifier of imports) {
              const [binding] = sourceCode.getDeclaredVariables(specifier);
              if (!binding) continue;
              const references = binding.references.map((reference) => reference.identifier);
              if (specifier.type === 'ImportSpecifier') {
                if ((specifier.imported.name ?? specifier.imported.value) === 'useEffect') {
                  effects.push(...(references.length === 0 ? [specifier] : references));
                }
              } else {
                for (const reference of references) {
                  const access = reference.parent;
                  if (
                    access.type === 'MemberExpression' &&
                    access.object === reference &&
                    (access.computed ? access.property.value : access.property.name) === 'useEffect'
                  ) {
                    effects.push(access);
                  }
                }
              }
            }
            effects.sort((left, right) => left.range[0] - right.range[0]);
            for (const node of effects.slice(limit)) {
              context.report({ node, message: pageUseEffectMessage });
            }
            if (effects.length < limit) {
              context.report({
                node: program,
                message: `Reduce the legacy useEffect limit for ${filename} from ${limit} to ${effects.length}.`,
              });
            }
          },
        };
      },
    },
  },
};

module.exports = defineConfig([
  expoConfig,
  {
    plugins: todoConfig.plugins,
    rules: {
      ...todoConfig.rules,
      // Reanimated SharedValue.value mutation is idiomatic inside worklets and
      // gesture callbacks, but the React Compiler rule cannot distinguish it.
      'react-hooks/immutability': 'off',
      // Jest runs on Node, which has toSorted, but the app's Hermes engine does not,
      // so a call passes tests and then throws on device.
      'no-restricted-properties': ['error', toSortedRestriction],
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
  {
    name: 'legacy-direct-haptics-allowlist',
    files: legacyDirectHapticsFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: retiredImports.filter((entry) => entry !== directExpoHapticsImport),
          patterns: tombstonePatterns,
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
    rules: restrictedImportRules([
      backendLayer,
      enterpriseIsolation,
      ...piIsolation,
      aiSdkGenerationPrivacy,
    ]),
  },
  // The facade and its own implementation are the inside of the generation
  // boundary; the Pi ban still applies to them.
  restrictedImports(aiSdkGenerationZoneFiles, [backendLayer, enterpriseIsolation, ...piIsolation]),
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
    rules: restrictedImportRules([
      backendLayer,
      enterpriseIsolation,
      runtimeContractLayer,
      sharedPlatformIndependence,
      ...piIsolation,
    ]),
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
      'src/backend/ai/agent/runtime/pi/PiProviderAccountAdapter.ts',
    ],
    rules: restrictedImportRules([
      backendLayer,
      enterpriseIsolation,
      runtimeContractLayer,
      sharedPlatformIndependence,
    ]),
  },
  // `piModelResolver.ts` bridges app model records to Pi; `PiProviderAccountAdapter`
  // bridges native account storage, fetch, and crypto. The model resolver
  // reads Provider and Model records and materializes an Expo-backed fetch,
  // which is precisely what the contract layer may not do. Pi runtime tests
  // arrange fixtures with node builtins. These files keep only the backend layer rule.
  restrictedImports(
    [
      'src/backend/ai/agent/runtime/pi/piModelResolver.ts',
      'src/backend/ai/agent/runtime/pi/PiProviderAccountAdapter.ts',
      'src/backend/ai/agent/runtime/pi/__tests__/**/*.{ts,tsx}',
    ],
    [backendLayer, enterpriseIsolation],
  ),
  restrictedImports(
    ['src/backend/services/**/*.{ts,tsx}'],
    [backendLayer, enterpriseIsolation, backendServicesLayer, ...piIsolation],
  ),
  restrictedImports(
    ['src/backend/services/enterprise/**/*.{ts,tsx}'],
    [backendLayer, backendServicesLayer, ...piIsolation],
  ),
  restrictedImports(
    ['src/backend/data/**/*.{ts,tsx}'],
    [backendLayer, enterpriseIsolation, backendDataLayer, ...piIsolation],
  ),
  restrictedImports(
    ['src/backend/core/**/*.{ts,tsx}'],
    [backendLayer, enterpriseIsolation, backendCoreLayer, ...piIsolation],
  ),
  // Registration is assembly: this file names every concrete service class —
  // including the Pi Runtime binding — so it keeps only the backend layer rule.
  restrictedImports(['src/backend/core/application/serviceRegistry.ts'], [backendLayer]),
  restrictedImports(
    ['src/frontend/**/*.{ts,tsx}'],
    [frontendLayer, frontendImplementationPackages],
  ),
  restrictedImports(sharedFrontendDirectories, [
    frontendLayer,
    frontendSharedLayer,
    frontendImplementationPackages,
  ]),
  restrictedImports(
    ['src/frontend/features/**/*.{ts,tsx}'],
    [frontendLayer, frontendImplementationPackages],
    frontendPageZones,
  ),
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/frontend/features/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...Object.entries(pageRawSchedulingMessage).map(([name, message]) => ({
          name,
          message,
        })),
      ],
      // Flat-config blocks replace matching rules, so retain the global toSorted guard here.
      'no-restricted-properties': [
        'error',
        toSortedRestriction,
        ...pageRawSchedulingPropertyRestrictions,
      ],
    },
  },
  {
    name: 'page-use-effect-guardrail',
    files: ['src/app/**/*.{ts,tsx}', 'src/frontend/features/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    plugins: { 'cherry-page': pageSchedulingPlugin },
    rules: {
      'cherry-page/use-effect-limit': ['error', legacyPageUseEffectLimits],
    },
  },
  restrictedImports(['src/shared/**/*.{ts,tsx}'], [sharedLayer]),
  restrictedImports(
    ['src/shared/{contracts,data,utils}/**/*.{ts,tsx}'],
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
        ...sharedPlatformIndependence,
        message:
          '@cherrystudio/universal mirrors desktop src/shared and must remain platform- and React-independent.',
      },
    ],
    [
      {
        target: 'packages/universal/src',
        from: 'src',
        message: 'Packages must not depend on app code.',
      },
    ],
  ),
]);
