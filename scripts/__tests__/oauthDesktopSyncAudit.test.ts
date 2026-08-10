import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { auditOAuthDesktopSync, type OAuthDesktopSyncMap } from '../oauthDesktopSyncAudit';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([repoPath, content]) => {
      const file = path.join(root, repoPath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    }),
  );
}

function git(root: string, args: string[]): void {
  execFileSync('git', ['-C', root, ...args]);
}

async function initializeRepository(root: string, name: string): Promise<void> {
  await writeFiles(root, { 'package.json': JSON.stringify({ name }) });
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'oauth-sync@example.com']);
  git(root, ['config', 'user.name', 'OAuth Sync Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'test: fixture']);
}

async function hashFile(root: string, repoPath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path.join(root, repoPath)))
    .digest('hex');
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'oauth-desktop-sync-'));
  roots.push(root);
  const desktopRoot = path.join(root, 'desktop');
  const mobileRoot = path.join(root, 'mobile');
  const mapPath = path.join(mobileRoot, 'oauth-map.json');
  const desktopFiles = {
    'src/main/services/CopilotService.ts': 'export const copilot = true;\n',
    'src/main/services/oauth/runtime/OAuthRuntimeService.ts': 'export const runtime = true;\n',
    'src/main/services/oauth/runtime/providers/codex.ts': 'export const codex = true;\n',
    'src/renderer/services/oauth.ts': 'export const rendererOauth = true;\n',
  };
  const mobileFiles = {
    'src/backend/services/oauth/authorization/adapters/BlockedOAuthAdapter.ts':
      'export const blocked = true;\n',
    'src/backend/services/oauth/authorization/adapters/CopilotOAuthAdapter.ts':
      'export const adapter = true;\n',
    'src/backend/services/oauth/authorization/adapters/PpioOAuthAdapter.ts':
      'export const adapter = true;\n',
    'src/backend/services/oauth/runtime/OAuthRuntimeService.ts':
      'export class OAuthRuntimeService {}\n',
  };

  await Promise.all([writeFiles(desktopRoot, desktopFiles), writeFiles(mobileRoot, mobileFiles)]);
  await Promise.all([
    initializeRepository(desktopRoot, 'CherryStudio'),
    initializeRepository(mobileRoot, 'cherry-studio-app'),
  ]);

  const sourceHash = (repoPath: string) => hashFile(desktopRoot, repoPath);
  const targetHash = (repoPath: string) => hashFile(mobileRoot, repoPath);
  const map: OAuthDesktopSyncMap = {
    desktop: {
      commit: execFileSync('git', ['-C', desktopRoot, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      files: [
        {
          classification: 'semantic-port',
          evidence: [
            'mobile:src/backend/services/oauth/authorization/adapters/CopilotOAuthAdapter.ts',
          ],
          reason: 'Copilot device authorization is adapted to fetch and mobile persistence.',
          source: 'src/main/services/CopilotService.ts',
          sourceSha256: await sourceHash('src/main/services/CopilotService.ts'),
          target: 'src/backend/services/oauth/authorization/adapters/CopilotOAuthAdapter.ts',
        },
        {
          classification: 'semantic-port',
          evidence: ['mobile:src/backend/services/oauth/runtime/OAuthRuntimeService.ts'],
          reason: 'Session semantics are portable.',
          source: 'src/main/services/oauth/runtime/OAuthRuntimeService.ts',
          sourceSha256: await sourceHash('src/main/services/oauth/runtime/OAuthRuntimeService.ts'),
          target: 'src/backend/services/oauth/runtime/OAuthRuntimeService.ts',
        },
        {
          classification: 'blocked',
          evidence: ['desktop:src/main/services/oauth/runtime/providers/codex.ts'],
          reason: 'Loopback authorization requires a desktop listener.',
          source: 'src/main/services/oauth/runtime/providers/codex.ts',
          sourceSha256: await sourceHash('src/main/services/oauth/runtime/providers/codex.ts'),
        },
        {
          classification: 'semantic-port',
          evidence: [
            'mobile:src/backend/services/oauth/authorization/adapters/PpioOAuthAdapter.ts',
          ],
          reason: 'Renderer API-key OAuth is adapted to mobile.',
          source: 'src/renderer/services/oauth.ts',
          sourceSha256: await sourceHash('src/renderer/services/oauth.ts'),
          target: 'src/backend/services/oauth/authorization/adapters/PpioOAuthAdapter.ts',
        },
      ],
      repository: 'https://github.com/CherryHQ/cherry-studio.git',
      sourcePaths: [
        'src/main/services/oauth',
        'src/main/services/CopilotService.ts',
        'src/renderer/services/oauth.ts',
      ],
    },
    mobile: {
      files: [
        {
          classification: 'mobile-extension',
          evidence: ['desktop:src/main/services/oauth/runtime/providers/codex.ts'],
          reason: 'Mobile reports the unsupported loopback flow explicitly.',
          target: 'src/backend/services/oauth/authorization/adapters/BlockedOAuthAdapter.ts',
          targetSha256: await targetHash(
            'src/backend/services/oauth/authorization/adapters/BlockedOAuthAdapter.ts',
          ),
        },
        {
          classification: 'semantic-port',
          desktopSources: ['src/main/services/CopilotService.ts'],
          evidence: ['desktop:src/main/services/CopilotService.ts'],
          reason: 'Ports the device-code and serving-token behavior.',
          target: 'src/backend/services/oauth/authorization/adapters/CopilotOAuthAdapter.ts',
          targetSha256: await targetHash(
            'src/backend/services/oauth/authorization/adapters/CopilotOAuthAdapter.ts',
          ),
        },
        {
          classification: 'semantic-port',
          desktopSources: ['src/renderer/services/oauth.ts'],
          evidence: ['desktop:src/renderer/services/oauth.ts'],
          reason: 'Ports the PPIO authorization-code exchange.',
          target: 'src/backend/services/oauth/authorization/adapters/PpioOAuthAdapter.ts',
          targetSha256: await targetHash(
            'src/backend/services/oauth/authorization/adapters/PpioOAuthAdapter.ts',
          ),
        },
        {
          classification: 'semantic-port',
          desktopSources: ['src/main/services/oauth/runtime/OAuthRuntimeService.ts'],
          evidence: ['desktop:src/main/services/oauth/runtime/OAuthRuntimeService.ts'],
          reason: 'Ports session lifecycle semantics.',
          target: 'src/backend/services/oauth/runtime/OAuthRuntimeService.ts',
          targetSha256: await targetHash(
            'src/backend/services/oauth/runtime/OAuthRuntimeService.ts',
          ),
        },
      ],
      ownedFiles: [],
      sourceRoot: 'src/backend/services/oauth',
    },
    schemaVersion: 1,
  };
  await writeFile(mapPath, JSON.stringify(map));

  return { desktopRoot, map, mapPath, mobileRoot };
}

describe('OAuth desktop provenance', () => {
  it('passes a complete map while keeping loopback blockers visible', async () => {
    const fixture = await createFixture();

    await expect(auditOAuthDesktopSync(fixture)).resolves.toMatchObject({
      blocked: ['src/main/services/oauth/runtime/providers/codex.ts'],
      errors: [],
      ok: true,
      sourceDrift: [],
      targetDrift: [],
    });
  });

  it('rejects a new unmapped desktop OAuth file', async () => {
    const fixture = await createFixture();
    await writeFiles(fixture.desktopRoot, {
      'src/main/services/oauth/runtime/providers/new-provider.ts': 'export const added = true;\n',
    });
    git(fixture.desktopRoot, ['add', '.']);
    git(fixture.desktopRoot, ['commit', '-qm', 'test: add provider']);

    const result = await auditOAuthDesktopSync(fixture);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'unmapped desktop source: src/main/services/oauth/runtime/providers/new-provider.ts',
    );
  });

  it('reports source and target hash drift independently', async () => {
    const fixture = await createFixture();
    await writeFiles(fixture.desktopRoot, {
      'src/main/services/CopilotService.ts': 'export const copilot = false;\n',
    });
    git(fixture.desktopRoot, ['add', '.']);
    git(fixture.desktopRoot, ['commit', '-qm', 'test: drift source']);
    await writeFiles(fixture.mobileRoot, {
      'src/backend/services/oauth/authorization/adapters/PpioOAuthAdapter.ts':
        'export const adapter = false;\n',
    });

    const result = await auditOAuthDesktopSync(fixture);

    expect(result.ok).toBe(false);
    expect(result.sourceDrift).toEqual(['src/main/services/CopilotService.ts']);
    expect(result.targetDrift).toEqual([
      'src/backend/services/oauth/authorization/adapters/PpioOAuthAdapter.ts',
    ]);
  });

  it('rejects missing evidence and duplicate targets', async () => {
    const fixture = await createFixture();
    fixture.map.mobile.files[1].evidence = ['mobile:missing-evidence.ts'];
    fixture.map.mobile.files[1].target = fixture.map.mobile.files[0].target;
    await writeFile(fixture.mapPath, JSON.stringify(fixture.map));

    const result = await auditOAuthDesktopSync(fixture);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('missing evidence: mobile:missing-evidence.ts');
    expect(result.errors).toContain(
      'duplicate target: src/backend/services/oauth/authorization/adapters/BlockedOAuthAdapter.ts',
    );
  });

  it('guards the session runtime against provider-specific flow logic', async () => {
    const fixture = await createFixture();
    await writeFiles(fixture.mobileRoot, {
      'src/backend/services/oauth/runtime/OAuthRuntimeService.ts':
        "export const endpoint = 'https://provider.example';\n",
    });

    const result = await auditOAuthDesktopSync(fixture);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('OAuthRuntimeService contains provider URL');
  });
});
