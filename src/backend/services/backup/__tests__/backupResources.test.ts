import { Directory, File } from 'expo-file-system';

import type { BackupManifest } from '../backupFormat';
import { describeDatabase, restoredFile, validateResourceReferences } from '../backupResources';

const digest = 'a'.repeat(64);
let mockHasSkills = true;
let mockAvatar: string | null = null;
const mockDb = {
  getFirstAsync: jest.fn(async (sql: string) => {
    if (sql.includes('COUNT(*)')) return { count: 0 };
    if (sql.includes('sqlite_master')) return mockHasSkills ? { name: 'agent_global_skill' } : null;
    return null;
  }),
  getAllAsync: jest.fn(async (sql: string) => {
    if (sql.includes("LIKE 'avatar-resource:%'")) return mockAvatar ? [{ avatar: mockAvatar }] : [];
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
  mockAvatar = null;
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

test('requires both the dynamic recipe and its cover on restore', async () => {
  mockHasSkills = false;
  const id = '00000000-0000-4000-8000-000000000001';
  mockAvatar = `avatar-resource:${id}`;
  const description = await describeDatabase(new File('file:///backup/database/cherry.db'));
  expect(description.requiredPaths).toEqual([
    `avatars/resources/${id}.json`,
    `avatars/resources/${id}.png`,
  ]);
  const manifest = {
    counts: description.counts,
    entries: description.requiredPaths.map((path) => ({ path, size: 20, sha256: digest })),
  } as BackupManifest;
  await expect(
    validateResourceReferences(new Directory('file:///backup'), manifest),
  ).resolves.toBeUndefined();
  for (const missing of description.requiredPaths) {
    await expect(
      validateResourceReferences(new Directory('file:///backup'), {
        ...manifest,
        entries: manifest.entries.filter(({ path }) => path !== missing),
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  }
});

test('library characters restore into their own directory', () => {
  const path = 'avatars/characters/00000000-0000-4000-8000-000000000001.idle.webp';
  expect(restoredFile(new Directory('file:///root'), path).uri).toBe(
    'file:///root/avatar-characters/00000000-0000-4000-8000-000000000001.idle.webp',
  );
});
