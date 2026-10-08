import { Directory, File } from 'expo-file-system';

import type { BackupManifest } from '../backupFormat';
import { describeDatabase, validateResourceReferences } from '../backupResources';

const digest = 'a'.repeat(64);
const upstream = 'b'.repeat(64);
let mockHasSkills = true;
const mockDb = {
  getFirstAsync: jest.fn(async (sql: string) => {
    if (sql.includes('COUNT(*)')) return { count: 0 };
    if (sql.includes('sqlite_master')) return mockHasSkills ? { name: 'agent_global_skill' } : null;
    return null;
  }),
  getAllAsync: jest.fn(async (sql: string) => {
    if (!sql.includes('FROM agent_global_skill')) return [];
    return [
      {
        folderName: 'brief',
        packageDigest: digest,
        manifest: JSON.stringify([
          { path: 'SKILL.md', size: 20, digest },
          { path: 'references/format.md', size: 30, digest },
        ]),
        profile: JSON.stringify({
          packageDigest: digest,
          provenance: 'ai-assessed',
          requirements: { platforms: null, execution: 'none', builtInTools: [], pluginTools: [] },
          workflowScope: null,
          adaptation: {
            version: 1,
            upstreamDigest: upstream,
            modelId: 'model',
            adaptedAt: '2026-10-08T00:00:00.000Z',
            summary: 'Use mobile file tools',
            changes: [
              { path: 'SKILL.md', before: 'original', after: 'mobile', reason: 'Equivalent tools' },
            ],
          },
        }),
      },
    ];
  }),
};

jest.mock('@/backend/data/db/backupDatabase', () => ({
  withBackupDatabase: (_file: unknown, run: (db: typeof mockDb) => unknown) => run(mockDb),
}));
jest.mock('@/backend/data/storage/storagePaths', () => ({ skillStorageRootDirectory: jest.fn() }));

beforeEach(() => {
  mockHasSkills = true;
});

test('requires complete accepted and original packages, including nested resources', async () => {
  const description = await describeDatabase(new File('file:///backup/database/cherry.db'));
  expect(description.requiredPaths).toEqual(
    [digest, upstream].flatMap((revision) =>
      ['SKILL.md', 'references/format.md'].map(
        (path) => `skills/brief/revisions/${revision}/${path}`,
      ),
    ),
  );
  const manifest = {
    counts: description.counts,
    entries: description.requiredPaths.slice(1).map((path) => ({ path, size: 20, sha256: digest })),
  } as BackupManifest;
  await expect(
    validateResourceReferences(new Directory('file:///backup'), manifest),
  ).rejects.toMatchObject({ code: 'invalid' });
});

test('accepts an older database that predates Skill installation', async () => {
  mockHasSkills = false;
  expect(
    (await describeDatabase(new File('file:///backup/database/cherry.db'))).requiredPaths,
  ).toEqual([]);
});
