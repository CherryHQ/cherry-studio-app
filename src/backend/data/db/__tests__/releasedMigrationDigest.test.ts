import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Backup manifests include the exact SQL digest, so even an equivalent edit to
// a released migration makes existing backups incompatible before row import.
test('preserves the migration 0011 digest shipped in v0.6.2 backups', () => {
  const sql = readFileSync(
    path.resolve(__dirname, '../../../../../migrations/sqlite-drizzle/0011_file_library.sql'),
    'utf8',
  );
  expect(createHash('sha256').update(sql).digest('hex')).toBe(
    'bacba6dc7b4ce0878615e380d3944259d7fa48a84413c1d0c174f0aab391ffa2',
  );
});
