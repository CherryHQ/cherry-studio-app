import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { BackupError } from '@/shared/contracts/backup';
import { getActiveProfile, isSameEnterpriseIdentity } from '@/shared/data/activeProfile';
import {
  DEVICE_LOCAL_PREFERENCE_KEYS,
  ENTERPRISE_DEFAULT_MODEL_KEYS,
} from '@/shared/data/preference/preferenceSchema';

import { EnterpriseIdentitySchema } from '../profile';
import { customSqlStatements } from './customSql';
import { validateFileLibraryDatabase } from './fileLibraryValidation';
import { migrations } from './migrations';
import { BACKUP_PROFILE_KEY, ENTERPRISE_SYNC_STATE_KEY } from './schemas/appState';

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

/** A sealed snapshot of any SQLite database; its source stays open. */
export async function captureDatabase(source: SQLiteDatabase, target: File): Promise<void> {
  await withBackupDatabase(target, async (destination) => {
    await backupDatabaseAsync({ sourceDatabase: source, destDatabase: destination });
    await sealDatabase(destination);
  });
  assertNoSidecars(target);
}

/** The user database for a backup archive. */
export async function captureBackupDatabase(source: SQLiteDatabase, target: File): Promise<void> {
  await withBackupDatabase(target, async (destination) => {
    await backupDatabaseAsync({ sourceDatabase: source, destDatabase: destination });
    await prepareEnterpriseBackup(destination);
    await sealDatabase(destination);
  });
  assertNoSidecars(target);
}

/**
 * An enterprise copy records whose data it is, so only the same identity can restore it. It keeps
 * conversations and Agents, delivered ones included, but none of the organization's own content:
 * providers stay only as the model references Agents and messages hold, without keys; delivered
 * Agents lose their instructions; delivered MCP servers, Skills and default models are left out.
 * Without a sync state, a restore opens only after the first sync has delivered them again.
 */
export async function prepareEnterpriseBackup(db: SQLiteDatabase): Promise<void> {
  // Restore always removes the stamp, so a live database never carries one.
  const { identity } = getActiveProfile();
  if (!identity) return;
  const now = Date.now();
  await db.execAsync('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
  try {
    await db.runAsync("UPDATE user_provider SET api_keys = '[]'");
    await db.runAsync("UPDATE agent SET instructions = '' WHERE managed_remote_id IS NOT NULL");
    await db.runAsync(
      'DELETE FROM agent_tool_binding WHERE mcp_server_id IN (SELECT id FROM mcp_server WHERE managed_remote_id IS NOT NULL)',
    );
    await db.runAsync('DELETE FROM mcp_server WHERE managed_remote_id IS NOT NULL');
    await db.runAsync('DELETE FROM agent_global_skill WHERE managed_remote_id IS NOT NULL');
    await db.runAsync(
      `DELETE FROM preference WHERE scope = 'default' AND key IN (${ENTERPRISE_DEFAULT_MODEL_KEYS.map(() => '?').join(',')})`,
      ...ENTERPRISE_DEFAULT_MODEL_KEYS,
    );
    await db.runAsync('DELETE FROM app_state WHERE key = ?', ENTERPRISE_SYNC_STATE_KEY);
    await db.runAsync(
      'INSERT INTO app_state (key, value, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      BACKUP_PROFILE_KEY,
      JSON.stringify(identity),
      now,
      now,
    );
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
  // Free pages keep removed rows, including keys the live database replaced earlier.
  await db.execAsync('VACUUM');
}

async function readBackupProfile(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_state WHERE key = ?',
    BACKUP_PROFILE_KEY,
  );
  if (!row) return null;
  try {
    return EnterpriseIdentitySchema.parse(JSON.parse(row.value));
  } catch {
    throw new BackupError('invalid');
  }
}

/** A backup restores only into the data it came from: local data or the same enterprise identity. */
export async function assertBackupBelongsToActiveProfile(db: SQLiteDatabase): Promise<void> {
  const source = await readBackupProfile(db);
  const { identity } = getActiveProfile();
  if (source ? !(identity && isSameEnterpriseIdentity(source, identity)) : identity)
    throw new BackupError('other-account');
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
    await db.runAsync(
      'UPDATE agent_session SET workspace_folder_id = NULL WHERE workspace_folder_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM file_folder WHERE id = agent_session.workspace_folder_id)',
    );
    await db.runAsync('DELETE FROM desktop_connection');
    await db.runAsync('DELETE FROM app_state WHERE key = ?', BACKUP_PROFILE_KEY);
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
    const mcpGrants = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM mcp_server WHERE origin = 'remote' AND oauth IS NOT NULL",
    );
    for (const grant of mcpGrants) {
      // Preserve the OAuth/client configuration, but never reuse a source profile's grant.
      await db.runAsync(
        "UPDATE mcp_server SET oauth = json_set(oauth, '$.authorizationId', ?), is_active = 0, updated_at = ? WHERE id = ?",
        randomUUID(),
        now,
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
