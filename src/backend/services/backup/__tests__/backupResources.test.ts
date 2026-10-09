import { Directory, File } from 'expo-file-system';

import type { BackupManifest } from '../backupFormat';
import { describeDatabase, validateResourceReferences } from '../backupResources';

const digest = 'a'.repeat(64);
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
        contentHash: digest,
        manifest: JSON.stringify([
          { path: 'SKILL.md', size: 20, digest },
          { path: 'references/format.md', size: 30, digest },
        ]),
      },
    ];
  }),
};

jest.mock('@/backend/data/db/backupDatabase', () => ({
  withBackupDatabase: (_file: unknown, run: (db: typeof mockDb) => unknown) => run(mockDb),
}));

beforeEach(() => {
  mockHasSkills = true;
});

test('requires complete installed packages, including nested resources', async () => {
  const description = await describeDatabase(new File('file:///backup/database/cherry.db'));
  expect(description.requiredPaths).toEqual(
    ['SKILL.md', 'references/format.md'].map((path) => `skills/brief/revisions/${digest}/${path}`),
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
