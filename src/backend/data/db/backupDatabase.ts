import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { BackupError } from '@/shared/contracts/backup';
import { DEVICE_LOCAL_PREFERENCE_KEYS } from '@/shared/data/preference/preferenceSchema';

import { customSqlStatements } from './customSql';
import { migrations } from './migrations';

export type BackupMigration = { when: number; sha256: string };
export type BackupDatabaseVersion = { migrations: BackupMigration[] };

const migrationSql = (index: number): string => {
  const key = `m${String(index).padStart(4, '0')}` as keyof typeof migrations.migrations;
  const sql = migrations.migrations[key];
  if (!sql) throw new BackupError('incompatible');
  return sql;
};
const sha256 = (value: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value);

// Custom SQL triggers are dropped and recreated from the running bundle (by restore
// normalization and by DbService at startup), so a backup's older bodies never survive.
const REBUILT_TRIGGERS = customSqlStatements.flatMap(
  (sql) => /^\s*CREATE TRIGGER\s+(\w+)/i.exec(sql)?.[1] ?? [],
);

export async function bundledBackupVersion(): Promise<BackupDatabaseVersion> {
  return {
    migrations: await Promise.all(
      migrations.journal.entries.map(async (entry) => ({
        when: entry.when,
        sha256: await sha256(migrationSql(entry.idx)),
      })),
    ),
  };
}

export async function withBackupDatabase<T>(
  file: File,
  run: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  file.parentDirectory.create({ intermediates: true, idempotent: true });
  const db = await openDatabaseAsync(
    file.name,
    {
      useNewConnection: true,
      finalizeUnusedStatementsBeforeClosing: false,
    },
    file.parentDirectory.uri,
  );
  try {
    return await run(db);
  } finally {
    await db.closeAsync();
  }
}

export async function captureDatabase(source: SQLiteDatabase, target: File): Promise<void> {
  await withBackupDatabase(target, async (destination) => {
    await backupDatabaseAsync({ sourceDatabase: source, destDatabase: destination });
    await sealDatabase(destination);
  });
  assertNoSidecars(target);
}

async function sealDatabase(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ busy: number }>('PRAGMA wal_checkpoint(TRUNCATE)');
  if (result && result.busy !== 0) throw new BackupError('busy');
  await db.execAsync('PRAGMA journal_mode = DELETE');
}

export function assertNoSidecars(file: File): void {
  for (const suffix of ['-wal', '-shm']) {
    if (new File(`${file.uri}${suffix}`).exists)
      throw new BackupError('storage', 'Unsealed backup database.');
  }
}

export async function readBackupSchema(db: SQLiteDatabase): Promise<string> {
  const rows = await db.getAllAsync<{ type: string; name: string; sql: string }>(
    `SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL
     AND name NOT GLOB 'sqlite_*' AND NOT (type = 'table' AND name IN
       ('agent_session_message_fts_data','agent_session_message_fts_idx','agent_session_message_fts_docsize','agent_session_message_fts_config'))
     AND NOT (type = 'trigger' AND name IN (${REBUILT_TRIGGERS.map(() => '?').join(',')}))
     ORDER BY type, name`,
    REBUILT_TRIGGERS,
  );
  return JSON.stringify(rows.map((row) => ({ ...row, sql: row.sql.replace(/\s+/g, ' ').trim() })));
}

async function applyMigrations(db: SQLiteDatabase, count: number): Promise<void> {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric
  )`);
  const applied = await db.getAllAsync<{ created_at: number }>(
    'SELECT created_at FROM __drizzle_migrations ORDER BY created_at',
  );
  for (const entry of migrations.journal.entries.slice(applied.length, count)) {
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      for (const sql of migrationSql(entry.idx).split('--> statement-breakpoint'))
        await db.execAsync(sql);
      await db.runAsync(
        'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
        '',
        entry.when,
      );
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }
  for (const sql of customSqlStatements) await db.execAsync(sql);
}

export async function validateBackupDatabase(
  file: File,
  version: BackupDatabaseVersion,
): Promise<void> {
  const bundled = await bundledBackupVersion();
  if (
    !version.migrations.length ||
    version.migrations.length > bundled.migrations.length ||
    version.migrations.some(
      (entry, index) =>
        entry.when !== bundled.migrations[index].when ||
        entry.sha256 !== bundled.migrations[index].sha256,
    )
  ) {
    throw new BackupError('incompatible');
  }
  const referenceDirectory = new Directory(Paths.cache, `backup-schema-${randomUUID()}`);
  referenceDirectory.create();
  try {
    const expected = await withBackupDatabase(
      new File(referenceDirectory, 'schema.db'),
      async (db) => {
        await applyMigrations(db, version.migrations.length);
        return readBackupSchema(db);
      },
    );
    await withBackupDatabase(file, async (db) => {
      await db.execAsync('PRAGMA query_only = ON');
      if ((await readBackupSchema(db)) !== expected)
        throw new BackupError(
          'incompatible',
          'Database structure does not match its migration lineage.',
        );
      const applied = await db.getAllAsync<{ created_at: number; hash: string }>(
        'SELECT created_at, hash FROM __drizzle_migrations ORDER BY created_at',
      );
      if (
        applied.length !== version.migrations.length ||
        applied.some(
          (entry, index) =>
            entry.created_at !== version.migrations[index].when || entry.hash !== '',
        )
      )
        throw new BackupError('incompatible');
      const integrity = await db.getFirstAsync<{ integrity_check: string }>(
        'PRAGMA integrity_check',
      );
      if (
        integrity?.integrity_check !== 'ok' ||
        (await db.getAllAsync('PRAGMA foreign_key_check')).length
      )
        throw new BackupError('invalid');
      await db.execAsync('PRAGMA query_only = OFF');
    });
  } finally {
    if (referenceDirectory.exists) referenceDirectory.delete();
  }
}

export type DevicePreferenceRow = { key: string; value: string | null };
export function readDevicePreferences(db: SQLiteDatabase): Promise<DevicePreferenceRow[]> {
  return db.getAllAsync<DevicePreferenceRow>(
    `SELECT key, value FROM preference WHERE scope = 'default' AND key IN (${DEVICE_LOCAL_PREFERENCE_KEYS.map(() => '?').join(',')})`,
    [...DEVICE_LOCAL_PREFERENCE_KEYS],
  );
}

export async function prepareRestoredDatabase(
  file: File,
  preferences: DevicePreferenceRow[],
): Promise<void> {
  await withBackupDatabase(file, async (db) => {
    await applyMigrations(db, migrations.journal.entries.length);
    await restoreDeviceState(db, preferences);
    await sealDatabase(db);
  });
  assertNoSidecars(file);
}

/** Reset execution and device-bound credentials before the imported store can open. */
export async function restoreDeviceState(
  db: SQLiteDatabase,
  preferences: DevicePreferenceRow[],
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
  try {
    const now = Date.now();
    await db.runAsync('DELETE FROM desktop_connection');
    await db.runAsync(
      "UPDATE agent_session_message SET status = 'interrupted', updated_at = ? WHERE status IN ('pending','streaming')",
      now,
    );
    await db.runAsync(
      "UPDATE job SET status = 'cancelled', cancel_requested = 1, finished_at = ?, updated_at = ? WHERE status IN ('pending','delayed','running')",
      now,
      now,
    );
    const grants = await db.getAllAsync<{ id: string }>('SELECT id FROM plugin_authorization');
    for (const grant of grants) {
      await db.runAsync(
        'UPDATE plugin_authorization SET credential = ? WHERE id = ?',
        JSON.stringify({ storage: 'secure-store-v1', id: randomUUID() }),
        grant.id,
      );
    }
    for (const key of DEVICE_LOCAL_PREFERENCE_KEYS) {
      await db.runAsync("DELETE FROM preference WHERE scope = 'default' AND key = ?", key);
    }
    for (const entry of preferences) {
      await db.runAsync(
        "INSERT INTO preference (scope, key, value, created_at, updated_at) VALUES ('default', ?, ?, ?, ?)",
        entry.key,
        entry.value,
        now,
        now,
      );
    }
    if ((await db.getAllAsync('PRAGMA foreign_key_check')).length) throw new BackupError('invalid');
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
