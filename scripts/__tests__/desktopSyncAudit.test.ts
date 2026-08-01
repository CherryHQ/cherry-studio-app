import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { DesktopSyncDomain, DesktopSyncManifest } from '../desktopSyncAudit';
import {
  auditDesignCatalog,
  auditRepositories,
  compareSchemaState,
  extractObjectKeys,
  extractSqliteTableNames,
  evaluatePreferenceAlignment,
  hashTrackedFiles,
  parseArguments,
  pathMatchesGlob,
} from '../desktopSyncAudit';

const temporaryRoots: string[] = [];

function writeFiles(root: string, files: Record<string, string>) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function git(root: string, ...arguments_: string[]) {
  return execFileSync('git', arguments_, { cwd: root, encoding: 'utf8' }).trim();
}

function createRepository(packageName: string, files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'desktop-sync-audit-'));
  temporaryRoots.push(root);

  writeFiles(root, {
    'package.json': `${JSON.stringify({ name: packageName }, null, 2)}\n`,
    ...files,
  });
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.email', 'desktop-sync@example.test');
  git(root, 'config', 'user.name', 'Desktop Sync Test');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'fixture');

  return root;
}

function sharedPackageFiles(platform: 'desktop' | 'mobile') {
  const aiCoreDirectory = platform === 'desktop' ? 'packages/aiCore' : 'packages/ai-core';

  return {
    [`${aiCoreDirectory}/package.json`]: `${JSON.stringify({ name: '@cherrystudio/ai-core' }, null, 2)}\n`,
    'packages/ai-sdk-provider/package.json': `${JSON.stringify({ name: '@cherrystudio/ai-sdk-provider' }, null, 2)}\n`,
    'packages/provider-registry/package.json': `${JSON.stringify({ name: '@cherrystudio/provider-registry' }, null, 2)}\n`,
    'packages/ui/package.json': `${JSON.stringify({ name: '@cherrystudio/ui' }, null, 2)}\n`,
  };
}

function manifestWithDomains(domains: Record<string, DesktopSyncDomain>): DesktopSyncManifest {
  return {
    schemaVersion: 1,
    repository: 'https://example.test/cherry-studio.git',
    domains,
  };
}

function mirrorDomain(overrides: Partial<DesktopSyncDomain> = {}): DesktopSyncDomain {
  return {
    strategy: 'mirror',
    status: 'unbaselined',
    sourcePaths: ['packages/aiCore'],
    targetPaths: ['packages/ai-core'],
    sourceCommit: null,
    sourceSha256: null,
    ...overrides,
  };
}

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('parseArguments', () => {
  test('CLI desktop root wins over the environment and repeated domains are retained', () => {
    const parsed = parseArguments(
      [
        '--desktop-root',
        './from-cli',
        '--domain',
        'schema',
        '--domain=ai-core',
        '--json',
        '--check',
      ],
      { CHERRY_STUDIO_DESKTOP_ROOT: './from-environment' },
    );

    expect(parsed).toMatchObject({
      check: true,
      desktopRoot: resolve('./from-cli'),
      domains: ['schema', 'ai-core'],
      json: true,
    });
  });

  test('uses CHERRY_STUDIO_DESKTOP_ROOT when the flag is absent', () => {
    expect(
      parseArguments([], { CHERRY_STUDIO_DESKTOP_ROOT: './from-environment' }).desktopRoot,
    ).toBe(resolve('./from-environment'));
  });

  test('does not expose a write mode', () => {
    expect(() => parseArguments(['--desktop-root', '.', '--write'], {})).toThrow(
      /unexpected argument.*--write/i,
    );
  });
});

describe('structured source extraction', () => {
  test('extracts sqliteTable calls without treating comments or unrelated calls as tables', () => {
    const source = `
      import { sqliteTable } from 'drizzle-orm/sqlite-core';
      // sqliteTable('comment_only', {});
      export const topic = sqliteTable('topic', {});
      export const agent = sqliteTable("agent", {});
      export const ignored = anotherFactory('not_a_table', {});
    `;

    expect(extractSqliteTableNames(source, 'schema.ts')).toEqual(['agent', 'topic']);
  });

  test('extracts quoted and identifier catalog keys from the requested object only', () => {
    const source = `
      const unrelated = { ignored: true };
      export const PROVIDER_ICON_META_CATALOG = {
        openai: openaiMeta,
        'radeon-cloud': radeonCloudMeta,
        opencode: openCodeMeta,
      } as const;
    `;

    expect(
      extractObjectKeys(source, 'PROVIDER_ICON_META_CATALOG', undefined, 'meta-catalog.ts'),
    ).toEqual(['openai', 'opencode', 'radeon-cloud']);
  });
});

describe('preference alignment', () => {
  test('accepts only declared mobile extensions after desktop parity is complete', () => {
    expect(
      evaluatePreferenceAlignment(
        ['app.language', 'ui.theme_mode'],
        ['app.language', 'permissions.location_read', 'ui.theme_mode'],
        ['permissions.location_read'],
      ),
    ).toMatchObject({
      mobileExtensions: ['permissions.location_read'],
      ok: true,
      sourceOnly: [],
      staleExtensionDeclarations: [],
      unexpectedMobileKeys: [],
    });
  });

  test('rejects missing desktop keys, undeclared mobile keys, and stale declarations', () => {
    expect(
      evaluatePreferenceAlignment(
        ['app.language', 'ui.theme_mode'],
        ['app.language', 'mobile.unknown'],
        ['permissions.location_read'],
      ),
    ).toMatchObject({
      ok: false,
      sourceOnly: ['ui.theme_mode'],
      staleExtensionDeclarations: ['permissions.location_read'],
      unexpectedMobileKeys: ['mobile.unknown'],
    });
  });
});

describe('pathMatchesGlob', () => {
  test('excludes only the declared Agent runtime subtrees', () => {
    const exclusions = [
      'src/main/ai/agentSession/**',
      'src/main/ai/agents/**',
      'src/main/ai/runtime/claudeCode/**',
    ];

    expect(
      exclusions.some((pattern) =>
        pathMatchesGlob('src/main/ai/agentSession/AgentSessionService.ts', pattern),
      ),
    ).toBe(true);
    expect(
      exclusions.some((pattern) => pathMatchesGlob('src/main/ai/runtime/aiSdk/Agent.ts', pattern)),
    ).toBe(false);
  });
});

describe('hashTrackedFiles', () => {
  test('is stable across input order and duplicate paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-sync-hash-'));
    temporaryRoots.push(root);
    writeFiles(root, { 'a.txt': 'alpha\n', 'nested/b.txt': 'beta\n' });

    const forward = await hashTrackedFiles(root, ['a.txt', 'nested/b.txt']);
    const reversed = await hashTrackedFiles(root, ['nested/b.txt', 'a.txt']);
    const duplicated = await hashTrackedFiles(root, ['nested/b.txt', 'a.txt', 'a.txt']);

    expect(reversed).toBe(forward);
    expect(duplicated).toBe(forward);

    writeFileSync(join(root, 'a.txt'), 'changed\n');
    expect(await hashTrackedFiles(root, ['a.txt', 'nested/b.txt'])).not.toBe(forward);
  });
});

describe('auditRepositories', () => {
  test('rejects a checkout path that is not the Git top level', async () => {
    const desktopRepository = createRepository('fixture-root', {
      ...Object.fromEntries(
        Object.entries(sharedPackageFiles('desktop')).map(([file, contents]) => [
          `nested/${file}`,
          contents,
        ]),
      ),
      'nested/package.json': `${JSON.stringify({ name: 'CherryStudio' }, null, 2)}\n`,
    });
    const mobileRoot = createRepository('cherry-studio-app', sharedPackageFiles('mobile'));

    await expect(
      auditRepositories({
        desktopRoot: join(desktopRepository, 'nested'),
        mobileRoot,
        manifest: manifestWithDomains({ 'ai-core': mirrorDomain() }),
        domains: ['ai-core'],
      }),
    ).rejects.toThrow(/desktop root must be the Git top level/i);
  });

  test('rejects a checkout with the wrong desktop package identity', async () => {
    const desktopRoot = createRepository('not-CherryStudio', sharedPackageFiles('desktop'));
    const mobileRoot = createRepository('cherry-studio-app', sharedPackageFiles('mobile'));

    await expect(
      auditRepositories({
        desktopRoot,
        mobileRoot,
        manifest: manifestWithDomains({ 'ai-core': mirrorDomain() }),
        domains: ['ai-core'],
      }),
    ).rejects.toThrow(/desktop package name must be CherryStudio/i);
  });

  test('rejects uncommitted changes under a selected desktop source path', async () => {
    const desktopRoot = createRepository('CherryStudio', {
      ...sharedPackageFiles('desktop'),
      'packages/aiCore/src/index.ts': 'export const value = 1;\n',
    });
    const mobileRoot = createRepository('cherry-studio-app', {
      ...sharedPackageFiles('mobile'),
      'packages/ai-core/src/index.ts': 'export const value = 1;\n',
    });
    writeFileSync(join(desktopRoot, 'packages/aiCore/src/index.ts'), 'export const value = 2;\n');

    await expect(
      auditRepositories({
        desktopRoot,
        mobileRoot,
        manifest: manifestWithDomains({ 'ai-core': mirrorDomain() }),
        domains: ['ai-core'],
      }),
    ).rejects.toThrow(/uncommitted|dirty/i);
  });

  test('reports a verified mirror as aligned and preserves an unbaselined domain', async () => {
    const desktopRoot = createRepository('CherryStudio', {
      ...sharedPackageFiles('desktop'),
      'packages/aiCore/src/index.ts': 'export const value = 1;\n',
      'packages/aiCore/src/core/agents/createAgent.ts': 'export const createAgent = true;\n',
      'src/shared/ai/index.ts': 'export const shared = true;\n',
    });
    const mobileRoot = createRepository('cherry-studio-app', {
      ...sharedPackageFiles('mobile'),
      'packages/ai-core/src/index.ts': 'export const value = 1;\n',
      'packages/ai-core/src/core/agents/createAgent.ts': 'export const createAgent = true;\n',
      'src/shared/ai/index.ts': 'export const shared = true;\n',
    });
    const aiCoreFiles = git(desktopRoot, 'ls-files', '--', 'packages/aiCore')
      .split('\n')
      .filter(Boolean);
    const sourceSha256 = await hashTrackedFiles(desktopRoot, aiCoreFiles);
    const sourceCommit = git(desktopRoot, 'rev-parse', 'HEAD');
    const report = await auditRepositories({
      desktopRoot,
      mobileRoot,
      manifest: manifestWithDomains({
        'ai-core': mirrorDomain({ status: 'aligned', sourceCommit, sourceSha256 }),
        'shared-ai': {
          strategy: 'semantic-port',
          status: 'unbaselined',
          sourcePaths: ['src/shared/ai'],
          targetPaths: ['src/shared/ai'],
          sourceCommit: null,
          sourceSha256: null,
        },
      }),
      domains: ['ai-core', 'shared-ai'],
    });

    const domains = Object.fromEntries(report.domains.map((domain) => [domain.id, domain]));

    expect(domains['ai-core']).toMatchObject({
      baseline: { status: 'aligned' },
      currentSourceSha256: sourceSha256,
      status: 'aligned',
    });
    expect(domains['ai-core'].issues).toEqual([]);
    expect(domains['shared-ai']).toMatchObject({
      baseline: { status: 'unbaselined' },
      status: 'unbaselined',
    });
    expect(report.check.ok).toBe(false);
    expect(report.check.failingDomains).toEqual(['shared-ai']);
    expect(
      await auditRepositories({
        desktopRoot,
        mobileRoot,
        manifest: manifestWithDomains({
          'ai-core': mirrorDomain({ status: 'aligned', sourceCommit, sourceSha256 }),
        }),
        domains: ['ai-core'],
      }),
    ).toEqual(
      await auditRepositories({
        desktopRoot,
        mobileRoot,
        manifest: manifestWithDomains({
          'ai-core': mirrorDomain({ status: 'aligned', sourceCommit, sourceSha256 }),
        }),
        domains: ['ai-core'],
      }),
    );
    expect(JSON.stringify(report)).not.toContain(desktopRoot);
    expect(JSON.stringify(report)).not.toContain(mobileRoot);
    expect(report).not.toHaveProperty('generatedAt');
    expect(git(desktopRoot, 'status', '--porcelain')).toBe('');
    expect(git(mobileRoot, 'status', '--porcelain')).toBe('');
  });
});

describe('schema audit', () => {
  test('reports every desktop table missing from mobile, including Agent and Knowledge data', async () => {
    const table = { columns: { id: { name: 'id', type: 'text' } } };
    const desktopRoot = createRepository('schema-desktop-fixture', {
      'migrations/sqlite-drizzle/meta/0001_snapshot.json': JSON.stringify({
        tables: { agent: table, knowledge: table, topic: table },
      }),
      'src/main/data/db/schemas/schema.ts': `
        export const agent = sqliteTable('agent', {});
        export const knowledge = sqliteTable('knowledge', {});
        export const topic = sqliteTable('topic', {});
      `,
    });
    const mobileRoot = createRepository('schema-mobile-fixture', {
      'migrations/sqlite-drizzle/meta/0001_snapshot.json': JSON.stringify({
        tables: { topic: table },
      }),
      'src/backend/data/db/schemas/schema.ts': `
        export const topic = sqliteTable('topic', {});
      `,
    });

    await expect(compareSchemaState(desktopRoot, mobileRoot)).resolves.toMatchObject({
      ast: { desktopMatchesSnapshot: true, mobileMatchesSnapshot: true },
      changed: [],
      desktopTables: ['agent', 'knowledge', 'topic'],
      missing: ['agent', 'knowledge'],
      mobileTables: ['topic'],
    });
  });
});

describe('design catalog audit', () => {
  test('classifies an embedded PNG as a manual raster port and accepts opencode mapping', async () => {
    const desktopRoot = createRepository('icons-desktop-fixture', {
      'packages/ui/src/components/icons/providers/catalog.ts': `
        export const PROVIDER_ICON_CATALOG = {
          openai: {},
          opencode: {},
          'radeon-cloud': {},
        } as const;
      `,
      'packages/ui/src/components/icons/providers/radeon-cloud/index.tsx': `
        const logo = 'data:image/png;base64,iVBORw0KGgo=';
        export const RadeonCloud = () => logo;
      `,
    });
    const mobileRoot = createRepository('icons-mobile-fixture', {
      'packages/ui/icons/general/open-code.svg': '<svg />\n',
      'packages/ui/src/icons-webp/providers/light/openai.webp': 'webp',
      'packages/ui/src/icons-webp/providers/index.ts': `
        export const PROVIDER_ICONS = { openai: {} } as const;
      `,
    });

    const result = await auditDesignCatalog(desktopRoot, mobileRoot, {
      opencode: 'general/open-code',
    });

    expect(result.manualRasterAdapters).toEqual([
      expect.objectContaining({
        classification: 'semantic-port',
        id: 'radeon-cloud',
        mediaTypes: ['png'],
        output: '72x72 lossless WebP',
      }),
    ]);
    expect(result.missingWithoutRasterSource).toEqual([]);
    expect(result.virtualAdapters).toEqual([
      { id: 'opencode', target: 'general/open-code', valid: true },
    ]);
  });
});
