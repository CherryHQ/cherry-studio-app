import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type MigrationJournal = {
  entries: { tag: string }[];
};

describe('bundled SQLite migrations', () => {
  test('registers every journal entry in the Expo runtime bundle', () => {
    const journal = readMigrationJournal();
    const bundleSource = readFileSync(`${process.cwd()}/src/backend/data/db/migrations.ts`, 'utf8');

    for (const [index, { tag }] of journal.entries.entries()) {
      const moduleName = `m${index.toString().padStart(4, '0')}`;
      expect(bundleSource).toContain(
        `import ${moduleName} from '../../../../migrations/sqlite-drizzle/${tag}.sql';`,
      );
      expect(bundleSource).toMatch(new RegExp(`\\n\\s{4}${moduleName},`));
    }
  });

  test('replays the journal into the schema the services are typed against', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      for (const migrationSql of readMigrationSqlFiles()) {
        applyMigrationSql(database, migrationSql);
      }

      // The persisted table set is the contract this file guards: mobile stores
      // what mobile reads, so a table appearing here without a service behind it
      // is the regression, not an omission.
      expect(
        (
          database
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .all() as { name: string }[]
        ).map((table) => table.name),
      ).toEqual([
        'ai_usage_record',
        'app_state',
        'assistant',
        'assistant_mcp_server',
        'chat_message_file_ref',
        'file_entry',
        'job',
        'mcp_server',
        'message',
        'painting',
        'painting_file_ref',
        'preference',
        'topic',
        'user_model',
        'user_provider',
      ]);

      expect(columnNames(database, 'mcp_server')).toEqual([
        'id',
        'name',
        'endpoint_url',
        'is_enabled',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'preference')).toEqual([
        'key',
        'value',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'file_entry')).toEqual([
        'id',
        'origin',
        'name',
        'ext',
        'size',
        'content_hash',
        'external_path',
        'cleanup_policy',
        'created_at',
        'updated_at',
        'deleted_at',
      ]);
      expect(columnNames(database, 'chat_message_file_ref')).toEqual([
        'id',
        'file_entry_id',
        'source_id',
        'role',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'painting')).toEqual([
        'id',
        'provider_id',
        'model_id',
        'prompt',
        'order_key',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'painting_file_ref')).toEqual([
        'id',
        'file_entry_id',
        'source_id',
        'role',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'topic')).toContain('trace_id');
      expect(columnNames(database, 'message')).not.toContain('trace_id');
      expect(columnNames(database, 'user_model')).not.toContain('owned_by');

      expect(indexNames(database, 'mcp_server')).toEqual(['mcp_server_is_enabled_idx']);
      expect(indexList(database, 'message')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'message_parent_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'message_topic_created_idx', unique: 0 }),
          expect.objectContaining({ name: 'message_status_idx', unique: 0 }),
          expect.objectContaining({ name: 'message_topic_root_uniq', unique: 1 }),
        ]),
      );
      expect(indexNames(database, 'topic')).toEqual(
        expect.arrayContaining([
          'topic_assistant_id_idx',
          'topic_order_key_idx',
          'topic_updated_at_idx',
        ]),
      );
      expect(indexNames(database, 'user_model')).toEqual(
        expect.arrayContaining([
          'user_model_preset_idx',
          'user_model_provider_enabled_idx',
          'user_model_provider_id_order_key_idx',
          'user_model_provider_model_unique',
        ]),
      );
      expect(indexNames(database, 'file_entry')).toEqual(
        expect.arrayContaining([
          'fe_created_at_idx',
          'fe_content_hash_idx',
          'fe_deleted_at_idx',
          'fe_external_path_idx',
          'fe_external_path_lower_unique_idx',
        ]),
      );
      expect(indexList(database, 'chat_message_file_ref')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'cmfr_entry_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'cmfr_source_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'cmfr_unique_idx', unique: 1 }),
        ]),
      );
      expect(indexNames(database, 'painting')).toContain('painting_order_key_idx');
      expect(indexList(database, 'painting_file_ref')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'pfr_entry_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'pfr_source_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'pfr_unique_idx', unique: 1 }),
        ]),
      );

      const fileEntryTableSql = getSchemaSql(database, 'table', 'file_entry');
      expect(getSchemaSql(database, 'table', 'message')).toContain('message_root_parent_check');
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_origin_check'));
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_origin_consistency'));
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_external_no_delete'));
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_cleanup_policy_check'));
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_contenthash_external_null'));
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_size_internal_only'));
      expect(getSchemaSql(database, 'table', 'chat_message_file_ref')).toContain('cmfr_role_check');
      expect(getSchemaSql(database, 'table', 'painting_file_ref')).toContain('pfr_role_check');
      expect(getSchemaSql(database, 'index', 'message_topic_root_uniq')).toContain(
        '"deleted_at" is null',
      );

      const assistantMcpServerFks = getForeignKeys(database, 'assistant_mcp_server');
      expect(assistantMcpServerFks).toContainEqual(
        expect.objectContaining({ from: 'assistant_id', on_delete: 'CASCADE', table: 'assistant' }),
      );
      expect(assistantMcpServerFks).toContainEqual(
        expect.objectContaining({
          from: 'mcp_server_id',
          on_delete: 'CASCADE',
          table: 'mcp_server',
        }),
      );
      expect(getForeignKeys(database, 'message')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'parent_id', on_delete: 'CASCADE', table: 'message' }),
          expect.objectContaining({ from: 'topic_id', on_delete: 'CASCADE', table: 'topic' }),
        ]),
      );
      expect(getForeignKeys(database, 'chat_message_file_ref')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: 'file_entry_id',
            on_delete: 'CASCADE',
            table: 'file_entry',
          }),
          expect.objectContaining({
            from: 'source_id',
            on_delete: 'CASCADE',
            table: 'message',
          }),
        ]),
      );
      expect(getForeignKeys(database, 'painting_file_ref')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: 'file_entry_id',
            on_delete: 'CASCADE',
            table: 'file_entry',
          }),
          expect.objectContaining({
            from: 'source_id',
            on_delete: 'CASCADE',
            table: 'painting',
          }),
        ]),
      );

      database.exec(`
        INSERT INTO assistant (id, name, emoji, settings, order_key, created_at, updated_at)
        VALUES ('assistant-mcp', 'Assistant', 'x', '{}', 'a0', 1, 1);
        INSERT INTO mcp_server (id, name, endpoint_url, is_enabled, created_at, updated_at)
        VALUES ('mcp-1', 'Server', 'https://example.com/mcp', 1, 1, 1);
        INSERT INTO assistant_mcp_server (assistant_id, mcp_server_id, created_at, updated_at)
        VALUES ('assistant-mcp', 'mcp-1', 1, 1);
      `);
      database.exec("DELETE FROM mcp_server WHERE id = 'mcp-1'");
      expect(database.prepare('SELECT count(*) AS count FROM assistant_mcp_server').get()).toEqual({
        count: 0,
      });
      database.exec("DELETE FROM assistant WHERE id = 'assistant-mcp'");

      database.exec(`
        INSERT INTO painting (id, provider_id, model_id, prompt, order_key, created_at, updated_at)
        VALUES ('painting-1', 'provider', 'provider::model', 'prompt', 'a0', 1, 1);
        INSERT INTO file_entry (id, origin, name, ext, size, external_path, created_at, updated_at, deleted_at)
        VALUES ('file-1', 'internal', 'input', 'png', 4, NULL, 1, 1, NULL);
        INSERT INTO painting_file_ref (id, file_entry_id, source_id, role, created_at, updated_at)
        VALUES ('ref-1', 'file-1', 'painting-1', 'input', 1, 1);
      `);
      expect(() =>
        database.exec(`
          INSERT INTO painting_file_ref (id, file_entry_id, source_id, role, created_at, updated_at)
          VALUES ('ref-duplicate', 'file-1', 'painting-1', 'input', 1, 1);
        `),
      ).toThrow();
      expect(() =>
        database.exec(`
          INSERT INTO painting_file_ref (id, file_entry_id, source_id, role, created_at, updated_at)
          VALUES ('ref-invalid', 'file-1', 'painting-1', 'preview', 1, 1);
        `),
      ).toThrow();
      database.exec("DELETE FROM painting WHERE id = 'painting-1'");
      expect(database.prepare('SELECT count(*) AS count FROM painting_file_ref').get()).toEqual({
        count: 0,
      });

      database.exec(`
        INSERT INTO painting (id, provider_id, model_id, prompt, order_key, created_at, updated_at)
        VALUES ('painting-2', 'provider', 'provider::model', 'prompt', 'a1', 2, 2);
        INSERT INTO file_entry (id, origin, name, ext, size, external_path, created_at, updated_at, deleted_at)
        VALUES ('file-2', 'internal', 'output', 'png', 4, NULL, 2, 2, NULL);
        INSERT INTO painting_file_ref (id, file_entry_id, source_id, role, created_at, updated_at)
        VALUES ('ref-2', 'file-2', 'painting-2', 'output', 2, 2);
        DELETE FROM file_entry WHERE id = 'file-2';
      `);
      expect(database.prepare('SELECT count(*) AS count FROM painting_file_ref').get()).toEqual({
        count: 0,
      });

      expect(() =>
        database.exec(`
          INSERT INTO file_entry
            (id, origin, name, ext, size, external_path, cleanup_policy, created_at, updated_at)
          VALUES ('bad-policy', 'internal', 'bad', 'txt', 1, NULL, 'automatic', 1, 1);
        `),
      ).toThrow();
      expect(() =>
        database.exec(`
          INSERT INTO file_entry
            (id, origin, name, ext, size, content_hash, external_path, created_at, updated_at)
          VALUES ('external-hash', 'external', 'bad', 'txt', NULL, 'sha256:abcd', '/tmp/bad', 1, 1);
        `),
      ).toThrow();
    } finally {
      database.close();
    }
  });

  test('foreign_keys pragma inside a transaction is ignored', () => {
    // Standing constraint on every migration added after the baseline: drizzle
    // replays them inside one transaction, and SQLite silently ignores this
    // pragma mid-transaction, so a table rebuild cannot turn foreign keys off
    // the way the twelve-step rebuild recipe assumes.
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      database.exec('BEGIN');
      database.exec('PRAGMA foreign_keys = OFF');

      expect(database.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });

      database.exec('COMMIT');
    } finally {
      database.close();
    }
  });

  test.each(readMigrationEntries().map((entry, index) => [index, entry.tag]))(
    'upgrading from %i (%s) commits in one transaction with foreign keys intact',
    (resumeIndex) => {
      // Every install resumes from wherever it last stopped, and drizzle replays
      // the whole tail inside one transaction with foreign keys on. Looping over
      // resume points means the next table-rebuild migration is checked here by
      // construction, instead of only if someone remembers to add a case.
      const database = new DatabaseSync(':memory:');

      try {
        database.exec('PRAGMA foreign_keys = ON');
        const entries = readMigrationEntries();
        for (const { sql } of entries.slice(0, resumeIndex)) {
          applyMigrationSql(database, sql);
        }

        expect(() => {
          applyMigrationsAsDrizzleWould(database, entries.slice(resumeIndex));
        }).not.toThrow();
        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      } finally {
        database.close();
      }
    },
  );
});

/**
 * Mirrors drizzle's migrator, which wraps every pending migration in one
 * transaction (`SQLiteSyncDialect.migrate`). Replaying statements bare instead
 * lets a migration's `PRAGMA foreign_keys=OFF` take effect, which hides exactly
 * the constraint violations an upgrade would hit on device.
 */
function applyMigrationsAsDrizzleWould(database: DatabaseSync, entries: { sql: string }[]): void {
  database.exec('BEGIN');
  try {
    for (const { sql } of entries) {
      applyMigrationSql(database, sql);
    }
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Some errors roll back automatically, and then ROLLBACK itself throws
      // "no transaction is active" — which would replace the migration failure
      // this test exists to report.
    }
    throw error;
  }
}

function applyMigrationSql(database: DatabaseSync, migrationSql: string) {
  for (const statement of migrationSql.split('--> statement-breakpoint')) {
    if (statement.trim()) {
      database.exec(statement);
    }
  }
}

function columnNames(database: DatabaseSync, table: string): string[] {
  return (database.prepare(`PRAGMA table_info('${table}')`).all() as { name: string }[]).map(
    (column) => column.name,
  );
}

function indexList(database: DatabaseSync, table: string) {
  return database.prepare(`PRAGMA index_list('${table}')`).all() as {
    name: string;
    unique: number;
  }[];
}

/** Declared indexes only — SQLite's implicit `sqlite_autoindex_*` are not schema. */
function indexNames(database: DatabaseSync, table: string): string[] {
  return indexList(database, table)
    .map((index) => index.name)
    .filter((name) => !name.startsWith('sqlite_'));
}

function getSchemaSql(database: DatabaseSync, type: 'index' | 'table', name: string): string {
  const row = database
    .prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?')
    .get(type, name) as { sql: string } | undefined;
  expect(row).toBeDefined();
  return row?.sql ?? '';
}

function getForeignKeys(database: DatabaseSync, table: string) {
  return database.prepare(`PRAGMA foreign_key_list('${table}')`).all() as {
    from: string;
    on_delete: string;
    table: string;
  }[];
}

function readMigrationSqlFiles(): string[] {
  return readMigrationEntries().map(({ sql }) => sql);
}

function readMigrationEntries(): { sql: string; tag: string }[] {
  const migrationDirectory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = readMigrationJournal();

  return journal.entries.map(({ tag }) => ({
    sql: readFileSync(`${migrationDirectory}/${tag}.sql`, 'utf8'),
    tag,
  }));
}

function readMigrationJournal(): MigrationJournal {
  const migrationDirectory = `${process.cwd()}/migrations/sqlite-drizzle`;
  return JSON.parse(
    readFileSync(`${migrationDirectory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;
}
