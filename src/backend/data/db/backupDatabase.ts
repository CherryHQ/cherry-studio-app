import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { BackupError } from '@/shared/contracts/backup';
import { DEVICE_LOCAL_PREFERENCE_KEYS } from '@/shared/data/preference/preferenceSchema';

import { customSqlStatements } from './customSql';
import { validateFileLibraryDatabase } from './fileLibraryValidation';
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
}

async function validateBackupVersion(version: BackupDatabaseVersion): Promise<void> {
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
}

async function validateMigrationJournal(
  db: SQLiteDatabase,
  version: BackupDatabaseVersion,
): Promise<void> {
  const applied = await db.getAllAsync<{ created_at: number; hash: string }>(
    'SELECT created_at, hash FROM __drizzle_migrations ORDER BY created_at',
  );
  if (
    applied.length !== version.migrations.length ||
    applied.some(
      (entry, index) => entry.created_at !== version.migrations[index].when || entry.hash !== '',
    )
  )
    throw new BackupError('incompatible');
}

async function validateDatabaseContents(db: SQLiteDatabase): Promise<void> {
  const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  if (integrity?.integrity_check !== 'ok') throw new BackupError('invalid');
  const sessionKeys = await db.getAllAsync<{ id: number; from: string }>(
    'PRAGMA foreign_key_list(agent_session)',
  );
  const workspaceKey = sessionKeys.find((key) => key.from === 'workspace_folder_id')?.id;
  const violations = await db.getAllAsync<{ table: string; fkid: number }>(
    'PRAGMA foreign_key_check',
  );
  if (
    violations.some(
      (violation) => violation.table !== 'agent_session' || violation.fkid !== workspaceKey,
    )
  )
    throw new BackupError('invalid');
  await validateFileLibraryDatabase(db);
}

/** Check an already normalized database without rewriting the staged file or its hash. */
export async function validateBackupDatabase(
  file: File,
  version: BackupDatabaseVersion,
): Promise<void> {
  await validateBackupVersion(version);
  await withBackupDatabase(file, async (db) => {
    await db.execAsync('PRAGMA query_only = ON');
    await validateMigrationJournal(db, version);
    await validateDatabaseContents(db);
  });
}

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const identifierKey = (name: string) => name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

/** Import data only. The destination's migrations own every table, index and constraint. */
async function copyBackupRows(db: SQLiteDatabase, source: File): Promise<void> {
  await db.runAsync(
    'ATTACH DATABASE ? AS backup_source',
    decodeURIComponent(new URL(source.uri).pathname),
  );
  try {
    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM main.sqlite_master WHERE type = 'table'
       AND name NOT GLOB 'sqlite_*' AND name != '__drizzle_migrations' ORDER BY name`,
    );
    const sourceTables = await db.getAllAsync<{ name: string; type: string }>(
      'PRAGMA backup_source.table_list',
    );
    await db.execAsync('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
    try {
      for (const { name } of tables) {
        if (
          !sourceTables.some(
            (table) => table.type === 'table' && identifierKey(table.name) === name,
          )
        )
          throw new BackupError('invalid', `Missing backup table: ${name}.`);
        const columns = await db.getAllAsync<{
          name: string;
          notnull: number;
          dflt_value: string | null;
        }>(`PRAGMA main.table_info(${quoteIdentifier(name)})`);
        const sourceColumns = new Set(
          (
            await db.getAllAsync<{ name: string }>(
              `PRAGMA backup_source.table_info(${quoteIdentifier(name)})`,
            )
          ).map((column) => identifierKey(column.name)),
        );
        if (
          columns.some(
            (column) =>
              !sourceColumns.has(column.name) && column.notnull && column.dflt_value === null,
          )
        )
          throw new BackupError('invalid', `Missing required backup column in ${name}.`);
        const copiedColumns = columns
          .filter(
            (column) =>
              sourceColumns.has(column.name) &&
              !(name === 'agent_session_message' && column.name === 'fts_rowid'),
          )
          .map((column) => quoteIdentifier(column.name))
          .join(', ');
        await db.execAsync(
          `INSERT INTO main.${quoteIdentifier(name)} (${copiedColumns}) SELECT ${copiedColumns} FROM backup_source.${quoteIdentifier(name)}`,
        );
      }
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      if (/constraint failed|datatype mismatch/i.test(String(error)))
        throw new BackupError(
          'invalid',
          'Backup records violate the standard database constraints.',
        );
      throw error;
    }
  } finally {
    await db.execAsync('DETACH DATABASE backup_source');
  }
}

/** Rebuild only the captured/extracted copy; never run source DDL or mutate the live database. */
export async function normalizeBackupDatabase(
  file: File,
  version: BackupDatabaseVersion,
): Promise<void> {
  await validateBackupVersion(version);
  // Keep interrupted normalization inside the operation's existing cleanup boundary.
  const directory = new Directory(file.parentDirectory, `backup-normalize-${randomUUID()}`);
  directory.create();
  try {
    await withBackupDatabase(file, async (source) => {
      await validateMigrationJournal(source, version);
      await withBackupDatabase(new File(directory, 'cherry.db'), async (db) => {
        await applyMigrations(db, version.migrations.length);
        await copyBackupRows(db, file);
        // Search row IDs and FTS tables are derived state, not portable records.
        await db.execAsync('UPDATE agent_session_message SET fts_rowid = rowid');
        for (const sql of customSqlStatements) await db.execAsync(sql);
        await db.execAsync(
          "INSERT INTO agent_session_message_fts(agent_session_message_fts) VALUES ('rebuild')",
        );
        await validateDatabaseContents(db);
        await backupDatabaseAsync({ sourceDatabase: db, destDatabase: source });
      });
      await sealDatabase(source);
    });
    assertNoSidecars(file);
  } finally {
    if (directory.exists) directory.delete();
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
    for (const sql of customSqlStatements) await db.execAsync(sql);
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
    await db.runAsync(
      'UPDATE agent_session SET workspace_folder_id = NULL WHERE workspace_folder_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM file_folder WHERE id = agent_session.workspace_folder_id)',
    );
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
    await validateFileLibraryDatabase(db);
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
