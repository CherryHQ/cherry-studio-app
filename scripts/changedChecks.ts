import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export type ChangedFile = {
  path: string;
  exists: boolean;
};

export type CheckCommand = 'plan' | 'test' | 'typecheck' | 'lint' | 'all';
export type PlanMode = 'incremental' | 'full';
export type SuiteMode = 'skip' | 'incremental' | 'full';

export type ChangedChecksPlan = {
  mode: PlanMode;
  noTests: boolean;
  changedFiles: ChangedFile[];
  fullReasons: string[];
  tests: {
    aiRuntime: {
      mode: SuiteMode;
      targets: string[];
      explicitTests: string[];
    };
    app: {
      mode: SuiteMode;
      relatedTargets: string[];
      explicitTests: string[];
    };
  };
  typecheck: {
    aiRuntime: boolean;
    filePreviewWebview: boolean;
    mermaidWebview: boolean;
    app: boolean;
  };
  lint: {
    mode: SuiteMode;
    oxlintFiles: string[];
    expoLintFiles: string[];
    todoLintFiles: string[];
  };
  format: {
    mode: SuiteMode;
    files: string[];
  };
  specialized: {
    actionlint: boolean;
    i18n: boolean;
    uiBoundaries: boolean;
    aiRuntimeBoundaries: boolean;
    designTokens: boolean;
    appTheme: boolean;
    icons: boolean;
    docsLinks: boolean;
    features: boolean;
    skills: boolean;
  };
  outputs: {
    mode: PlanMode;
    run_test: boolean;
    run_typecheck: boolean;
    run_lint: boolean;
    run_actionlint: boolean;
    run_node_lint: boolean;
    changed_count: number;
  };
};

export type CollectChangedFilesResult = {
  files: ChangedFile[];
  fallbackFull: boolean;
  fallbackReasons: string[];
};

export type ParsedCliArgs = {
  command: CheckCommand;
  base?: string;
  head?: string;
  full: boolean;
  noTests: boolean;
  json: boolean;
  dryRun: boolean;
  githubOutputs: boolean;
};

export type SubprocessCommand = {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
};

type NonImportMappingRule = {
  description: string;
  matches: (filePath: string) => boolean;
  tests: readonly string[];
};

const VALID_COMMANDS = new Set<CheckCommand>(['plan', 'test', 'typecheck', 'lint', 'all']);

const IGNORED_WORKTREE_PREFIXES = ['.context/', '.local/', 'node_modules/', '.expo/'] as const;

const OXLINT_IGNORED_PREFIXES = [
  '.agents/',
  '.context/',
  '.expo/',
  '.vscode/',
  'android/',
  'ios/',
  'assets/',
  'patches/',
  'dist/',
  'web-build/',
  'packages/ai-core/',
  'packages/ai-sdk-provider/',
  'packages/lucide-uniwind/src/icons/',
  'packages/design-tokens/src/styles/',
  'packages/ui/src/icons-webp/',
] as const;

const OXLINT_IGNORED_EXACT = new Set([
  '.rnstorybook/storybook.requires.ts',
  'packages/lucide-uniwind/src/index.ts',
  'packages/design-tokens/scripts/theme-contract.ts',
  'packages/ui/src/icons/desktop-routing.ts',
  'src/types/uniwind-types.d.ts',
]);

const OXFMT_IGNORED_PREFIXES = [
  ...OXLINT_IGNORED_PREFIXES,
  'packages/remote-protocol/',
  'packages/remote-transport/',
] as const;

const OXFMT_IGNORED_EXACT = OXLINT_IGNORED_EXACT;

const JS_TS_FILE_RE = /\.(js|jsx|ts|tsx|cjs|mjs|cts|mts)$/;
const EXPO_LINT_FILE_RE = /\.(js|jsx|ts|tsx|mjs|cjs)$/;
const FORMATTABLE_FILE_RE = /\.(js|jsx|ts|tsx|cjs|mjs|cts|mts|json|jsonc|css)$/;
const JEST_SOURCE_OR_CONFIG_RE = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;
const TS_SOURCE_RE = /\.(ts|tsx|mts|cts)$/;
const TSX_OR_TS_RE = /\.tsx?$/;

const GLOBAL_BOTH_FULL_FILES = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']);

const APP_JEST_FULL_FILES = new Set([
  ...GLOBAL_BOTH_FULL_FILES,
  'jest.config.js',
  'jest.setup.ts',
  'babel.config.js',
  'tsconfig.json',
  'packages/ai-runtime/package.json',
  'packages/universal/package.json',
]);

const AI_RUNTIME_VITEST_FULL_FILES = new Set([
  ...GLOBAL_BOTH_FULL_FILES,
  'packages/ai-runtime/package.json',
  'packages/ai-runtime/vitest.config.ts',
  'packages/ai-runtime/tsconfig.json',
  'packages/universal/package.json',
]);

const LINT_FULL_FILES = new Set(['eslint.config.js', 'eslint.todo.config.js', '.oxlintrc.json']);
const FORMAT_FULL_FILES = new Set(['.oxfmtrc.json']);

const ROOT_JEST_RELATED_FILES = new Set([
  'app.config.ts',
  'app.json',
  'metro.config.js',
  'fingerprint.config.js',
  'eslint.config.js',
  'eslint.todo.config.js',
  'index.ts',
]);

export const NON_IMPORT_AI_RUNTIME_RULES: readonly NonImportMappingRule[] = [
  {
    description: '@ai-sdk/google patch',
    matches: (filePath) => filePath.startsWith('patches/@ai-sdk__google@'),
    tests: ['packages/ai-runtime/src/provider/__tests__/googleImageRoutingPatch.test.ts'],
  },
  {
    description: '@ai-sdk/openai patch',
    matches: (filePath) => filePath.startsWith('patches/@ai-sdk__openai@'),
    tests: ['packages/ai-runtime/src/provider/__tests__/openaiImageUrlPatch.test.ts'],
  },
];

export const NON_IMPORT_APP_RULES: readonly NonImportMappingRule[] = [
  {
    description: 'accounts-portal patch',
    matches: (filePath) => filePath.startsWith('patches/@cherryinternal__accounts-portal@'),
    tests: ['scripts/__tests__/accountsPortalIdentityTokens.test.ts'],
  },
  {
    description: 'react-native-enriched-markdown patch',
    matches: (filePath) => filePath.startsWith('patches/react-native-enriched-markdown@'),
    tests: [
      'scripts/__tests__/enrichedMarkdownAccessibility.test.ts',
      'scripts/__tests__/enrichedMarkdownAtomicLinks.test.ts',
      'scripts/__tests__/enrichedMarkdownInlineMath.test.ts',
      'scripts/__tests__/enrichedMarkdownInputLinkPress.test.ts',
      'scripts/__tests__/enrichedMarkdownInputMeasurement.test.ts',
      'scripts/__tests__/enrichedMarkdownMathWidth.test.ts',
      'scripts/__tests__/enrichedMarkdownPaste.test.ts',
      'scripts/__tests__/enrichedMarkdownSubmit.test.ts',
      'scripts/__tests__/enrichedMarkdownYamlScanner.test.ts',
      'packages/ui/src/components/composer/__tests__/composer-native-patch.test.ts',
      'packages/ui/src/components/composer/__tests__/paste-input-native-patch.test.ts',
      'packages/ui/src/components/markdown-text/__tests__/markdown-native-patch.test.ts',
    ],
  },
  {
    description: 'react-native-screens patch',
    matches: (filePath) => filePath.startsWith('patches/react-native-screens@'),
    tests: [
      'scripts/__tests__/androidWindowCompatibility.test.ts',
      'src/frontend/appShell/header/__tests__/reactNativeScreensPatch.test.ts',
      'src/frontend/appShell/header/__tests__/toolbarSpacerPatch.test.ts',
    ],
  },
  {
    description: 'react-native patch',
    matches: (filePath) => filePath.startsWith('patches/react-native@'),
    tests: [
      'scripts/__tests__/reactNativeTextCache.test.ts',
      'src/bootstrap/preboot/__tests__/abortSignal.test.ts',
    ],
  },
  {
    description: 'expo-modules-core patch',
    matches: (filePath) => filePath.startsWith('patches/expo-modules-core@'),
    tests: [
      'scripts/__tests__/expoFilePermissions.test.ts',
      'scripts/__tests__/expoModulesCoreSwiftCompatibility.test.ts',
    ],
  },
  {
    description: 'react-native-skia patch',
    matches: (filePath) => filePath.startsWith('patches/@shopify__react-native-skia@'),
    tests: ['scripts/__tests__/skiaCompilerMemory.test.ts'],
  },
  {
    description: 'sherpa-onnx patch',
    matches: (filePath) => filePath.startsWith('patches/@siteed__sherpa-onnx.rn@'),
    tests: ['scripts/__tests__/sherpaPrebuiltCache.test.ts'],
  },
  {
    description: 'nitro-modules / nitrogen patch',
    matches: (filePath) =>
      filePath.startsWith('patches/react-native-nitro-modules@') ||
      filePath.startsWith('patches/nitrogen@'),
    tests: [
      'scripts/__tests__/nitroIosCompatibility.test.ts',
      'packages/ui/src/components/menu/__tests__/nitro-view-props-patch.test.ts',
    ],
  },
  {
    description: 'react-native-gesture-handler patch',
    matches: (filePath) => filePath.startsWith('patches/react-native-gesture-handler@'),
    tests: ['scripts/__tests__/gestureHandlerPressablePatch.test.ts'],
  },
  {
    description: 'metro / metro-runtime patch',
    matches: (filePath) =>
      filePath.startsWith('patches/metro@') || filePath.startsWith('patches/metro-runtime@'),
    tests: ['scripts/__tests__/metroPackageExports.test.ts'],
  },
  {
    description: 'uniwind patch',
    matches: (filePath) => filePath.startsWith('patches/uniwind@'),
    tests: ['scripts/__tests__/uniwindAssetRegistry.test.ts'],
  },
  {
    description: 'expo-quick-look patch',
    matches: (filePath) => filePath.startsWith('patches/@magrinj__expo-quick-look@'),
    tests: ['packages/ui/src/components/file-preview/__tests__/open-file.test.ts'],
  },
  {
    description: 'expo-paste-input patch',
    matches: (filePath) => filePath.startsWith('patches/expo-paste-input@'),
    tests: ['packages/ui/src/components/composer/__tests__/paste-input-native-patch.test.ts'],
  },
  {
    description: 'react-native-streamdown patch',
    matches: (filePath) => filePath.startsWith('patches/react-native-streamdown@'),
    tests: ['packages/ui/src/components/markdown-text/__tests__/streamdown-patch.test.tsx'],
  },
  {
    description: 'chord patch',
    matches: (filePath) => filePath.startsWith('patches/@earendil-works__chord@'),
    tests: ['src/backend/ai/agent/runtime/pi/__tests__/piChordPatch.test.ts'],
  },
  {
    description: 'pi-* patch',
    matches: (filePath) => filePath.startsWith('patches/@earendil-works__pi-'),
    tests: [
      'src/backend/ai/agent/runtime/pi/__tests__/piReactNativePatches.test.ts',
      'src/backend/ai/agent/runtime/pi/__tests__/piToolSearch.test.ts',
    ],
  },
  {
    description: 'vertex-sdk patch',
    matches: (filePath) => filePath.startsWith('patches/@anthropic-ai__vertex-sdk@'),
    tests: ['src/backend/ai/agent/runtime/pi/__tests__/piVertexNative.test.ts'],
  },
  {
    description: 'drizzle-orm patch',
    matches: (filePath) => filePath.startsWith('patches/drizzle-orm@'),
    tests: ['src/backend/data/db/__tests__/drizzleExpoSessionPatch.test.ts'],
  },
  {
    description: 'react-native-background-actions patch',
    matches: (filePath) => filePath.startsWith('patches/react-native-background-actions@'),
    tests: [
      'src/backend/services/backgroundActivity/__tests__/androidBackgroundNativePatch.test.ts',
    ],
  },
  {
    description: 'react-native-anydoc patch',
    matches: (filePath) => filePath.startsWith('patches/react-native-anydoc@'),
    tests: ['src/backend/services/file/__tests__/anydocNativePatch.test.ts'],
  },
  {
    description: 'react-native-file-hash patch',
    matches: (filePath) => filePath.startsWith('patches/@preeternal__react-native-file-hash@'),
    tests: ['src/backend/services/file/__tests__/fileHashNativePatch.test.ts'],
  },
  {
    description: 'expo-calendar patch',
    matches: (filePath) => filePath.startsWith('patches/expo-calendar@'),
    tests: ['src/backend/services/permissions/__tests__/calendarNativePatch.test.ts'],
  },
  {
    description: 'expo-app-metrics patch',
    matches: (filePath) => filePath.startsWith('patches/expo-app-metrics@'),
    tests: ['src/frontend/appShell/observability/__tests__/configureObserve.test.ts'],
  },
  {
    description: 'expo-linking patch',
    matches: (filePath) => filePath.startsWith('patches/expo-linking@'),
    tests: [
      'scripts/__tests__/expoLinkingPatch.test.ts',
      'src/bootstrap/profile/__tests__/installationAccount.test.ts',
    ],
  },
  {
    description: 'expo-observe patch',
    matches: (filePath) => filePath.startsWith('patches/expo-observe@'),
    tests: ['src/frontend/appShell/observability/__tests__/observeNativePatch.test.ts'],
  },
  {
    description: 'react-native-drawer-layout patch',
    matches: (filePath) => filePath.startsWith('patches/react-native-drawer-layout@'),
    tests: ['src/frontend/appShell/sidebar/__tests__/drawerNativePatch.test.ts'],
  },
  {
    description: 'database migrations',
    matches: (filePath) => filePath.startsWith('migrations/'),
    tests: [
      'src/backend/data/db/__tests__/migrations.test.ts',
      'src/backend/data/db/__tests__/releasedMigrationDigest.test.ts',
      'src/backend/data/db/__tests__/customSql.test.ts',
      'src/backend/data/db/__tests__/backupDatabase.test.ts',
      'src/backend/data/db/__tests__/aiUsageRecordMigration.test.ts',
      'src/backend/data/db/__tests__/desktopConnectionMigration.test.ts',
      'src/backend/data/services/__tests__/AiUsageRecordService.analytics.integration.test.ts',
      'src/backend/data/services/__tests__/AuxiliaryData.integration.test.ts',
      'src/backend/data/services/__tests__/PaintingService.test.ts',
    ],
  },
  {
    description: 'Expo / EAS app config',
    matches: (filePath) =>
      filePath === 'app.json' || filePath === 'app.config.ts' || filePath === 'eas.json',
    tests: [
      'scripts/__tests__/publishUpdate.test.ts',
      'scripts/__tests__/releaseLocalBuild.test.ts',
      'scripts/__tests__/uploadIosSymbols.test.ts',
      'scripts/__tests__/reactNativeTextCache.test.ts',
      'src/backend/services/permissions/__tests__/androidPhotoPermissions.test.ts',
      'src/bootstrap/__tests__/voiceConfiguration.test.ts',
    ],
  },
  {
    description: 'ESLint boundary config',
    matches: (filePath) => filePath === 'eslint.config.js' || filePath === 'eslint.todo.config.js',
    tests: ['scripts/__tests__/architectureBoundaries.test.ts'],
  },
  {
    description: 'Metro config',
    matches: (filePath) => filePath === 'metro.config.js',
    tests: [
      'scripts/__tests__/metroResolution.test.ts',
      'scripts/__tests__/metroPackageExports.test.ts',
    ],
  },
  {
    description: 'Fingerprint config',
    matches: (filePath) => filePath === 'fingerprint.config.js',
    tests: ['scripts/__tests__/fingerprint.config.test.ts'],
  },
  {
    description: 'Release workflow',
    matches: (filePath) => filePath === '.github/workflows/release.yml',
    tests: [
      'scripts/__tests__/releaseLocalBuild.test.ts',
      'scripts/__tests__/verifyIosSymbolPackage.test.ts',
    ],
  },
  {
    description: 'OTA workflow',
    matches: (filePath) => filePath === '.github/workflows/ota-update.yml',
    tests: ['scripts/__tests__/publishUpdate.test.ts'],
  },
  {
    description: 'Instruction & skill check scripts',
    matches: (filePath) =>
      filePath === 'scripts/skillsCommon.ts' ||
      filePath === 'scripts/skillsCheck.ts' ||
      filePath === 'scripts/checkDocLinks.ts',
    tests: ['scripts/__tests__/instructionChecks.test.ts'],
  },
  {
    description: 'i18n scripts & glossary',
    matches: (filePath) =>
      filePath === 'scripts/i18n.ts' ||
      filePath === 'scripts/i18nCatalog.ts' ||
      filePath === 'scripts/i18nGlossary.json',
    tests: ['scripts/__tests__/i18nCatalog.test.ts'],
  },
  {
    description: 'md4c inline math fixture',
    matches: (filePath) =>
      filePath.startsWith('scripts/__tests__/fixtures/enrichedMarkdownInlineMath.'),
    tests: ['scripts/__tests__/enrichedMarkdownInlineMath.test.ts'],
  },
  {
    description: 'md4c math width fixture',
    matches: (filePath) =>
      filePath.startsWith('scripts/__tests__/fixtures/enrichedMarkdownMathWidth'),
    tests: ['scripts/__tests__/enrichedMarkdownMathWidth.test.ts'],
  },
];

export const EXPLICIT_NON_IMPORT_TEST_PATHS: readonly string[] = [
  ...new Set([
    ...NON_IMPORT_AI_RUNTIME_RULES.flatMap((rule) => rule.tests),
    ...NON_IMPORT_APP_RULES.flatMap((rule) => rule.tests),
  ]),
].sort();

function defaultRepoRoot(): string {
  if (typeof __dirname === 'string') {
    return path.resolve(__dirname, '..');
  }
  const scriptPath = process.argv[1];
  if (scriptPath) {
    return path.resolve(path.dirname(path.resolve(scriptPath)), '..');
  }
  return process.cwd();
}

export function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function isIgnoredWorktreePath(filePath: string): boolean {
  return IGNORED_WORKTREE_PREFIXES.some(
    (prefix) => filePath === prefix.slice(0, -1) || filePath.startsWith(prefix),
  );
}

function isIgnoredByList(
  filePath: string,
  prefixes: readonly string[],
  exact: ReadonlySet<string>,
): boolean {
  return exact.has(filePath) || prefixes.some((prefix) => filePath.startsWith(prefix));
}

function isTestPath(filePath: string): boolean {
  return /(?:^|\/)__tests__\//.test(filePath) || /\.test\.[^/]+$/.test(filePath);
}

function isPackageManifest(filePath: string): boolean {
  return /^packages\/[^/]+\/package\.json$/.test(filePath);
}

function runGit(
  rootDir: string,
  args: readonly string[],
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync('git', [...args], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function gitRefExists(rootDir: string, ref: string): boolean {
  return runGit(rootDir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok;
}

function splitNullSeparatedPaths(raw: string): string[] {
  return raw
    .split('\0')
    .map((entry) => normalizeRepoPath(entry.trim()))
    .filter((entry) => entry.length > 0 && !isIgnoredWorktreePath(entry));
}

function resolveDefaultBaseRef(rootDir: string): string | undefined {
  for (const candidate of ['origin/main', 'main']) {
    if (gitRefExists(rootDir, candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function collectChangedFiles(
  options: {
    rootDir?: string;
    base?: string;
    head?: string;
  } = {},
): CollectChangedFilesResult {
  const rootDir = options.rootDir ?? defaultRepoRoot();
  const rawPaths = new Set<string>();
  const fallbackReasons: string[] = [];
  let fallbackFull = false;

  if (options.head) {
    const headRef = options.head;
    if (!gitRefExists(rootDir, headRef)) {
      fallbackFull = true;
      fallbackReasons.push(`git head ref "${headRef}" could not be resolved`);
    } else {
      const baseCandidate = options.base ?? resolveDefaultBaseRef(rootDir);
      if (!baseCandidate || !gitRefExists(rootDir, baseCandidate)) {
        fallbackFull = true;
        fallbackReasons.push(
          baseCandidate
            ? `git base ref "${baseCandidate}" could not be resolved (shallow history?)`
            : 'no git base ref (origin/main or main) could be resolved',
        );
      } else {
        const mergeBase = runGit(rootDir, ['merge-base', baseCandidate, headRef]);
        const diffBase =
          mergeBase.ok && mergeBase.stdout.trim() ? mergeBase.stdout.trim() : baseCandidate;
        const diff = runGit(rootDir, [
          'diff',
          '--name-only',
          '-z',
          '--no-renames',
          diffBase,
          headRef,
        ]);
        if (!diff.ok) {
          fallbackFull = true;
          fallbackReasons.push(`git diff failed between ${diffBase} and ${headRef}`);
        } else {
          for (const entry of splitNullSeparatedPaths(diff.stdout)) {
            rawPaths.add(entry);
          }
        }
      }
    }
  } else {
    let baseRef: string | undefined;
    if (options.base) {
      if (!gitRefExists(rootDir, options.base)) {
        fallbackFull = true;
        fallbackReasons.push(`git base ref "${options.base}" could not be resolved`);
      } else {
        baseRef = options.base;
      }
    } else {
      baseRef = resolveDefaultBaseRef(rootDir);
      if (!baseRef) {
        fallbackFull = true;
        fallbackReasons.push('neither origin/main nor main exists to compute branch diff');
      }
    }

    if (baseRef && gitRefExists(rootDir, 'HEAD')) {
      const mergeBase = runGit(rootDir, ['merge-base', baseRef, 'HEAD']);
      const diffBase = mergeBase.ok && mergeBase.stdout.trim() ? mergeBase.stdout.trim() : baseRef;
      const committed = runGit(rootDir, [
        'diff',
        '--name-only',
        '-z',
        '--no-renames',
        diffBase,
        'HEAD',
      ]);
      if (committed.ok) {
        for (const entry of splitNullSeparatedPaths(committed.stdout)) {
          rawPaths.add(entry);
        }
      } else {
        fallbackFull = true;
        fallbackReasons.push(`git diff failed between ${diffBase} and HEAD`);
      }
    }

    const staged = runGit(rootDir, ['diff', '--name-only', '-z', '--no-renames', '--cached']);
    if (staged.ok) {
      for (const entry of splitNullSeparatedPaths(staged.stdout)) {
        rawPaths.add(entry);
      }
    }

    const unstaged = runGit(rootDir, ['diff', '--name-only', '-z', '--no-renames']);
    if (unstaged.ok) {
      for (const entry of splitNullSeparatedPaths(unstaged.stdout)) {
        rawPaths.add(entry);
      }
    }

    const untracked = runGit(rootDir, ['ls-files', '--others', '--exclude-standard', '-z']);
    if (untracked.ok) {
      for (const entry of splitNullSeparatedPaths(untracked.stdout)) {
        rawPaths.add(entry);
      }
    }
  }

  const files = [...rawPaths].sort().map((relPath) => ({
    path: relPath,
    exists: existsSync(path.join(rootDir, relPath)),
  }));

  return { files, fallbackFull, fallbackReasons };
}

function isAiRuntimeRelatedTarget(filePath: string): boolean {
  return (
    (filePath.startsWith('packages/ai-runtime/src/') ||
      filePath.startsWith('packages/universal/src/')) &&
    /\.(ts|json)$/.test(filePath)
  );
}

function isAppJestRelatedTarget(filePath: string): boolean {
  if (!JEST_SOURCE_OR_CONFIG_RE.test(filePath)) return false;
  if (ROOT_JEST_RELATED_FILES.has(filePath)) return true;
  if (
    filePath.startsWith('src/') ||
    filePath.startsWith('modules/') ||
    filePath.startsWith('plugins/')
  ) {
    return true;
  }
  if (filePath.startsWith('scripts/')) {
    return !filePath.startsWith('scripts/__tests__/fixtures/');
  }
  if (filePath.startsWith('packages/')) {
    if (filePath.startsWith('packages/ai-runtime/') && isTestPath(filePath)) return false;
    if (filePath.startsWith('packages/design-tokens/src/styles/')) return false;
    return true;
  }
  return false;
}

function isI18nSourceFile(filePath: string): boolean {
  if (filePath.startsWith('src/frontend/i18n/')) return true;
  if (filePath === 'src/shared/utils/languages.ts') return true;
  if (filePath.startsWith('scripts/i18n')) return true;
  return (
    filePath.startsWith('src/') &&
    TSX_OR_TS_RE.test(filePath) &&
    !isTestPath(filePath) &&
    !/\.(stories|d)\.tsx?$/.test(filePath)
  );
}

function isAppTypecheckTrigger(filePath: string): boolean {
  if (
    GLOBAL_BOTH_FULL_FILES.has(filePath) ||
    filePath === 'tsconfig.json' ||
    filePath === 'app.json' ||
    isPackageManifest(filePath) ||
    (filePath.startsWith('patches/') && filePath.endsWith('.patch')) ||
    (filePath.startsWith('src/frontend/i18n/locales/') && filePath.endsWith('.json'))
  ) {
    return true;
  }

  if (
    filePath.startsWith('packages/file-preview-webview/') ||
    filePath.startsWith('packages/mermaid-webview/')
  ) {
    return false;
  }

  if (
    filePath.startsWith('packages/ai-runtime/') &&
    !filePath.startsWith('packages/ai-runtime/src/')
  ) {
    return false;
  }

  return TS_SOURCE_RE.test(filePath);
}

export function planChangedChecks(
  rawFiles: readonly ChangedFile[],
  options: { full?: boolean; noTests?: boolean; fallbackReasons?: readonly string[] } = {},
): ChangedChecksPlan {
  const noTests = Boolean(options.noTests);
  const deduped = new Map<string, ChangedFile>();
  for (const file of rawFiles) {
    const normalized = normalizeRepoPath(file.path);
    if (!normalized || isIgnoredWorktreePath(normalized)) continue;
    deduped.set(normalized, { path: normalized, exists: file.exists });
  }
  const changedFiles = [...deduped.values()].sort((a, b) => a.path.localeCompare(b.path));
  const paths = changedFiles.map((file) => file.path);

  const fullReasons: string[] = [];
  if (options.full) {
    fullReasons.push('--full flag');
  }
  for (const reason of options.fallbackReasons ?? []) {
    fullReasons.push(reason);
  }
  const forcedFull = fullReasons.length > 0;

  const globalDepsTriggers = paths.filter((p) => GLOBAL_BOTH_FULL_FILES.has(p));
  for (const trigger of globalDepsTriggers) {
    fullReasons.push(`global dependency config changed: ${trigger}`);
  }

  const aiRuntimeTriggers = paths.filter(
    (p) => !GLOBAL_BOTH_FULL_FILES.has(p) && AI_RUNTIME_VITEST_FULL_FILES.has(p),
  );
  if (!noTests) {
    for (const trigger of aiRuntimeTriggers) {
      fullReasons.push(`ai-runtime test config changed: ${trigger}`);
    }
  }

  const appTriggers = paths.filter(
    (p) => !GLOBAL_BOTH_FULL_FILES.has(p) && APP_JEST_FULL_FILES.has(p),
  );
  if (!noTests) {
    for (const trigger of appTriggers) {
      fullReasons.push(`app Jest config changed: ${trigger}`);
    }
  }

  const lintTriggers = paths.filter((p) => LINT_FULL_FILES.has(p));
  for (const trigger of lintTriggers) {
    fullReasons.push(`lint config changed: ${trigger}`);
  }

  const formatTriggers = paths.filter((p) => FORMAT_FULL_FILES.has(p));
  for (const trigger of formatTriggers) {
    fullReasons.push(`format config changed: ${trigger}`);
  }

  // Tests: ai-runtime Vitest
  const deletedAiRuntimeSource = changedFiles.some(
    (file) =>
      !file.exists &&
      file.path.startsWith('packages/ai-runtime/src/') &&
      file.path.endsWith('.ts') &&
      !isTestPath(file.path),
  );
  if (
    !noTests &&
    deletedAiRuntimeSource &&
    !forcedFull &&
    globalDepsTriggers.length === 0 &&
    aiRuntimeTriggers.length === 0
  ) {
    fullReasons.push('deleted source file in packages/ai-runtime/src');
  }

  const aiRuntimeFull =
    forcedFull ||
    globalDepsTriggers.length > 0 ||
    aiRuntimeTriggers.length > 0 ||
    deletedAiRuntimeSource;

  let aiRuntimePlan: ChangedChecksPlan['tests']['aiRuntime'];
  if (noTests) {
    aiRuntimePlan = { mode: 'skip', targets: [], explicitTests: [] };
  } else if (aiRuntimeFull) {
    aiRuntimePlan = { mode: 'full', targets: [], explicitTests: [] };
  } else {
    const targets = changedFiles
      .filter((file) => file.exists && isAiRuntimeRelatedTarget(file.path))
      .map((file) => file.path);
    const explicitTests = [
      ...new Set(
        NON_IMPORT_AI_RUNTIME_RULES.filter((rule) => paths.some((p) => rule.matches(p))).flatMap(
          (rule) => [...rule.tests],
        ),
      ),
    ].sort();
    const mode: SuiteMode = targets.length > 0 || explicitTests.length > 0 ? 'incremental' : 'skip';
    aiRuntimePlan = { mode, targets, explicitTests };
  }

  // Tests: Root app Jest
  const appFull = forcedFull || globalDepsTriggers.length > 0 || appTriggers.length > 0;
  let appPlan: ChangedChecksPlan['tests']['app'];
  if (noTests) {
    appPlan = { mode: 'skip', relatedTargets: [], explicitTests: [] };
  } else if (appFull) {
    appPlan = { mode: 'full', relatedTargets: [], explicitTests: [] };
  } else {
    const relatedTargets = changedFiles
      .filter((file) => file.exists && isAppJestRelatedTarget(file.path))
      .map((file) => file.path);
    const explicitTests = [
      ...new Set(
        NON_IMPORT_APP_RULES.filter((rule) => paths.some((p) => rule.matches(p))).flatMap(
          (rule) => [...rule.tests],
        ),
      ),
    ].sort();
    const mode: SuiteMode =
      relatedTargets.length > 0 || explicitTests.length > 0 ? 'incremental' : 'skip';
    appPlan = { mode, relatedTargets, explicitTests };
  }

  // Typecheck
  const hasGlobalDepsChange = globalDepsTriggers.length > 0;
  const typecheck = {
    aiRuntime:
      forcedFull ||
      hasGlobalDepsChange ||
      paths.some(
        (p) => p.startsWith('packages/ai-runtime/') || p.startsWith('packages/universal/'),
      ),
    filePreviewWebview:
      forcedFull ||
      hasGlobalDepsChange ||
      paths.some((p) => p.startsWith('packages/file-preview-webview/')),
    mermaidWebview:
      forcedFull ||
      hasGlobalDepsChange ||
      paths.some((p) => p.startsWith('packages/mermaid-webview/')),
    app: forcedFull || paths.some((p) => isAppTypecheckTrigger(p)),
  };

  // Lint
  const lintFull = forcedFull || lintTriggers.length > 0;
  let lintPlan: ChangedChecksPlan['lint'];
  if (lintFull) {
    lintPlan = { mode: 'full', oxlintFiles: [], expoLintFiles: [], todoLintFiles: [] };
  } else {
    const nonIgnoredJsTs = changedFiles
      .filter(
        (file) =>
          file.exists &&
          JS_TS_FILE_RE.test(file.path) &&
          !isIgnoredByList(file.path, OXLINT_IGNORED_PREFIXES, OXLINT_IGNORED_EXACT),
      )
      .map((file) => file.path);
    const expoLintFiles = nonIgnoredJsTs.filter(
      (filePath) =>
        EXPO_LINT_FILE_RE.test(filePath) &&
        (filePath.startsWith('src/') || filePath.startsWith('packages/universal/src/')),
    );
    const todoLintFiles = nonIgnoredJsTs.filter(
      (filePath) => filePath.startsWith('packages/') || filePath.startsWith('scripts/'),
    );
    const mode: SuiteMode = nonIgnoredJsTs.length > 0 ? 'incremental' : 'skip';
    lintPlan = { mode, oxlintFiles: nonIgnoredJsTs, expoLintFiles, todoLintFiles };
  }

  // Format
  const formatFull = forcedFull || formatTriggers.length > 0;
  let formatPlan: ChangedChecksPlan['format'];
  if (formatFull) {
    formatPlan = { mode: 'full', files: [] };
  } else {
    const files = changedFiles
      .filter(
        (file) =>
          file.exists &&
          FORMATTABLE_FILE_RE.test(file.path) &&
          !isIgnoredByList(file.path, OXFMT_IGNORED_PREFIXES, OXFMT_IGNORED_EXACT),
      )
      .map((file) => file.path);
    formatPlan = { mode: files.length > 0 ? 'incremental' : 'skip', files };
  }

  // Specialized checks
  const hasDeletedFile = changedFiles.some((file) => !file.exists);
  const specialized = {
    actionlint:
      forcedFull ||
      paths.some((p) => p.startsWith('.github/workflows/') || p === '.github/actionlint.yaml'),
    i18n: forcedFull || paths.some((p) => isI18nSourceFile(p)),
    uiBoundaries:
      forcedFull ||
      paths.some(
        (p) =>
          p.startsWith('packages/ui/') ||
          (p.startsWith('src/') && TSX_OR_TS_RE.test(p) && !isTestPath(p)),
      ),
    aiRuntimeBoundaries: forcedFull || paths.some((p) => p.startsWith('packages/ai-runtime/')),
    designTokens: forcedFull || paths.some((p) => p.startsWith('packages/design-tokens/')),
    appTheme:
      forcedFull ||
      paths.some(
        (p) =>
          p.startsWith('packages/design-tokens/') ||
          p === 'src/frontend/styles/global.css' ||
          p === 'pnpm-workspace.yaml' ||
          (TSX_OR_TS_RE.test(p) &&
            (p.startsWith('src/') ||
              p.startsWith('packages/ui/src/') ||
              p.startsWith('packages/ui/stories/'))),
      ),
    icons:
      forcedFull ||
      paths.some(
        (p) =>
          p.startsWith('packages/ui/icons/') ||
          p.startsWith('packages/ui/src/icons-webp/') ||
          p === 'packages/ui/src/scripts/generate-icons.ts' ||
          p === 'packages/ui/src/scripts/check-icons.ts' ||
          p === 'packages/ui/src/scripts/catalog-only-provider-icons.generated.ts',
      ),
    docsLinks:
      forcedFull ||
      hasDeletedFile ||
      paths.some(
        (p) =>
          p.endsWith('.md') ||
          p.startsWith('.agents/skills/') ||
          p === 'scripts/checkDocLinks.ts' ||
          p === 'scripts/skillsCommon.ts',
      ),
    features:
      forcedFull ||
      paths.some(
        (p) =>
          p.startsWith('docs/features/') ||
          p.startsWith('.maestro/flows/') ||
          p === 'scripts/deviceVerify.ts' ||
          (!isTestPath(p) &&
            TSX_OR_TS_RE.test(p) &&
            (p.startsWith('src/frontend/') || p.startsWith('packages/ui/src/'))),
      ),
    skills:
      forcedFull ||
      paths.some(
        (p) =>
          p.startsWith('.agents/skills/') ||
          p.startsWith('.claude/skills/') ||
          p === 'scripts/skillsCheck.ts' ||
          p === 'scripts/skillsCommon.ts' ||
          p === 'scripts/skillsSync.ts',
      ),
  };

  const planMode: PlanMode = forcedFull ? 'full' : 'incremental';
  const runTest = aiRuntimePlan.mode !== 'skip' || appPlan.mode !== 'skip';
  const runTypecheck =
    typecheck.aiRuntime ||
    typecheck.filePreviewWebview ||
    typecheck.mermaidWebview ||
    typecheck.app;
  const runActionlint = specialized.actionlint;
  const runNodeLint =
    lintPlan.mode !== 'skip' ||
    formatPlan.mode !== 'skip' ||
    specialized.i18n ||
    specialized.uiBoundaries ||
    specialized.aiRuntimeBoundaries ||
    specialized.designTokens ||
    specialized.appTheme ||
    specialized.icons ||
    specialized.docsLinks ||
    specialized.features ||
    specialized.skills;

  return {
    mode: planMode,
    noTests,
    changedFiles,
    fullReasons: [...new Set(fullReasons)],
    tests: {
      aiRuntime: aiRuntimePlan,
      app: appPlan,
    },
    typecheck,
    lint: lintPlan,
    format: formatPlan,
    specialized,
    outputs: {
      mode: planMode,
      run_test: runTest,
      run_typecheck: runTypecheck,
      run_lint: runActionlint || runNodeLint,
      run_actionlint: runActionlint,
      run_node_lint: runNodeLint,
      changed_count: changedFiles.length,
    },
  };
}

function existingExplicitTests(
  rootDir: string | undefined,
  testPaths: readonly string[],
): string[] {
  if (!rootDir) return [...testPaths];
  return testPaths.filter((testPath) => existsSync(path.join(rootDir, testPath)));
}

export function buildExecutionCommands(
  plan: ChangedChecksPlan,
  options: { rootDir?: string } = {},
): Record<'test' | 'typecheck' | 'lint', SubprocessCommand[]> {
  const rootDir = options.rootDir;
  const testCommands: SubprocessCommand[] = [];
  const typecheckCommands: SubprocessCommand[] = [];
  const lintCommands: SubprocessCommand[] = [];

  // Tests
  const { aiRuntime, app } = plan.tests;
  if (aiRuntime.mode === 'full' && app.mode === 'full') {
    testCommands.push({
      label: 'Full test suite (ai-runtime + app)',
      command: 'pnpm',
      args: ['test'],
    });
  } else {
    if (aiRuntime.mode === 'full') {
      testCommands.push({
        label: 'Full @cherrystudio/ai-runtime Vitest suite',
        command: 'pnpm',
        args: ['test:ai-runtime'],
      });
    } else if (aiRuntime.mode === 'incremental') {
      const rel = (repoRel: string) =>
        normalizeRepoPath(path.relative('packages/ai-runtime', repoRel));
      const relTargets = aiRuntime.targets.map(rel);
      const relExplicit = existingExplicitTests(rootDir, aiRuntime.explicitTests).map(rel);
      if (relTargets.length > 0) {
        const combined = [...new Set([...relTargets, ...relExplicit])];
        testCommands.push({
          label: `Incremental @cherrystudio/ai-runtime Vitest (${combined.length} target(s))`,
          command: 'pnpm',
          args: [
            '--filter',
            '@cherrystudio/ai-runtime',
            'exec',
            'vitest',
            'related',
            '--run',
            '--passWithNoTests',
            ...combined,
          ],
        });
      } else if (relExplicit.length > 0) {
        testCommands.push({
          label: `Explicit @cherrystudio/ai-runtime Vitest (${relExplicit.length} suite(s))`,
          command: 'pnpm',
          args: ['--filter', '@cherrystudio/ai-runtime', 'exec', 'vitest', 'run', ...relExplicit],
        });
      }
    }

    if (app.mode === 'full') {
      testCommands.push({
        label: 'Full app Jest suite',
        command: 'pnpm',
        args: ['test:app'],
      });
    } else if (app.mode === 'incremental') {
      const validExplicit = existingExplicitTests(rootDir, app.explicitTests);
      if (app.relatedTargets.length === 0 && validExplicit.length > 0) {
        testCommands.push({
          label: `Explicit app Jest suites (${validExplicit.length} suite(s))`,
          command: 'pnpm',
          args: ['exec', 'jest', '--runTestsByPath', ...validExplicit],
        });
      } else if (app.relatedTargets.length > 0) {
        const combined = [...new Set([...app.relatedTargets, ...validExplicit])];
        testCommands.push({
          label: `Incremental app Jest (${combined.length} target(s))`,
          command: 'pnpm',
          args: ['exec', 'jest', '--findRelatedTests', '--passWithNoTests', ...combined],
        });
      }
    }
  }

  // Typecheck
  const { typecheck } = plan;
  if (
    typecheck.aiRuntime &&
    typecheck.filePreviewWebview &&
    typecheck.mermaidWebview &&
    typecheck.app
  ) {
    typecheckCommands.push({
      label: 'Full typecheck (packages + app)',
      command: 'pnpm',
      args: ['typecheck'],
    });
  } else {
    if (typecheck.aiRuntime) {
      typecheckCommands.push({
        label: 'Typecheck @cherrystudio/ai-runtime',
        command: 'pnpm',
        args: ['--filter', '@cherrystudio/ai-runtime', 'typecheck'],
      });
    }
    if (typecheck.filePreviewWebview) {
      typecheckCommands.push({
        label: 'Typecheck @cherrystudio/file-preview-webview',
        command: 'pnpm',
        args: ['--filter', '@cherrystudio/file-preview-webview', 'typecheck'],
      });
    }
    if (typecheck.mermaidWebview) {
      typecheckCommands.push({
        label: 'Typecheck @cherrystudio/mermaid-webview',
        command: 'pnpm',
        args: ['--filter', '@cherrystudio/mermaid-webview', 'typecheck'],
      });
    }
    if (typecheck.app) {
      typecheckCommands.push({
        label: 'Typecheck app',
        command: 'pnpm',
        args: ['typecheck:app'],
      });
    }
  }

  // Lint, format & specialized checks
  if (plan.lint.mode === 'full') {
    lintCommands.push({
      label: 'Full lint (oxlint + expo lint + todo eslint)',
      command: 'pnpm',
      args: ['lint'],
    });
  } else if (plan.lint.mode === 'incremental') {
    if (plan.lint.oxlintFiles.length > 0) {
      lintCommands.push({
        label: `Incremental oxlint (${plan.lint.oxlintFiles.length} file(s))`,
        command: 'pnpm',
        args: ['exec', 'oxlint', ...plan.lint.oxlintFiles],
      });
    }
    if (plan.lint.expoLintFiles.length > 0) {
      lintCommands.push({
        label: `Incremental expo lint (${plan.lint.expoLintFiles.length} file(s))`,
        command: 'pnpm',
        args: ['exec', 'expo', 'lint', ...plan.lint.expoLintFiles],
      });
    }
    if (plan.lint.todoLintFiles.length > 0) {
      lintCommands.push({
        label: `Incremental TODO eslint (${plan.lint.todoLintFiles.length} file(s))`,
        command: 'pnpm',
        args: [
          'exec',
          'eslint',
          '--no-inline-config',
          '--quiet',
          '--no-warn-ignored',
          '--config',
          'eslint.todo.config.js',
          ...plan.lint.todoLintFiles,
        ],
      });
    }
  }

  if (plan.format.mode === 'full') {
    lintCommands.push({
      label: 'Full format check',
      command: 'pnpm',
      args: ['format:check'],
    });
  } else if (plan.format.mode === 'incremental' && plan.format.files.length > 0) {
    lintCommands.push({
      label: `Incremental format check (${plan.format.files.length} file(s))`,
      command: 'pnpm',
      args: ['exec', 'oxfmt', '--check', '--no-error-on-unmatched-pattern', ...plan.format.files],
    });
  }

  const { specialized } = plan;
  if (specialized.i18n) {
    lintCommands.push({ label: 'Translation check', command: 'pnpm', args: ['i18n:check'] });
  }
  if (specialized.uiBoundaries) {
    lintCommands.push({
      label: 'UI boundary check',
      command: 'pnpm',
      args: ['ui:check-boundaries'],
    });
  }
  if (specialized.aiRuntimeBoundaries) {
    lintCommands.push({
      label: 'AI runtime boundary check',
      command: 'pnpm',
      args: ['--filter', '@cherrystudio/ai-runtime', 'check:boundaries'],
    });
  }
  if (specialized.designTokens && specialized.appTheme && specialized.icons) {
    lintCommands.push({
      label: 'Full design contract check',
      command: 'pnpm',
      args: ['design:check'],
    });
  } else {
    if (specialized.designTokens) {
      lintCommands.push({
        label: 'Design tokens check',
        command: 'pnpm',
        args: ['exec', 'tsx', 'packages/design-tokens/scripts/check.ts'],
      });
    }
    if (specialized.appTheme) {
      lintCommands.push({
        label: 'App theme check',
        command: 'pnpm',
        args: ['exec', 'tsx', 'packages/design-tokens/scripts/check-app-theme.ts'],
      });
    }
    if (specialized.icons) {
      lintCommands.push({
        label: 'Generated icons check',
        command: 'pnpm',
        args: ['exec', 'tsx', 'packages/ui/src/scripts/check-icons.ts'],
      });
    }
  }
  if (specialized.docsLinks) {
    lintCommands.push({
      label: 'Documentation link check',
      command: 'pnpm',
      args: ['docs:check-links'],
    });
  }
  if (specialized.features) {
    lintCommands.push({ label: 'Feature map check', command: 'pnpm', args: ['verify:features'] });
  }
  if (specialized.skills) {
    lintCommands.push({ label: 'Skill check', command: 'pnpm', args: ['skills:check'] });
  }

  return {
    test: testCommands,
    typecheck: typecheckCommands,
    lint: lintCommands,
  };
}

export function formatGithubOutputs(plan: ChangedChecksPlan): string {
  return [
    `mode=${plan.outputs.mode}`,
    `run_test=${plan.outputs.run_test}`,
    `run_typecheck=${plan.outputs.run_typecheck}`,
    `run_lint=${plan.outputs.run_lint}`,
    `run_actionlint=${plan.outputs.run_actionlint}`,
    `run_node_lint=${plan.outputs.run_node_lint}`,
    `changed_count=${plan.outputs.changed_count}`,
    '',
  ].join('\n');
}

export function formatGithubStepSummary(plan: ChangedChecksPlan): string {
  const activeSpecialized = Object.entries(plan.specialized)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  const typecheckTargets = [
    plan.typecheck.aiRuntime ? 'ai-runtime' : null,
    plan.typecheck.filePreviewWebview ? 'file-preview-webview' : null,
    plan.typecheck.mermaidWebview ? 'mermaid-webview' : null,
    plan.typecheck.app ? 'app' : null,
  ].filter((item): item is string => item !== null);

  const lines = [
    `### Change-Aware Check Plan (\`${plan.mode}\`)`,
    '',
    `- Changed files: \`${plan.outputs.changed_count}\``,
    plan.noTests
      ? '- Tests: _skipped (--no-tests)_'
      : `- Tests: ai-runtime=\`${plan.tests.aiRuntime.mode}\`, app=\`${plan.tests.app.mode}\``,
    `- Typecheck: ${typecheckTargets.length > 0 ? typecheckTargets.map((t) => `\`${t}\``).join(', ') : '_skipped_'}`,
    `- Lint / Format: lint=\`${plan.lint.mode}\`, format=\`${plan.format.mode}\``,
    `- Specialized checks: ${activeSpecialized.length > 0 ? activeSpecialized.map((s) => `\`${s}\``).join(', ') : '_none_'}`,
  ];

  if (plan.fullReasons.length > 0) {
    lines.push(`- Full triggers: ${plan.fullReasons.map((r) => `\`${r}\``).join(', ')}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let command: CheckCommand | undefined;
  let base: string | undefined;
  let head: string | undefined;
  let full = false;
  let noTests = false;
  let json = false;
  let dryRun = false;
  let githubOutputs = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--full') {
      full = true;
    } else if (arg === '--no-tests') {
      noTests = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--github-outputs') {
      githubOutputs = true;
    } else if (arg === '--base') {
      index += 1;
      base = args[index];
      if (!base) throw new Error('--base requires a ref argument');
    } else if (arg.startsWith('--base=')) {
      base = arg.slice('--base='.length);
      if (!base) throw new Error('--base requires a ref argument');
    } else if (arg === '--head') {
      index += 1;
      head = args[index];
      if (!head) throw new Error('--head requires a ref argument');
    } else if (arg.startsWith('--head=')) {
      head = arg.slice('--head='.length);
      if (!head) throw new Error('--head requires a ref argument');
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!command && VALID_COMMANDS.has(arg as CheckCommand)) {
      command = arg as CheckCommand;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!command) {
    throw new Error(
      'Usage: node scripts/changedChecks.ts <plan|test|typecheck|lint|all> [--base <ref>] [--head <ref>] [--full] [--no-tests] [--json] [--dry-run] [--github-outputs]',
    );
  }

  return { command, base, head, full, noTests, json, dryRun, githubOutputs };
}

function executeSubprocess(step: SubprocessCommand, rootDir: string, dryRun: boolean): number {
  const rendered = `${step.command} ${step.args.join(' ')}`;
  if (dryRun) {
    console.log(`[dry-run] ${step.label}: ${rendered}`);
    return 0;
  }

  console.log(`\n==> ${step.label}\n$ ${rendered}`);
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd ?? rootDir,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Failed to start "${step.command}": ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`"${rendered}" terminated by signal ${result.signal}`);
    return 1;
  }
  return result.status ?? 1;
}

export function runCli(argv: readonly string[], rootDir = defaultRepoRoot()): number {
  const parsed = parseCliArgs(argv);
  const collected = parsed.full
    ? { files: [], fallbackFull: false, fallbackReasons: [] }
    : collectChangedFiles({ rootDir, base: parsed.base, head: parsed.head });

  for (const reason of collected.fallbackReasons) {
    console.warn(`[changedChecks] Falling back to full checks: ${reason}`);
  }

  const plan = planChangedChecks(collected.files, {
    full: parsed.full || collected.fallbackFull,
    noTests: parsed.noTests,
    fallbackReasons: collected.fallbackReasons,
  });

  if (parsed.command === 'plan') {
    if (parsed.githubOutputs) {
      if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, formatGithubOutputs(plan));
      }
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatGithubStepSummary(plan));
      }
    }

    if (parsed.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(formatGithubStepSummary(plan).trimEnd());
    }
    return 0;
  }

  const commandsByGroup = buildExecutionCommands(plan, { rootDir });
  const selectedGroups: ('lint' | 'typecheck' | 'test')[] =
    parsed.command === 'all' ? ['lint', 'typecheck', 'test'] : [parsed.command];

  const steps = selectedGroups.flatMap((group) => commandsByGroup[group]);
  if (steps.length === 0) {
    console.log(`No ${parsed.command} checks affected by current changes.`);
    return 0;
  }

  for (const step of steps) {
    const code = executeSubprocess(step, rootDir, parsed.dryRun);
    if (code !== 0) return code;
  }

  return 0;
}

function isEntrypoint(): boolean {
  if (process.env.JEST_WORKER_ID !== undefined) {
    return false;
  }
  if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    return require.main === module;
  }
  const entry = process.argv[1];
  return Boolean(
    entry && path.resolve(entry).endsWith(`${path.sep}scripts${path.sep}changedChecks.ts`),
  );
}

if (isEntrypoint()) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
