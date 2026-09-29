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
])('rejects unsafe or undeclared archive path %s', (path) => {
  expect(() => assertBackupPath(path)).toThrow('Unsafe archive path');
});

test('rejects another product or a future format instead of attempting replacement', () => {
  expect(() => validateManifest({ ...manifest(), product: 'cherry-desktop' })).toThrow(
    'incompatible',
  );
  expect(() => validateManifest({ ...manifest(), formatVersion: 2 })).toThrow('incompatible');
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
