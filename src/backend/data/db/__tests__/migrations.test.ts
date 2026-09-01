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
      // The baseline was re-squashed once, deliberately, while the table set was
      // still shrinking. From here it is frozen: every schema change is a new
      // appended migration, because re-squashing replays CREATE TABLE against a
      // database that already has those tables (drizzle applies any entry whose
      // folderMillis exceeds the last one an install recorded).
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
        'agent',
        'agent_session',
        'agent_session_message',
        'agent_tool_binding',
        'ai_usage_record',
        'app_state',
        'file_entry',
        'job',
        'mcp_server',
        'painting',
        'preference',
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
        'disabled_tools',
        'headers',
      ]);
      expect(columnNames(database, 'preference')).toEqual([
        'key',
        'value',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'file_entry')).toEqual([
        'id',
        'filename',
        'media_type',
        'size',
        'created_at',
        'updated_at',
        'deleted_at',
        'provenance',
      ]);
      expect(columnNames(database, 'painting')).toEqual([
        'id',
        'provider_id',
        'model_id',
        'prompt',
        'order_key',
        'created_at',
        'updated_at',
        'files',
      ]);
      expect(columnNames(database, 'user_model')).not.toContain('owned_by');

      // Agent persistence (docs/references/agent/agent-persistence.md): four
      // tables, no turn or pending-approval table, no workspace or runtime id.
      expect(columnNames(database, 'agent')).toEqual([
        'id',
        'name',
        'instructions',
        'avatar',
        'model_id',
        'order_key',
        'created_at',
        'updated_at',
        'deleted_at',
        'tool_approval_mode',
        'disabled_capabilities',
      ]);
      expect(columnNames(database, 'agent_session')).toEqual([
        'id',
        'agent_id',
        'title',
        'title_is_manual',
        'execution_target',
        'last_activity_at',
        'created_at',
        'updated_at',
        'forked_from_session_id',
      ]);
      expect(columnNames(database, 'agent_session_message')).toEqual([
        'id',
        'session_id',
        'turn_id',
        'role',
        'data',
        'status',
        'usage',
        'error',
        'model_id',
        'message_snapshot',
        'searchable_text',
        'fts_rowid',
        'created_at',
        'updated_at',
        'context_checkpoint',
      ]);
      expect(columnNames(database, 'agent_tool_binding')).toEqual([
        'id',
        'agent_id',
        'source',
        'capability_id',
        'mcp_server_id',
        'raw_tool_name',
        'enabled',
        'approval',
        'display_name_snapshot',
        'created_at',
        'updated_at',
      ]);

      expect(indexNames(database, 'mcp_server')).toEqual(['mcp_server_is_enabled_idx']);
      expect(indexNames(database, 'user_model')).toEqual(
        expect.arrayContaining([
          'user_model_preset_idx',
          'user_model_provider_enabled_idx',
          'user_model_provider_id_order_key_idx',
          'user_model_provider_model_unique',
        ]),
      );
      expect(indexNames(database, 'file_entry')).toEqual(['fe_created_at_idx']);
      expect(indexNames(database, 'painting')).toContain('painting_order_key_idx');
      expect(indexNames(database, 'agent_tool_binding')).toEqual(
        expect.arrayContaining([
          'agent_tool_binding_agent_id_idx',
          'agent_tool_binding_builtin_uniq',
          'agent_tool_binding_mcp_server_default_uniq',
          'agent_tool_binding_mcp_server_id_idx',
          'agent_tool_binding_mcp_tool_uniq',
        ]),
      );

      const fileEntryTableSql = getSchemaSql(database, 'table', 'file_entry');
      // Every entry is a Cherry-owned immutable blob, so the desktop origin /
      // external-path / cleanup-policy / content-hash invariants have nothing
      // left to constrain.
      expect(fileEntryTableSql).not.toContain('CHECK');
      for (const retiredTable of ['assistant', 'assistant_mcp_server', 'message', 'topic']) {
        expect(
          database
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
            .get(retiredTable),
        ).toBeUndefined();
      }
      for (const retiredTrigger of ['message_ai', 'message_ad', 'message_au']) {
        expect(
          database
            .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?")
            .get(retiredTrigger),
        ).toBeUndefined();
      }
      expect(
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'message_fts'")
          .get(),
      ).toBeUndefined();
      // No association table remains: a painting owns its file ids in `files`,
      // so deleting a file cannot rewrite the receipt that points at it.
      expect(getForeignKeys(database, 'painting')).toEqual([]);

      // Agent delete semantics: agents soft-delete first (RESTRICT guards hard
      // cleanup); sessions hard-delete and cascade their messages. Fork lineage
      // is SET NULL, so deleting a source drops the claim, not the fork.
      expect(getForeignKeys(database, 'agent_session')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'agent_id', on_delete: 'RESTRICT', table: 'agent' }),
          expect.objectContaining({
            from: 'forked_from_session_id',
            on_delete: 'SET NULL',
            table: 'agent_session',
          }),
        ]),
      );
      expect(getForeignKeys(database, 'agent_session')).toHaveLength(2);
      expect(getForeignKeys(database, 'agent_session_message')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: 'session_id',
            on_delete: 'CASCADE',
            table: 'agent_session',
          }),
          expect.objectContaining({ from: 'model_id', on_delete: 'SET NULL', table: 'user_model' }),
        ]),
      );
      expect(getForeignKeys(database, 'agent_tool_binding')).toEqual([
        expect.objectContaining({ from: 'agent_id', on_delete: 'CASCADE', table: 'agent' }),
      ]);
      const agentToolBindingTableSql = getSchemaSql(database, 'table', 'agent_tool_binding');
      expect(agentToolBindingTableSql).toContain('agent_tool_binding_identity_check');
      expect(agentToolBindingTableSql).toContain('agent_tool_binding_approval_check');
      // Invariant 1 (agent-protocol.md) is a database constraint: at most one
      // unsettled assistant message per session.
      expect(indexList(database, 'agent_session_message')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'agent_session_message_active_turn_uniq', unique: 1 }),
        ]),
      );
      expect(getSchemaSql(database, 'index', 'agent_session_message_active_turn_uniq')).toContain(
        "'pending', 'streaming'",
      );

      database.exec(`
        INSERT INTO agent (id, name, order_key, created_at, updated_at)
        VALUES ('agent-1', 'Agent', 'a0', 1, 1);
        INSERT INTO agent_tool_binding (
          id, agent_id, source, capability_id, enabled, approval, created_at, updated_at
        ) VALUES ('binding-builtin', 'agent-1', 'builtin', 'calendar.read', 1, 'auto', 1, 1);
        INSERT INTO agent_tool_binding (
          id, agent_id, source, mcp_server_id, enabled, approval, created_at, updated_at
        ) VALUES ('binding-default', 'agent-1', 'mcp', 'server-1', 1, 'ask', 1, 1);
        INSERT INTO agent_tool_binding (
          id, agent_id, source, mcp_server_id, raw_tool_name, enabled, approval, created_at, updated_at
        ) VALUES ('binding-tool', 'agent-1', 'mcp', 'server-1', 'write', 0, 'deny', 1, 1);
        INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at)
        VALUES ('session-1', 'agent-1', 1, 1, 1);
        INSERT INTO agent_session_message (id, session_id, turn_id, role, data, status, created_at, updated_at)
        VALUES ('m-user', 'session-1', 'turn-1', 'user', '{"version":1,"parts":[]}', 'success', 1, 1);
        INSERT INTO agent_session_message (id, session_id, turn_id, role, data, status, created_at, updated_at)
        VALUES ('m-assistant', 'session-1', 'turn-1', 'assistant', '{"version":1,"parts":[]}', 'pending', 1, 1);
      `);
      expect(
        database.prepare("SELECT tool_approval_mode FROM agent WHERE id = 'agent-1'").get(),
      ).toEqual({ tool_approval_mode: 'default' });
      expect(() =>
        database.exec(`
          INSERT INTO agent_tool_binding (
            id, agent_id, source, mcp_server_id, enabled, approval, created_at, updated_at
          ) VALUES ('binding-default-duplicate', 'agent-1', 'mcp', 'server-1', 1, 'ask', 1, 1);
        `),
      ).toThrow(/UNIQUE/);
      expect(() =>
        database.exec(`
          INSERT INTO agent_tool_binding (
            id, agent_id, source, capability_id, mcp_server_id, enabled, approval, created_at, updated_at
          ) VALUES ('binding-mixed', 'agent-1', 'builtin', 'calendar.write', 'server-1', 1, 'ask', 1, 1);
        `),
      ).toThrow(/agent_tool_binding_identity_check/);
      expect(() =>
        database.exec(`
          INSERT INTO agent_tool_binding (
            id, agent_id, source, capability_id, enabled, approval, created_at, updated_at
          ) VALUES ('binding-unsafe', 'agent-1', 'builtin', 'calendar.write', 1, 'always', 1, 1);
        `),
      ).toThrow(/agent_tool_binding_approval_check/);
      // A second unsettled assistant row in the same session is the reservation
      // race the partial unique index exists to reject.
      expect(() =>
        database.exec(`
          INSERT INTO agent_session_message (id, session_id, turn_id, role, data, status, created_at, updated_at)
          VALUES ('m-second', 'session-1', 'turn-2', 'assistant', '{"version":1,"parts":[]}', 'pending', 2, 2);
        `),
      ).toThrow(/UNIQUE/);
      // Settling the first frees the slot for the next reservation.
      database.exec(`
        UPDATE agent_session_message SET status = 'success' WHERE id = 'm-assistant';
        INSERT INTO agent_session_message (id, session_id, turn_id, role, data, status, created_at, updated_at)
        VALUES ('m-second', 'session-1', 'turn-2', 'assistant', '{"version":1,"parts":[]}', 'streaming', 2, 2);
      `);
      expect(() =>
        database.exec(
          "INSERT INTO agent_session_message (id, session_id, role, data, status, created_at, updated_at) VALUES ('m-bad', 'session-1', 'root', '{}', 'success', 3, 3)",
        ),
      ).toThrow(/agent_session_message_role_check/);
      expect(() =>
        database.exec(
          "INSERT INTO agent_session_message (id, session_id, role, data, status, created_at, updated_at) VALUES ('m-bad', 'session-1', 'assistant', '{}', 'paused', 3, 3)",
        ),
      ).toThrow(/agent_session_message_status_check/);
      // A fork points back at its source. Deleting the source must clear the
      // lineage claim and leave the fork itself intact — CASCADE here would
      // delete conversations the user never asked to lose.
      database.exec(`
        INSERT INTO agent_session (
          id, agent_id, last_activity_at, created_at, updated_at, forked_from_session_id
        ) VALUES ('session-fork', 'agent-1', 2, 2, 2, 'session-1');
      `);
      expect(() =>
        database.exec(`
          INSERT INTO agent_session (
            id, agent_id, last_activity_at, created_at, updated_at, forked_from_session_id
          ) VALUES ('session-dangling', 'agent-1', 2, 2, 2, 'missing-session');
        `),
      ).toThrow(/FOREIGN KEY/);

      // RESTRICT: an agent with sessions refuses hard deletion...
      expect(() => database.exec("DELETE FROM agent WHERE id = 'agent-1'")).toThrow();
      // ...while deleting the session cascades its messages.
      database.exec("DELETE FROM agent_session WHERE id = 'session-1'");
      expect(
        database
          .prepare("SELECT forked_from_session_id FROM agent_session WHERE id = 'session-fork'")
          .get(),
      ).toEqual({ forked_from_session_id: null });
      database.exec("DELETE FROM agent_session WHERE id = 'session-fork'");
      expect(database.prepare('SELECT count(*) AS count FROM agent_session_message').get()).toEqual(
        { count: 0 },
      );
      database.exec("DELETE FROM agent WHERE id = 'agent-1'");
      expect(database.prepare('SELECT count(*) AS count FROM agent_tool_binding').get()).toEqual({
        count: 0,
      });

      database.exec(`
        INSERT INTO painting (id, provider_id, model_id, prompt, order_key, created_at, updated_at)
        VALUES ('painting-1', 'provider', 'provider::model', 'prompt', 'a0', 1, 1);
        INSERT INTO file_entry (id, filename, media_type, size, created_at, updated_at, deleted_at)
        VALUES ('file-1', 'input.png', 'image/png', 4, 1, 1, NULL);
      `);
      // The receipt keeps its own file list, and deleting the file leaves that
      // list untouched — the surface renders a placeholder instead.
      expect(database.prepare(`SELECT files FROM painting WHERE id = 'painting-1'`).get()).toEqual({
        files: '{"input":[],"output":[]}',
      });
      database.exec(`
        UPDATE painting SET files = '{"input":["file-1"],"output":[]}' WHERE id = 'painting-1';
        DELETE FROM file_entry WHERE id = 'file-1';
      `);
      expect(database.prepare(`SELECT files FROM painting WHERE id = 'painting-1'`).get()).toEqual({
        files: '{"input":["file-1"],"output":[]}',
      });
      database.exec("DELETE FROM painting WHERE id = 'painting-1'");

      expect(() =>
        database.exec(`
          INSERT INTO file_entry (id, filename, media_type, size, created_at, updated_at)
          VALUES ('missing-size', 'bad.txt', 'text/plain', NULL, 1, 1);
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

  test('backfills the tool rules of servers stored before the column existed', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      const entries = readMigrationEntries();
      for (const { sql } of entries.slice(0, 1)) {
        applyMigrationSql(database, sql);
      }
      database.exec(`
        INSERT INTO mcp_server (id, name, endpoint_url, is_enabled, created_at, updated_at)
        VALUES ('legacy', 'Legacy', 'https://example.com/mcp', 1, 1, 1);
      `);

      applyMigrationsAsDrizzleWould(database, entries.slice(1));

      // McpServerService hands this column to the JSON codec unguarded, so a
      // NULL left behind here would throw on the first read of an upgraded row.
      expect(
        database.prepare("SELECT disabled_tools FROM mcp_server WHERE id = 'legacy'").get(),
      ).toEqual({ disabled_tools: '[]' });
    } finally {
      database.close();
    }
  });

  test('labels only provable origins and leaves the rest unknown', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      const entries = readMigrationEntries();
      const provenanceMigrationIndex = entries.findIndex(
        ({ tag }) => tag === '0011_file-provenance',
      );
      expect(provenanceMigrationIndex).toBeGreaterThan(0);

      for (const { sql } of entries.slice(0, provenanceMigrationIndex)) {
        applyMigrationSql(database, sql);
      }
      database.exec(`
        INSERT INTO agent (id, name, order_key, created_at, updated_at)
        VALUES ('agent-1', 'Agent', 'a0', 1, 1);
        INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at)
        VALUES ('session-1', 'agent-1', 1, 1, 1);
        INSERT INTO file_entry (id, filename, media_type, size, created_at, updated_at)
        VALUES
          ('orphan-file', 'brief.pdf', 'application/pdf', 1, 1, 1),
          ('message-artifact', 'report.md', 'text/markdown', 1, 1, 1),
          ('tool-artifact', 'legacy.txt', 'text/plain', 1, 1, 1),
          ('painting-output', 'painting.png', 'image/png', 1, 1, 1),
          ('painting-input', 'source.png', 'image/png', 1, 1, 1),
          ('attachment', 'notes.txt', 'text/plain', 1, 1, 1),
          ('reattached-artifact', 'chart.png', 'image/png', 1, 1, 1);
        INSERT INTO agent_session_message (
          id, session_id, role, data, status, created_at, updated_at
        ) VALUES (
          'message-1',
          'session-1',
          'assistant',
          '{"version":1,"parts":[{"id":"artifact-1","type":"file","fileEntryId":"message-artifact","mediaType":"text/markdown","name":"report.md","purpose":"artifact"},{"id":"artifact-2","type":"file","fileEntryId":"reattached-artifact","mediaType":"image/png","name":"chart.png","purpose":"artifact"},{"id":"tool-1","type":"tool","toolCallId":"call-1","toolRef":{"source":"builtin","capabilityId":"write_file"},"providerName":"write_file","displayName":"Write file","state":"output-available","output":{"value":{"status":"created","fileEntryId":"tool-artifact"},"artifacts":[]}}]}',
          'success',
          1,
          1
        ), (
          'message-2',
          'session-1',
          'user',
          '{"version":1,"parts":[{"id":"input-0","type":"file","fileEntryId":"attachment","mediaType":"text/plain","name":"notes.txt","purpose":"input-attachment"},{"id":"input-1","type":"file","fileEntryId":"reattached-artifact","mediaType":"image/png","name":"chart.png","purpose":"input-attachment"}]}',
          'success',
          1,
          1
        );
        INSERT INTO painting (
          id, provider_id, prompt, order_key, created_at, updated_at, files
        ) VALUES (
          'painting-1',
          'provider-1',
          'prompt',
          'a0',
          1,
          1,
          '{"input":["painting-input"],"output":["painting-output"]}'
        );
      `);

      applyMigrationSql(database, entries[provenanceMigrationIndex]?.sql ?? '');

      expect(database.prepare('SELECT id, provenance FROM file_entry ORDER BY id').all()).toEqual([
        { id: 'attachment', provenance: 'imported' },
        { id: 'message-artifact', provenance: 'generated' },
        // No owner proves anything about it, and inventing an origin would be worse.
        { id: 'orphan-file', provenance: 'unknown' },
        { id: 'painting-input', provenance: 'imported' },
        { id: 'painting-output', provenance: 'generated' },
        // Sent back as an attachment later, but it was still generated here.
        { id: 'reattached-artifact', provenance: 'generated' },
        { id: 'tool-artifact', provenance: 'generated' },
      ]);
    } finally {
      database.close();
    }
  });

  test('leaves Sessions written before fork lineage existed readable and unforked', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      const entries = readMigrationEntries();
      const lineageMigrationIndex = entries.findIndex(
        ({ tag }) => tag === '0013_agent-session-fork-lineage',
      );
      expect(lineageMigrationIndex).toBeGreaterThan(0);

      for (const { sql } of entries.slice(0, lineageMigrationIndex)) {
        applyMigrationSql(database, sql);
      }
      database.exec(`
        INSERT INTO agent (id, name, order_key, created_at, updated_at)
        VALUES ('agent-1', 'Agent', 'a0', 1, 1);
        INSERT INTO agent_session (id, agent_id, title, last_activity_at, created_at, updated_at)
        VALUES ('legacy-session', 'agent-1', 'Arithmetic drills', 1, 1, 1);
        INSERT INTO agent_session_message (
          id, session_id, role, data, status, created_at, updated_at
        ) VALUES ('legacy-message', 'legacy-session', 'user', '{"version":1,"parts":[]}', 'success', 1, 1);
      `);

      applyMigrationsAsDrizzleWould(database, entries.slice(lineageMigrationIndex));

      // ADD COLUMN backfills NULL, which is exactly "this Session is not a
      // fork" — the view schema reads the column unguarded, so a value here
      // that is neither NULL nor an existing id would fail on the first read.
      expect(
        database
          .prepare(
            "SELECT title, forked_from_session_id FROM agent_session WHERE id = 'legacy-session'",
          )
          .get(),
      ).toEqual({ forked_from_session_id: null, title: 'Arithmetic drills' });
      expect(database.prepare('SELECT count(*) AS count FROM agent_session_message').get()).toEqual(
        { count: 1 },
      );

      // And an upgraded install can still be forked from.
      database.exec(`
        INSERT INTO agent_session (
          id, agent_id, last_activity_at, created_at, updated_at, forked_from_session_id
        ) VALUES ('fork-session', 'agent-1', 2, 2, 2, 'legacy-session');
      `);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
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
