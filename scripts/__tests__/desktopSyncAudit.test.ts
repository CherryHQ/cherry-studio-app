import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { DesktopSyncDomain, DesktopSyncManifest } from '../desktopSyncAudit';
import {
  auditDesignCatalog,
  auditRepositories,
  extractObjectKeys,
  hashTrackedFiles,
  parseArguments,
  pathMatchesGlob,
  validateManifest,
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

function delegatedServiceMap(
  files: Array<{
    classification: 'blocked' | 'explicit-exclusion' | 'mobile-extension' | 'semantic-port';
    contents: string;
    source: string;
  }>,
) {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      desktop: {
        sourcePaths: [
          'src/main/services/oauth',
          'src/main/services/CopilotService.ts',
          'src/renderer/services/oauth.ts',
        ],
        files: files.map(({ classification, contents, source }) => ({
          classification,
          source,
          sourceSha256: createHash('sha256').update(contents).digest('hex'),
        })),
      },
    },
    null,
    2,
  )}\n`;
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
        'services',
        '--domain=ai-core',
        '--json',
        '--check',
      ],
      { CHERRY_STUDIO_DESKTOP_ROOT: './from-environment' },
    );

    expect(parsed).toMatchObject({
      check: true,
      desktopRoot: resolve('./from-cli'),
      domains: ['services', 'ai-core'],
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

describe('validateManifest', () => {
  test('retains mobileExtensions entries that declare a path, keeps, and adds', () => {
    const manifest = validateManifest(
      manifestWithDomains({
        'shared-ai': mirrorDomain({
          mobileExtensions: [
            {
              path: 'packages/universal/src/ai/transport/toolApprovals.ts',
              keeps: 'nothing, desktop has no counterpart',
              adds: 'the approval settlement helpers the mobile approval sheet needs',
            },
          ],
        }),
      }),
    );

    expect(manifest.domains['shared-ai'].mobileExtensions).toEqual([
      expect.objectContaining({
        path: 'packages/universal/src/ai/transport/toolApprovals.ts',
      }),
    ]);
  });

  test('rejects a mobileExtensions entry that omits adds', () => {
    expect(() =>
      validateManifest(
        manifestWithDomains({
          'shared-ai': mirrorDomain({
            mobileExtensions: [
              { path: 'packages/universal/src/ai/tools/mcpResult.ts', keeps: 'everything' },
            ] as never,
          }),
        }),
      ),
    ).toThrow(/mobileExtensions must be \{path, keeps, adds\} entries/);
  });

  test('rejects a mobileExtensions path that escapes the repository', () => {
    expect(() =>
      validateManifest(
        manifestWithDomains({
          'shared-ai': mirrorDomain({
            mobileExtensions: [{ path: '../elsewhere.ts', keeps: 'nothing', adds: 'nothing' }],
          }),
        }),
      ),
    ).toThrow(/mobileExtensions must be a repository-relative path/);
  });
});

describe('structured source extraction', () => {
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

  test('overlays delegated service classifications without hiding unrelated service blockers', async () => {
    const runtime = 'export const runtime = true;\n';
    const copilot = 'export const copilot = true;\n';
    const codex = 'export const codex = true;\n';
    const renderer = 'export const rendererOauth = true;\n';
    const unrelated = 'export const unrelated = true;\n';
    const desktopRoot = createRepository('CherryStudio', {
      ...sharedPackageFiles('desktop'),
      'src/main/services/CopilotService.ts': copilot,
      'src/main/services/UnrelatedService.ts': unrelated,
      'src/main/services/oauth/runtime/OAuthRuntimeService.ts': runtime,
      'src/main/services/oauth/runtime/providers/codex.ts': codex,
      'src/renderer/services/oauth.ts': renderer,
    });
    const mobileRoot = createRepository('cherry-studio-app', {
      ...sharedPackageFiles('mobile'),
      'src/backend/services/oauth/desktop-sync-map.json': delegatedServiceMap([
        {
          classification: 'semantic-port',
          contents: copilot,
          source: 'src/main/services/CopilotService.ts',
        },
        {
          classification: 'semantic-port',
          contents: runtime,
          source: 'src/main/services/oauth/runtime/OAuthRuntimeService.ts',
        },
        {
          classification: 'blocked',
          contents: codex,
          source: 'src/main/services/oauth/runtime/providers/codex.ts',
        },
        {
          classification: 'semantic-port',
          contents: renderer,
          source: 'src/renderer/services/oauth.ts',
        },
      ]),
      'src/backend/services/oauth/runtime/OAuthRuntimeService.ts': runtime,
    });
    const manifest = manifestWithDomains({
      services: {
        sourceCommit: null,
        sourcePaths: ['src/main/services'],
        sourceSha256: null,
        status: 'unbaselined',
        strategy: 'semantic-port',
        targetPaths: ['src/backend/services'],
      },
    });
    manifest.delegatedManifests = {
      services: 'src/backend/services/oauth/desktop-sync-map.json',
    };

    const report = await auditRepositories({
      desktopRoot,
      domains: ['services'],
      manifest,
      mobileRoot,
    });
    const domain = report.domains[0];

    expect(domain.classifications['semantic-port']).toEqual([
      'src/main/services/CopilotService.ts',
      'src/main/services/oauth/runtime/OAuthRuntimeService.ts',
    ]);
    expect(domain.classifications.blocked).toEqual([
      'UnrelatedService.ts',
      'src/main/services/oauth/runtime/providers/codex.ts',
    ]);
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
