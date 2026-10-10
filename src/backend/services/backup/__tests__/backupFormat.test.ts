import {
  assertBackupPath,
  BACKUP_LIMITS,
  type BackupManifest,
  validateManifest,
} from '../backupFormat';

const sha256 = 'a'.repeat(64);
function manifest(): BackupManifest {
  return {
    product: 'cherry-mobile',
    formatVersion: 1,
    id: '10000000-0000-4000-8000-000000000001',
    createdAt: '2026-09-22T00:00:00.000Z',
    appVersion: '0.1.0',
    platform: 'ios',
    migrations: [{ when: 1789461429602, sha256 }],
    counts: { sessions: 1, messages: 2, files: 0, pluginConnections: 0 },
    entries: [{ path: 'database/cherry.db', size: 1024, sha256 }],
  };
}

test('accepts the portable mobile snapshot contract without platform-specific absolute paths', () => {
  expect(validateManifest(manifest())).toEqual(manifest());
});

test.each([
  '../database/cherry.db',
  '/database/cherry.db',
  'files/../secret',
  'files/a\\b',
  'files/a:b',
  'avatars/user/',
  'files/x\u0000y',
  'preferences.json',
  `skills/brief/revisions/${sha256}/../SKILL.md`,
  `skills/brief/revisions/${sha256}/./SKILL.md`,
  `skills/brief/revisions/${sha256}/references//format.md`,
  `skills/brief/revisions/invalid/SKILL.md`,
])('rejects unsafe or undeclared archive path %s', (path) => {
  expect(() => assertBackupPath(path)).toThrow('Unsafe archive path');
});

test('accepts nested files in pinned Skill revisions', () => {
  const base = manifest();
  const entry = { path: `skills/brief/revisions/${sha256}/references/format.md`, size: 40, sha256 };
  expect(validateManifest({ ...base, entries: [...base.entries, entry] }).entries).toContainEqual(
    entry,
  );
});

test('rejects another product or a future format instead of attempting replacement', () => {
  expect(() => validateManifest({ ...manifest(), product: 'cherry-desktop' })).toThrow(
    'incompatible',
  );
  expect(() => validateManifest({ ...manifest(), formatVersion: 3 })).toThrow('incompatible');
});

test('rejects experimental paired backups and never accepts a Pi cache as user backup data', () => {
  const base = manifest();
  expect(() => validateManifest({ ...base, formatVersion: 2 })).toThrow('incompatible');
  expect(() =>
    validateManifest({
      ...base,
      entries: [...base.entries, { path: 'database/pi-agent.db', size: 2048, sha256 }],
    }),
  ).toThrow(expect.objectContaining({ code: 'invalid' }));
});

test('rejects case collisions, missing database, forged hashes and undeclared fields', () => {
  const base = manifest();
  const file = { path: 'files/a.txt', size: 1, sha256 };
  for (const invalid of [
    { ...base, entries: [...base.entries, file, { ...file, path: 'files/A.txt' }] },
    { ...base, entries: [file] },
    { ...base, entries: [{ ...base.entries[0], sha256: 'bad' }] },
    { ...base, missing: [] },
  ])
    expect(() => validateManifest(invalid)).toThrow('invalid');
});

test('rejects inflated sizes and impossible numeric metadata before extracting content', () => {
  const base = manifest();
  expect(() =>
    validateManifest({
      ...base,
      entries: [{ ...base.entries[0], size: BACKUP_LIMITS.expandedBytes + 1 }],
    }),
  ).toThrow('too-large');
  expect(() => validateManifest({ ...base, counts: { ...base.counts, files: -1 } })).toThrow(
    'invalid',
  );
});
