import { Directory, File } from 'expo-file-system';

import type { BackupManifest } from '../backupFormat';
import { describeDatabase, validateResourceReferences } from '../backupResources';

const digest = 'a'.repeat(64);
let mockHasSkills = true;
let mockAgentIds: string[] = [];
const mockDb = {
  getFirstAsync: jest.fn(async (sql: string) => {
    if (sql.includes('COUNT(*)')) return { count: 0 };
    if (sql.includes('sqlite_master')) return mockHasSkills ? { name: 'agent_global_skill' } : null;
    return null;
  }),
  getAllAsync: jest.fn(async (sql: string) => {
    if (sql === 'SELECT id FROM agent') return mockAgentIds.map((id) => ({ id }));
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
  mockAgentIds = [];
});

test('requires complete installed packages, including nested resources', async () => {
  const description = await describeDatabase(new File('file:///backup/database/cherry.db'));
  expect(description.requiredPaths).toEqual(
    ['SKILL.md', 'references/format.md'].map((path) => `skills/brief/${digest}/${path}`),
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

test('restores memory only for Agents present in the archived database', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const root = new Directory('file:///backup');
  const description = await describeDatabase(new File('file:///backup/database/cherry.db'));
  const manifest = {
    counts: description.counts,
    entries: [...description.requiredPaths, `agent-memory/${id}/USER.md`].map((path) => ({
      path,
      size: 20,
      sha256: digest,
    })),
  } as BackupManifest;
  await expect(validateResourceReferences(root, manifest)).rejects.toMatchObject({
    code: 'invalid',
  });
  mockAgentIds = [id];
  await expect(validateResourceReferences(root, manifest)).resolves.toBeUndefined();
});
