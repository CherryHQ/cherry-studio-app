import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type MigrationJournal = {
  entries: { idx: number; tag: string }[];
};

describe('bundled SQLite migrations', () => {
  test('allows open plugin identifiers and methods while enforcing grant references', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec('PRAGMA foreign_keys = ON');
      applyMigrations(database);
      database.exec(`
        INSERT INTO plugin_authorization (id, plugin_id, auth_method, account_label, credential, created_at, updated_at)
        VALUES ('feishu-grant', 'feishu', 'feishu_user', 'Cherry (ou_cherry)', '{}', 1, 1),
               ('future-grant', 'vendor.future-plugin', 'future_method_v2', 'Future account', '{}', 1, 1);
        INSERT INTO mcp_server (id, name, origin, builtin_id, authorization_id, created_at, updated_at)
        VALUES ('feishu-server', 'Feishu', 'builtin', 'feishu', 'feishu-grant', 1, 1),
               ('future-server', 'Future', 'builtin', 'vendor.future-plugin', 'future-grant', 1, 1);
      `);
      expect(() =>
        database.exec("DELETE FROM plugin_authorization WHERE id = 'feishu-grant'"),
      ).toThrow(/FOREIGN KEY/);
      expect(() =>
        database.exec(
          "UPDATE plugin_authorization SET auth_method = ' ' WHERE id = 'future-grant'",
        ),
      ).toThrow(/plugin_authorization_method_check/);
      expect(() =>
        database.exec("UPDATE plugin_authorization SET plugin_id = '' WHERE id = 'future-grant'"),
      ).toThrow(/plugin_authorization_id_check/);
      expect(() =>
        database.exec(
          "UPDATE mcp_server SET authorization_id = 'missing' WHERE id = 'future-server'",
        ),
      ).toThrow(/FOREIGN KEY/);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  test('initializes row defaults and keeps preferences isolated by scope', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec('PRAGMA foreign_keys = ON');
      applyMigrations(database);
      database.exec(`
        INSERT INTO user_provider (provider_id, name, order_key, created_at, updated_at)
        VALUES ('provider', 'Provider', 'a0', 1, 1);
        INSERT INTO user_model (id, provider_id, model_id, preset_model_id, order_key, created_at, updated_at)
        VALUES ('provider::model', 'provider', 'model', 'model', 'a0', 1, 1);
        INSERT INTO agent (id, name, order_key, created_at, updated_at)
        VALUES ('agent', 'Agent', 'a0', 1, 1);
        INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at)
        VALUES ('session', 'agent', 1, 1, 1);
        INSERT INTO agent_session_message (id, session_id, role, data, status, created_at, updated_at)
        VALUES ('message', 'session', 'user', '{"version":1,"parts":[]}', 'success', 1, 1);
        INSERT INTO mcp_server (id, name, base_url, created_at, updated_at)
        VALUES ('remote', 'Remote', 'https://example.com/mcp', 1, 1);
        INSERT INTO file_entry (id, filename, media_type, size, created_at, updated_at)
        VALUES ('file', 'file.txt', 'text/plain', 1, 1, 1);
        INSERT INTO job (id, type, status, queue, scheduled_at, input, created_at, updated_at)
        VALUES ('job', 'test', 'pending', 'test', 1, '{}', 1, 1);
        INSERT INTO ai_usage_record (
          id, request_id, record_kind, request_count, provider_id, model_id,
          source_type, source_id, modality, api_key_attribution, created_at
        ) VALUES ('usage', 'request', 'invocation', 1, 'provider', 'model',
          'mini-app', 'mini-app-1', 'language', 'unknown', 1);
        INSERT INTO preference (key, value, created_at, updated_at)
        VALUES ('ui.theme_mode', '"dark"', 1, 1);
        INSERT INTO preference (scope, key, value, created_at, updated_at)
        VALUES ('desktop', 'ui.theme_mode', '"light"', 1, 1);
      `);
      expect(database.prepare('SELECT input_modalities_explicit FROM user_model').get()).toEqual({
        input_modalities_explicit: 0,
      });
      expect(
        database.prepare('SELECT tool_approval_mode, disabled_capabilities FROM agent').get(),
      ).toEqual({
        tool_approval_mode: 'default',
        disabled_capabilities: '[]',
      });
      expect(
        database
          .prepare('SELECT forked_from_session_id, fork_boundary_message_id FROM agent_session')
          .get(),
      ).toEqual({
        forked_from_session_id: null,
        fork_boundary_message_id: null,
      });
      expect(
        database.prepare('SELECT stats, context_checkpoint FROM agent_session_message').get(),
      ).toEqual({
        stats: null,
        context_checkpoint: null,
      });
      expect(
        database.prepare('SELECT origin, is_active, disabled_tools FROM mcp_server').get(),
      ).toEqual({
        origin: 'remote',
        is_active: 0,
        disabled_tools: '[]',
      });
      expect(database.prepare('SELECT provenance FROM file_entry').get()).toEqual({
        provenance: 'unknown',
      });
      expect(database.prepare('SELECT cancel_requested_at FROM job').get()).toEqual({
        cancel_requested_at: null,
      });
      expect(database.prepare('SELECT scope, value FROM preference ORDER BY scope').all()).toEqual([
        { scope: 'default', value: '"dark"' },
        { scope: 'desktop', value: '"light"' },
      ]);
      expect(() =>
        database.exec(`INSERT INTO preference (key, value, created_at, updated_at)
          VALUES ('ui.theme_mode', '"system"', 2, 2)`),
      ).toThrow(/UNIQUE/);
    } finally {
      database.close();
    }
  });

  test('registers every journal entry in the Expo runtime bundle', () => {
    const journal = readMigrationJournal();
    const bundleSource = readFileSync(`${process.cwd()}/src/backend/data/db/migrations.ts`, 'utf8');

    for (const { idx, tag } of journal.entries) {
      const moduleName = `m${idx.toString().padStart(4, '0')}`;
      expect(bundleSource).toContain(
        `import ${moduleName} from '../../../../migrations/sqlite-drizzle/${tag}.sql';`,
      );
      expect(bundleSource).toMatch(new RegExp(`\\n\\s{4}${moduleName},`));
    }
  });

  test('initializes the current schema in one transaction with foreign keys enabled', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      applyMigrations(database);

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
        'desktop_connection',
        'file_entry',
        'job',
        'mcp_server',
        'painting',
        'plugin_authorization',
        'preference',
        'user_model',
        'user_provider',
      ]);

      expect(columnNames(database, 'mcp_server')).toEqual([
        'id',
        'name',
        'base_url',
        'origin',
        'builtin_id',
        'authorization_id',
        'headers',
        'is_active',
        'disabled_tools',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'plugin_authorization')).toEqual([
        'id',
        'plugin_id',
        'auth_method',
        'account_label',
        'credential',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'desktop_connection')).toEqual([
        'id',
        'name',
        'device_id',
        'desktop_identity',
        'configured_endpoints',
        'grants',
        'status',
        'last_fetched_at',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'preference')).toEqual([
        'scope',
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
      expect(
        database
          .prepare("PRAGMA index_info('agent_session_message_created_id_idx')")
          .all()
          .map((column) => column.name),
      ).toEqual(['created_at', 'id']);

      // Agent persistence (docs/references/agent/agent-persistence.md): four
      // tables, no turn or pending-approval table, no workspace or runtime id.
      expect(columnNames(database, 'agent')).toEqual([
        'id',
        'name',
        'instructions',
        'avatar',
        'model',
        'tool_approval_mode',
        'disabled_capabilities',
        'order_key',
        'created_at',
        'updated_at',
        'deleted_at',
      ]);
      expect(columnNames(database, 'agent_session')).toEqual([
        'id',
        'agent_id',
        'name',
        'is_name_manually_edited',
        'execution_target',
        'last_activity_at',
        'created_at',
        'updated_at',
        'forked_from_session_id',
        'fork_boundary_message_id',
      ]);
      expect(columnNames(database, 'agent_session_message')).toEqual([
        'id',
        'session_id',
        'turn_id',
        'role',
        'data',
        'status',
        'usage',
        'stats',
        'error',
        'context_checkpoint',
        'model_id',
        'message_snapshot',
        'searchable_text',
        'fts_rowid',
        'created_at',
        'updated_at',
      ]);
      expect(columnNames(database, 'agent_tool_binding')).toEqual([
        'id',
        'agent_id',
        'source',
        'mcp_server_id',
        'raw_tool_name',
        'enabled',
        'approval',
        'display_name_snapshot',
        'created_at',
        'updated_at',
      ]);

      expect(indexNames(database, 'mcp_server')).toEqual([
        'mcp_server_builtin_idx',
        'mcp_server_is_active_idx',
      ]);
      expect(columnNames(database, 'job')).toContain('cancel_requested_at');
      expect(columnNames(database, 'user_model')).toContain('input_modalities_explicit');
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
            id, agent_id, source, mcp_server_id, raw_tool_name, enabled, approval, created_at, updated_at
          ) VALUES ('binding-tool-duplicate', 'agent-1', 'mcp', 'server-1', 'write', 1, 'ask', 1, 1);
        `),
      ).toThrow(/UNIQUE/);
      expect(() =>
        database.exec(`
          INSERT INTO agent_tool_binding (
            id, agent_id, source, enabled, approval, created_at, updated_at
          ) VALUES ('binding-missing-server', 'agent-1', 'mcp', 1, 'ask', 1, 1);
        `),
      ).toThrow(/NOT NULL/);
      for (const [serverId, rawToolName] of [
        ['', null],
        ['server-2', ''],
      ] as const) {
        expect(() =>
          database
            .prepare(`
            INSERT INTO agent_tool_binding (
              id, agent_id, source, mcp_server_id, raw_tool_name, enabled, approval, created_at, updated_at
            ) VALUES ('binding-empty-identity', 'agent-1', 'mcp', ?, ?, 1, 'ask', 1, 1)
          `)
            .run(serverId, rawToolName),
        ).toThrow(/agent_tool_binding_identity_check/);
      }
      expect(() =>
        database.exec(`
          INSERT INTO agent_tool_binding (
            id, agent_id, source, mcp_server_id, enabled, approval, created_at, updated_at
          ) VALUES ('binding-builtin', 'agent-1', 'builtin', 'server-2', 1, 'ask', 1, 1);
        `),
      ).toThrow(/agent_tool_binding_identity_check/);
      expect(() =>
        database.exec(`
          INSERT INTO agent_tool_binding (
            id, agent_id, source, mcp_server_id, enabled, approval, created_at, updated_at
          ) VALUES ('binding-unsafe', 'agent-1', 'mcp', 'server-2', 1, 'always', 1, 1);
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
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(database.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    } finally {
      database.close();
    }
  });
});

// Drizzle runs all pending SQL in one transaction with foreign keys enabled.
function applyMigrations(database: DatabaseSync): void {
  database.exec('BEGIN');
  try {
    for (const sql of readMigrationSqlFiles()) {
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
  const migrationDirectory = `${process.cwd()}/migrations/sqlite-drizzle`;
  return readMigrationJournal().entries.map(({ tag }) =>
    readFileSync(`${migrationDirectory}/${tag}.sql`, 'utf8'),
  );
}

function readMigrationJournal(): MigrationJournal {
  const migrationDirectory = `${process.cwd()}/migrations/sqlite-drizzle`;
  return JSON.parse(
    readFileSync(`${migrationDirectory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;
}
