import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildExecutionCommands,
  collectChangedFiles,
  EXPLICIT_NON_IMPORT_TEST_PATHS,
  formatGithubOutputs,
  formatGithubStepSummary,
  parseCliArgs,
  planChangedChecks,
} from '../changedChecks';

const REPO_ROOT = path.resolve(__dirname, '../..');
const tempDirs: string[] = [];

function makeTempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'changed-checks-'));
  tempDirs.push(dir);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(path.join(dir, 'README.md'), '# init\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('changedChecks path guardrail', () => {
  it('references only existing explicit test files', () => {
    expect(EXPLICIT_NON_IMPORT_TEST_PATHS.length).toBeGreaterThan(0);
    const missing = EXPLICIT_NON_IMPORT_TEST_PATHS.filter(
      (relPath) => !existsSync(path.join(REPO_ROOT, relPath)),
    );
    expect(missing).toEqual([]);
  });
});

describe('planChangedChecks', () => {
  it('runs only docsLinks for documentation-only changes', () => {
    const plan = planChangedChecks([{ path: 'docs/guides/foo.md', exists: true }]);

    expect(plan.outputs).toEqual({
      mode: 'incremental',
      run_test: false,
      run_typecheck: false,
      run_lint: true,
      run_actionlint: false,
      run_node_lint: true,
      changed_count: 1,
    });
    expect(plan.tests.aiRuntime.mode).toBe('skip');
    expect(plan.tests.app.mode).toBe('skip');
    expect(plan.lint.mode).toBe('skip');
    expect(plan.format.mode).toBe('skip');
    expect(plan.specialized).toEqual({
      actionlint: false,
      i18n: false,
      uiBoundaries: false,
      aiRuntimeBoundaries: false,
      designTokens: false,
      appTheme: false,
      icons: false,
      docsLinks: true,
      features: false,
      skills: false,
    });
  });

  it('runs only actionlint for non-release workflow changes', () => {
    const plan = planChangedChecks([{ path: '.github/workflows/branch-build.yml', exists: true }]);

    expect(plan.outputs).toEqual({
      mode: 'incremental',
      run_test: false,
      run_typecheck: false,
      run_lint: true,
      run_actionlint: true,
      run_node_lint: false,
      changed_count: 1,
    });
    expect(plan.specialized.actionlint).toBe(true);
    const commands = buildExecutionCommands(plan);
    expect(commands.test).toEqual([]);
    expect(commands.typecheck).toEqual([]);
    expect(commands.lint).toEqual([]);
  });

  it('maps release.yml changes to actionlint and release workflow tests', () => {
    const plan = planChangedChecks([{ path: '.github/workflows/release.yml', exists: true }]);

    expect(plan.specialized.actionlint).toBe(true);
    expect(plan.tests.aiRuntime.mode).toBe('skip');
    expect(plan.tests.app).toEqual({
      mode: 'incremental',
      relatedTargets: [],
      explicitTests: [
        'scripts/__tests__/releaseLocalBuild.test.ts',
        'scripts/__tests__/verifyIosSymbolPackage.test.ts',
      ],
    });
    expect(buildExecutionCommands(plan).test).toEqual([
      {
        label: 'Explicit app Jest suites (2 suite(s))',
        command: 'pnpm',
        args: [
          'exec',
          'jest',
          '--runTestsByPath',
          'scripts/__tests__/releaseLocalBuild.test.ts',
          'scripts/__tests__/verifyIosSymbolPackage.test.ts',
        ],
      },
    ]);
  });

  it('scopes frontend feature changes to Jest related tests, app typecheck, and UI/i18n checks', () => {
    const plan = planChangedChecks([{ path: 'src/frontend/features/chat/Foo.tsx', exists: true }]);

    expect(plan.tests.aiRuntime.mode).toBe('skip');
    expect(plan.tests.app).toEqual({
      mode: 'incremental',
      relatedTargets: ['src/frontend/features/chat/Foo.tsx'],
      explicitTests: [],
    });
    expect(plan.typecheck).toEqual({
      aiRuntime: false,
      filePreviewWebview: false,
      mermaidWebview: false,
      app: true,
    });
    expect(plan.lint).toEqual({
      mode: 'incremental',
      oxlintFiles: ['src/frontend/features/chat/Foo.tsx'],
      expoLintFiles: ['src/frontend/features/chat/Foo.tsx'],
      todoLintFiles: [],
    });
    expect(plan.format).toEqual({
      mode: 'incremental',
      files: ['src/frontend/features/chat/Foo.tsx'],
    });
    expect(plan.specialized).toEqual({
      actionlint: false,
      i18n: true,
      uiBoundaries: true,
      aiRuntimeBoundaries: false,
      designTokens: false,
      appTheme: true,
      icons: false,
      docsLinks: false,
      features: true,
      skills: false,
    });
  });

  it('handles packages/ai-runtime/src changes across Vitest, Jest, typecheck, and boundaries', () => {
    const plan = planChangedChecks([
      { path: 'packages/ai-runtime/src/provider/endpoint.ts', exists: true },
    ]);

    expect(plan.tests.aiRuntime).toEqual({
      mode: 'incremental',
      targets: ['packages/ai-runtime/src/provider/endpoint.ts'],
      explicitTests: [],
    });
    expect(plan.tests.app).toEqual({
      mode: 'incremental',
      relatedTargets: ['packages/ai-runtime/src/provider/endpoint.ts'],
      explicitTests: [],
    });
    expect(plan.typecheck).toEqual({
      aiRuntime: true,
      filePreviewWebview: false,
      mermaidWebview: false,
      app: true,
    });
    expect(plan.lint).toEqual({
      mode: 'incremental',
      oxlintFiles: ['packages/ai-runtime/src/provider/endpoint.ts'],
      expoLintFiles: [],
      todoLintFiles: ['packages/ai-runtime/src/provider/endpoint.ts'],
    });
    expect(plan.specialized.aiRuntimeBoundaries).toBe(true);
    expect(plan.specialized.uiBoundaries).toBe(false);
    expect(plan.specialized.i18n).toBe(false);

    expect(buildExecutionCommands(plan).test).toEqual([
      {
        label: 'Incremental @cherrystudio/ai-runtime Vitest (1 target(s))',
        command: 'pnpm',
        args: [
          '--filter',
          '@cherrystudio/ai-runtime',
          'exec',
          'vitest',
          'related',
          '--run',
          '--passWithNoTests',
          'src/provider/endpoint.ts',
        ],
      },
      {
        label: 'Incremental app Jest (1 target(s))',
        command: 'pnpm',
        args: [
          'exec',
          'jest',
          '--findRelatedTests',
          '--passWithNoTests',
          'packages/ai-runtime/src/provider/endpoint.ts',
        ],
      },
    ]);
  });

  it('fans out packages/universal/src changes to both Vitest and Jest', () => {
    const plan = planChangedChecks([
      { path: 'packages/universal/src/ai/reasoning.ts', exists: true },
    ]);

    expect(plan.tests.aiRuntime).toEqual({
      mode: 'incremental',
      targets: ['packages/universal/src/ai/reasoning.ts'],
      explicitTests: [],
    });
    expect(plan.tests.app).toEqual({
      mode: 'incremental',
      relatedTargets: ['packages/universal/src/ai/reasoning.ts'],
      explicitTests: [],
    });
    expect(plan.typecheck).toEqual({
      aiRuntime: true,
      filePreviewWebview: false,
      mermaidWebview: false,
      app: true,
    });
    expect(plan.lint.expoLintFiles).toEqual(['packages/universal/src/ai/reasoning.ts']);
    expect(plan.lint.todoLintFiles).toEqual(['packages/universal/src/ai/reasoning.ts']);

    expect(buildExecutionCommands(plan).test[0]).toEqual({
      label: 'Incremental @cherrystudio/ai-runtime Vitest (1 target(s))',
      command: 'pnpm',
      args: [
        '--filter',
        '@cherrystudio/ai-runtime',
        'exec',
        'vitest',
        'related',
        '--run',
        '--passWithNoTests',
        '../universal/src/ai/reasoning.ts',
      ],
    });
  });

  it('maps specific patches to their guard suites without triggering full tests', () => {
    const screensPlan = planChangedChecks([
      { path: 'patches/react-native-screens@4.30.1.patch', exists: true },
    ]);
    expect(screensPlan.tests.aiRuntime.mode).toBe('skip');
    expect(screensPlan.tests.app).toEqual({
      mode: 'incremental',
      relatedTargets: [],
      explicitTests: [
        'scripts/__tests__/androidWindowCompatibility.test.ts',
        'src/frontend/appShell/header/__tests__/reactNativeScreensPatch.test.ts',
        'src/frontend/appShell/header/__tests__/toolbarSpacerPatch.test.ts',
      ],
    });
    expect(screensPlan.typecheck.app).toBe(true);

    const openaiPlan = planChangedChecks([
      { path: 'patches/@ai-sdk__openai@3.0.137.patch', exists: true },
    ]);
    expect(openaiPlan.tests.aiRuntime).toEqual({
      mode: 'incremental',
      targets: [],
      explicitTests: ['packages/ai-runtime/src/provider/__tests__/openaiImageUrlPatch.test.ts'],
    });
    expect(openaiPlan.tests.app.mode).toBe('skip');
    expect(openaiPlan.typecheck.app).toBe(true);
    expect(buildExecutionCommands(openaiPlan).test).toEqual([
      {
        label: 'Explicit @cherrystudio/ai-runtime Vitest (1 suite(s))',
        command: 'pnpm',
        args: [
          '--filter',
          '@cherrystudio/ai-runtime',
          'exec',
          'vitest',
          'run',
          'src/provider/__tests__/openaiImageUrlPatch.test.ts',
        ],
      },
    ]);

    const unmappedPatchPlan = planChangedChecks([
      { path: 'patches/foo@1.0.0.patch', exists: true },
    ]);
    expect(unmappedPatchPlan.tests.aiRuntime.mode).toBe('skip');
    expect(unmappedPatchPlan.tests.app.mode).toBe('skip');
    expect(unmappedPatchPlan.typecheck.app).toBe(true);
  });

  it('maps database migrations to migration suites', () => {
    const plan = planChangedChecks([
      { path: 'migrations/sqlite-drizzle/0012_test.sql', exists: true },
    ]);

    expect(plan.tests.aiRuntime.mode).toBe('skip');
    expect(plan.tests.app.mode).toBe('incremental');
    expect(plan.tests.app.relatedTargets).toEqual([]);
    expect(plan.tests.app.explicitTests).toContain(
      'src/backend/data/db/__tests__/migrations.test.ts',
    );
    expect(plan.tests.app.explicitTests).toContain(
      'src/backend/data/db/__tests__/releasedMigrationDigest.test.ts',
    );
  });

  it.each(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])(
    'falls back to full tests and all typechecks when %s changes',
    (globalFile) => {
      const plan = planChangedChecks([{ path: globalFile, exists: true }]);

      expect(plan.tests.aiRuntime.mode).toBe('full');
      expect(plan.tests.app.mode).toBe('full');
      expect(plan.typecheck).toEqual({
        aiRuntime: true,
        filePreviewWebview: true,
        mermaidWebview: true,
        app: true,
      });
      expect(plan.fullReasons).toContain(`global dependency config changed: ${globalFile}`);
    },
  );

  it.each(['jest.config.js', 'jest.setup.ts', 'babel.config.js', 'tsconfig.json'])(
    'falls back to full app Jest only when %s changes',
    (configFile) => {
      const plan = planChangedChecks([{ path: configFile, exists: true }]);

      expect(plan.tests.app.mode).toBe('full');
      expect(plan.tests.aiRuntime.mode).toBe('skip');
      expect(plan.fullReasons).toContain(`app Jest config changed: ${configFile}`);
    },
  );

  it('falls back to full lint or format only when their respective configs change', () => {
    const lintPlan = planChangedChecks([{ path: 'eslint.config.js', exists: true }]);
    expect(lintPlan.lint.mode).toBe('full');
    expect(lintPlan.format.mode).toBe('incremental');
    expect(lintPlan.tests.app.explicitTests).toEqual([
      'scripts/__tests__/architectureBoundaries.test.ts',
    ]);

    const formatPlan = planChangedChecks([{ path: '.oxfmtrc.json', exists: true }]);
    expect(formatPlan.format.mode).toBe('full');
    expect(formatPlan.lint.mode).toBe('skip');
  });

  it('handles deleted and ignored files safely', () => {
    const plan = planChangedChecks([
      { path: 'src/frontend/utils/removed.ts', exists: false },
      { path: 'packages/ui/src/icons-webp/general/index.ts', exists: true },
      { path: '.rnstorybook/storybook.requires.ts', exists: true },
      { path: 'packages/remote-protocol/foo.ts', exists: true },
    ]);

    expect(plan.lint.oxlintFiles).toEqual(['packages/remote-protocol/foo.ts']);
    expect(plan.lint.expoLintFiles).toEqual([]);
    expect(plan.lint.todoLintFiles).toEqual(['packages/remote-protocol/foo.ts']);
    expect(plan.format.files).toEqual([]);
    expect(plan.specialized.docsLinks).toBe(true);
    expect(plan.typecheck.app).toBe(true);

    const deletedAiRuntimePlan = planChangedChecks([
      { path: 'packages/ai-runtime/src/provider/removed.ts', exists: false },
    ]);
    expect(deletedAiRuntimePlan.tests.aiRuntime.mode).toBe('full');
    expect(deletedAiRuntimePlan.specialized.docsLinks).toBe(true);
    expect(deletedAiRuntimePlan.typecheck.aiRuntime).toBe(true);
    expect(deletedAiRuntimePlan.typecheck.app).toBe(true);
  });

  it('enables every check in --full mode', () => {
    const plan = planChangedChecks([], { full: true });

    expect(plan.mode).toBe('full');
    expect(plan.tests.aiRuntime.mode).toBe('full');
    expect(plan.tests.app.mode).toBe('full');
    expect(plan.typecheck).toEqual({
      aiRuntime: true,
      filePreviewWebview: true,
      mermaidWebview: true,
      app: true,
    });
    expect(plan.lint.mode).toBe('full');
    expect(plan.format.mode).toBe('full');
    expect(Object.values(plan.specialized).every(Boolean)).toBe(true);
    expect(buildExecutionCommands(plan)).toEqual({
      test: [{ label: 'Full test suite (ai-runtime + app)', command: 'pnpm', args: ['test'] }],
      typecheck: [
        { label: 'Full typecheck (packages + app)', command: 'pnpm', args: ['typecheck'] },
      ],
      lint: [
        {
          label: 'Full lint (oxlint + expo lint + todo eslint)',
          command: 'pnpm',
          args: ['lint'],
        },
        { label: 'Full format check', command: 'pnpm', args: ['format:check'] },
        { label: 'Translation check', command: 'pnpm', args: ['i18n:check'] },
        { label: 'UI boundary check', command: 'pnpm', args: ['ui:check-boundaries'] },
        {
          label: 'AI runtime boundary check',
          command: 'pnpm',
          args: ['--filter', '@cherrystudio/ai-runtime', 'check:boundaries'],
        },
        { label: 'Full design contract check', command: 'pnpm', args: ['design:check'] },
        { label: 'Documentation link check', command: 'pnpm', args: ['docs:check-links'] },
        { label: 'Feature map check', command: 'pnpm', args: ['verify:features'] },
        { label: 'Skill check', command: 'pnpm', args: ['skills:check'] },
      ],
    });
  });

  it('formats GitHub outputs and step summaries accurately', () => {
    const plan = planChangedChecks([{ path: 'docs/guides/foo.md', exists: true }]);
    expect(formatGithubOutputs(plan)).toBe(
      [
        'mode=incremental',
        'run_test=false',
        'run_typecheck=false',
        'run_lint=true',
        'run_actionlint=false',
        'run_node_lint=true',
        'changed_count=1',
        '',
      ].join('\n'),
    );
    expect(formatGithubStepSummary(plan)).toContain('Change-Aware Check Plan (`incremental`)');
    expect(formatGithubStepSummary(plan)).toContain('Specialized checks: `docsLinks`');
  });

  it('omits all test suites and test-only full triggers in --no-tests mode', () => {
    const codePlan = planChangedChecks(
      [
        { path: 'src/frontend/features/chat/Foo.tsx', exists: true },
        { path: 'jest.config.js', exists: true },
        { path: 'package.json', exists: true },
      ],
      { noTests: true },
    );

    expect(codePlan.noTests).toBe(true);
    expect(codePlan.outputs.run_test).toBe(false);
    expect(codePlan.tests.aiRuntime).toEqual({
      mode: 'skip',
      targets: [],
      explicitTests: [],
    });
    expect(codePlan.tests.app).toEqual({
      mode: 'skip',
      relatedTargets: [],
      explicitTests: [],
    });
    expect(codePlan.fullReasons).toEqual(['global dependency config changed: package.json']);
    expect(codePlan.typecheck).toEqual({
      aiRuntime: true,
      filePreviewWebview: true,
      mermaidWebview: true,
      app: true,
    });
    expect(codePlan.lint.mode).toBe('incremental');
    expect(codePlan.format.mode).toBe('incremental');
    expect(codePlan.specialized.uiBoundaries).toBe(true);
    expect(formatGithubStepSummary(codePlan)).toContain('- Tests: _skipped (--no-tests)_');
    expect(buildExecutionCommands(codePlan).test).toEqual([]);
  });

  it('parses CLI args including forwarded pnpm -- separator', () => {
    expect(
      parseCliArgs([
        '--',
        'plan',
        '--base=HEAD^1',
        '--head',
        'HEAD',
        '--no-tests',
        '--json',
        '--github-outputs',
      ]),
    ).toEqual({
      command: 'plan',
      base: 'HEAD^1',
      head: 'HEAD',
      full: false,
      noTests: true,
      json: true,
      dryRun: false,
      githubOutputs: true,
    });
  });
});

describe('collectChangedFiles', () => {
  it('collects committed, staged, unstaged, and untracked changes while ignoring .context', () => {
    const dir = makeTempRepo();
    execFileSync('git', ['checkout', '-q', '-b', 'feature/test'], { cwd: dir });
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    mkdirSync(path.join(dir, '.context'), { recursive: true });
    writeFileSync(path.join(dir, 'src/committed.ts'), 'export const a = 1;\n');
    execFileSync('git', ['add', 'src/committed.ts'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'add committed'], { cwd: dir });

    writeFileSync(path.join(dir, 'src/staged.ts'), 'export const b = 2;\n');
    execFileSync('git', ['add', 'src/staged.ts'], { cwd: dir });
    writeFileSync(path.join(dir, 'src/untracked.ts'), 'export const c = 3;\n');
    writeFileSync(path.join(dir, '.context/ignored.ts'), 'ignored\n');

    const local = collectChangedFiles({ rootDir: dir });
    expect(local.fallbackFull).toBe(false);
    expect(local.files).toEqual([
      { path: 'src/committed.ts', exists: true },
      { path: 'src/staged.ts', exists: true },
      { path: 'src/untracked.ts', exists: true },
    ]);

    const range = collectChangedFiles({ rootDir: dir, base: 'HEAD^1', head: 'HEAD' });
    expect(range.fallbackFull).toBe(false);
    expect(range.files).toEqual([{ path: 'src/committed.ts', exists: true }]);
  });

  it('falls back to full mode when git range refs cannot be resolved', () => {
    const dir = makeTempRepo();
    const result = collectChangedFiles({ rootDir: dir, base: 'HEAD^1', head: 'HEAD' });
    expect(result.fallbackFull).toBe(true);
    expect(result.fallbackReasons.length).toBeGreaterThan(0);
  });
});
