import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { auditDesktopSync, type DesktopSyncMap } from '../check-desktop-sync';

type Fixture = {
  desktopRoot: string;
  map: DesktopSyncMap;
  mapPath: string;
  mobileRoot: string;
  packageRoot: string;
  root: string;
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('AI runtime desktop provenance', () => {
  it('allows a classified blocked backlog without weakening implemented mappings', async () => {
    const fixture = await createFixture();

    const report = await auditDesktopSync(fixture);

    expect(report.ok).toBe(true);
    expect(report.blocked).toEqual(['src/main/ai/blocked.ts']);
    expect(report.counts).toMatchObject({ blocked: 1, desktopFiles: 2, packageFiles: 1 });
  });

  it('rejects a newly tracked desktop file with no classification', async () => {
    const fixture = await createFixture();
    await writeFile(
      path.join(fixture.desktopRoot, 'src/main/ai/new.ts'),
      'export const added = 1;\n',
    );
    commitAll(fixture.desktopRoot, 'add desktop source');

    const report = await auditDesktopSync(fixture);

    expect(report.ok).toBe(false);
    expect(report.errors).toContain('unmapped desktop source: src/main/ai/new.ts');
  });

  it('rejects a new mobile file with no classification before it is committed', async () => {
    const fixture = await createFixture();
    await writeFile(
      path.join(fixture.mobileRoot, 'src/backend/ai/new.ts'),
      'export const added = 1;\n',
    );

    const report = await auditDesktopSync(fixture);

    expect(report.ok).toBe(false);
    expect(report.errors).toContain('unmapped backend target: src/backend/ai/new.ts');
  });

  it('keeps migrated mobile sources anchored to the historical commit', async () => {
    const fixture = await createFixture();
    const record = fixture.map.mobile.files[0];
    fixture.map.mobile.files[0] = {
      classification: 'semantic-port',
      desktopSource: fixture.map.desktop.files[0].source,
      evidence: [`mobile:${record.source}`],
      reason: 'fixture source moved into the portable package',
      source: record.source,
      sourceSha256: record.sourceSha256,
    };
    await writeMap(fixture);
    await rm(path.join(fixture.mobileRoot, record.source));
    commitAll(fixture.mobileRoot, 'move historical mobile source');

    const report = await auditDesktopSync(fixture);

    expect(report.ok).toBe(true);
  });

  it('accepts a classified backend adapter added after the mobile baseline', async () => {
    const fixture = await createFixture();
    const target = 'src/backend/ai/newAdapter.ts';
    await writeFile(path.join(fixture.mobileRoot, target), 'export const adapter = 1;\n');
    fixture.map.backendOwned.push({
      classification: 'mobile-extension',
      evidence: [`mobile:${target}`],
      reason: 'fixture platform adapter',
      target,
      targetSha256: await hashFile(path.join(fixture.mobileRoot, target)),
    });
    await writeMap(fixture);

    const report = await auditDesktopSync(fixture);

    expect(report.ok).toBe(true);
  });

  it('rejects duplicate targets and missing evidence', async () => {
    const fixture = await createFixture();
    fixture.map.packageOwned.push({
      classification: 'mobile-extension',
      evidence: ['mobile:missing.test.ts'],
      reason: 'fixture duplicate',
      target: 'packages/ai-runtime/src/messages/a.ts',
      targetSha256: fixture.map.desktop.files[0].targetSha256 ?? '',
    });
    await writeMap(fixture);

    const report = await auditDesktopSync(fixture);

    expect(report.ok).toBe(false);
    expect(report.errors).toContain('duplicate target: packages/ai-runtime/src/messages/a.ts');
    expect(report.errors).toContain('missing evidence: mobile:missing.test.ts');
  });

  it('reports clean source hash drift after the desktop commit advances', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.desktopRoot, 'src/main/ai/a.ts'), 'export const a = 2;\n');
    commitAll(fixture.desktopRoot, 'change desktop source');

    const report = await auditDesktopSync(fixture);

    expect(report.ok).toBe(false);
    expect(report.sourceDrift).toContain('desktop:src/main/ai/a.ts');
  });

  it('reports a missing or changed target', async () => {
    const fixture = await createFixture();
    await writeFile(
      path.join(fixture.packageRoot, 'src/messages/a.ts'),
      'export const target = 2;\n',
    );

    const report = await auditDesktopSync(fixture);

    expect(report.ok).toBe(false);
    expect(report.targetDrift).toContain('packages/ai-runtime/src/messages/a.ts');

    await rm(path.join(fixture.packageRoot, 'src/messages/a.ts'));
    const missingReport = await auditDesktopSync(fixture);
    expect(missingReport.ok).toBe(false);
    expect(missingReport.errors).toContain(
      'missing package target: packages/ai-runtime/src/messages/a.ts',
    );
  });

  it('rejects Expo imports inside package source', async () => {
    const fixture = await createFixture();
    await writeFile(
      path.join(fixture.packageRoot, 'src/messages/a.ts'),
      "import 'expo';\nexport const target = 1;\n",
    );

    const report = await auditDesktopSync(fixture);
    expect(report.ok).toBe(false);
    expect(report.errors).toContain('boundary violation: src/messages/a.ts -> expo');
  });
});

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'ai-runtime-sync-'));
  roots.push(root);
  const desktopRoot = path.join(root, 'desktop');
  const mobileRoot = path.join(root, 'mobile');
  const packageRoot = path.join(mobileRoot, 'packages/ai-runtime');
  const mapPath = path.join(packageRoot, 'desktop-sync-map.json');

  await Promise.all([
    mkdir(path.join(desktopRoot, 'src/main/ai'), { recursive: true }),
    mkdir(path.join(mobileRoot, 'src/backend/ai'), { recursive: true }),
    mkdir(path.join(packageRoot, 'src/messages'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(desktopRoot, 'package.json'), '{"name":"CherryStudio"}\n'),
    writeFile(path.join(desktopRoot, 'src/main/ai/a.ts'), 'export const a = 1;\n'),
    writeFile(path.join(desktopRoot, 'src/main/ai/blocked.ts'), 'export const blocked = 1;\n'),
    writeFile(path.join(mobileRoot, 'package.json'), '{"name":"cherry-studio-app"}\n'),
    writeFile(path.join(mobileRoot, 'src/backend/ai/a.ts'), 'export const mobile = 1;\n'),
    writeFile(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({
        exports: Object.fromEntries(
          ['./messages', './provider', './runtime', './tools', './utils'].map((entry) => [
            entry,
            './src/messages/a.ts',
          ]),
        ),
        name: '@cherrystudio/ai-runtime',
      }),
    ),
    writeFile(path.join(packageRoot, 'src/messages/a.ts'), 'export const target = 1;\n'),
  ]);
  commitAll(desktopRoot, 'desktop fixture');
  commitAll(mobileRoot, 'mobile fixture');

  const desktopA = 'src/main/ai/a.ts';
  const desktopBlocked = 'src/main/ai/blocked.ts';
  const mobileA = 'src/backend/ai/a.ts';
  const target = 'packages/ai-runtime/src/messages/a.ts';
  const map: DesktopSyncMap = {
    schemaVersion: 2,
    backendOwned: [],
    desktop: {
      commit: git(desktopRoot, ['rev-parse', 'HEAD']),
      files: [
        {
          classification: 'semantic-port',
          evidence: [`mobile:${target}`],
          reason: 'fixture port',
          source: desktopA,
          sourceSha256: await hashFile(path.join(desktopRoot, desktopA)),
          target,
          targetSha256: await hashFile(path.join(mobileRoot, target)),
        },
        {
          classification: 'blocked',
          evidence: [`desktop:${desktopBlocked}`],
          reason: 'fixture backlog',
          source: desktopBlocked,
          sourceSha256: await hashFile(path.join(desktopRoot, desktopBlocked)),
        },
      ],
      repository: 'https://example.com/desktop.git',
      sourceRoot: 'src/main/ai',
    },
    mobile: {
      commit: git(mobileRoot, ['rev-parse', 'HEAD']),
      files: [
        {
          classification: 'mobile-extension',
          evidence: [`mobile:${mobileA}`],
          reason: 'fixture backend adapter',
          source: mobileA,
          sourceSha256: await hashFile(path.join(mobileRoot, mobileA)),
          target: mobileA,
          targetSha256: await hashFile(path.join(mobileRoot, mobileA)),
        },
      ],
      sourceRoot: 'src/backend/ai',
    },
    packageOwned: [],
  };
  const fixture = { desktopRoot, map, mapPath, mobileRoot, packageRoot, root };
  await writeMap(fixture);
  return fixture;
}

async function writeMap(fixture: Fixture): Promise<void> {
  await writeFile(fixture.mapPath, `${JSON.stringify(fixture.map, null, 2)}\n`);
}

function commitAll(root: string, message: string): void {
  if (!path.isAbsolute(root)) throw new Error('fixture root must be absolute');
  if (!existsSync(path.join(root, '.git'))) {
    git(root, ['init', '-q']);
    git(root, ['config', 'user.email', 'fixture@example.com']);
    git(root, ['config', 'user.name', 'Fixture']);
  }
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', message]);
}

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

async function hashFile(file: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}
