import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type MigrationJournal = {
  entries: { idx: number; tag: string }[];
};

describe('bundled SQLite migrations', () => {
  test('adds durable replay and revision without rewriting existing transcript data', () => {
    const database = new DatabaseSync(':memory:');
    try {
      const files = readMigrationSqlFiles();
      for (const sql of files.slice(0, 4)) database.exec(sql);
      database.exec(`
        INSERT INTO agent (id, name, order_key, created_at, updated_at)
        VALUES ('agent', 'Agent', 'a0', 1, 1);
        INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at)
        VALUES ('session', 'agent', 1, 1, 1);
        INSERT INTO agent_session_message (id, session_id, role, data, status, created_at, updated_at)
        VALUES ('answer', 'session', 'assistant', '{"parts":[]}', 'success', 1, 1);
      `);
      for (const sql of files.slice(4)) database.exec(sql);
      expect(database.prepare('SELECT runtime_revision FROM agent_session').get()).toEqual({
        runtime_revision: 0,
      });
      expect(
        database.prepare('SELECT data, status, replay FROM agent_session_message').get(),
      ).toEqual({
        data: '{"parts":[]}',
        status: 'success',
        replay: null,
      });
    } finally {
      database.close();
    }
  });

  test('consolidates usage and changes only new Agent approval defaults with foreign keys enabled', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec('PRAGMA foreign_keys = ON');
      const files = readMigrationSqlFiles();
      const migrationIndex = readMigrationJournal().entries.findIndex(
        ({ tag }) => tag === '0003_align_agent_fields',
      );
      expect(migrationIndex).toBeGreaterThan(0);
      for (const sql of files.slice(0, migrationIndex)) applyMigrationSql(database, sql);
      database.exec(`
        INSERT INTO agent (id, name, order_key, created_at, updated_at)
        VALUES ('agent', 'Agent', 'a0', 1, 1);
        INSERT INTO agent_session (id, agent_id, name, last_activity_at, created_at, updated_at)
        VALUES ('session', 'agent', 'History', 1, 1, 1);
      `);
      const cancellation = JSON.stringify({
        code: 'CANCELLED',
        message: 'User stopped this turn',
        retryable: false,
      });
      const insert = database.prepare(`
        INSERT INTO agent_session_message
          (id, session_id, role, data, status, usage, stats, error, created_at, updated_at)
        VALUES (?, 'session', 'assistant', '{"parts":[]}', 'cancelled', ?, ?, ?, 1, 2)
      `);
      const usage = { inputTokens: 3, outputTokens: 2, totalTokens: 5 };
      insert.run('legacy', JSON.stringify(usage), null, cancellation);
      insert.run(
        'projected',
        JSON.stringify(usage),
        JSON.stringify({ inputTokens: 0, requestCount: 1, contextTokens: 42 }),
        null,
      );
      insert.run('zero', JSON.stringify({ inputTokens: 0 }), '{}', null);
      insert.run('no-usage', null, null, null);

      // Match the app's transaction: PRAGMA foreign_keys=OFF inside it would be a no-op.
      database.exec('BEGIN');
      for (const sql of files.slice(migrationIndex)) applyMigrationSql(database, sql);
      database.exec('COMMIT');

      const rows = database
        .prepare('SELECT id, stats, error FROM agent_session_message ORDER BY id')
        .all();
      expect(
        rows.map((row) => ({
          ...row,
          stats: row.stats === null ? null : JSON.parse(row.stats as string),
        })),
      ).toEqual([
        { id: 'legacy', stats: usage, error: cancellation },
        { id: 'no-usage', stats: null, error: null },
        {
          id: 'projected',
          stats: {
            inputTokens: 0,
            outputTokens: 2,
            totalTokens: 5,
            requestCount: 1,
            contextTokens: 42,
          },
          error: null,
        },
        { id: 'zero', stats: { inputTokens: 0 }, error: null },
      ]);
      expect(columnNames(database, 'agent_session_message')).not.toContain('usage');
      expect(columnNames(database, 'agent_session')).not.toContain('execution_target');
      expect(database.prepare('SELECT agent_id, name FROM agent_session').all()).toEqual([
        { agent_id: 'agent', name: 'History' },
      ]);
      expect(database.prepare('SELECT tool_approval_mode FROM agent').get()).toEqual({
        tool_approval_mode: 'default',
      });
      database.exec(
        `INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('new', 'New', 'a1', 1, 1)`,
      );
      expect(
        database.prepare("SELECT tool_approval_mode FROM agent WHERE id = 'new'").get(),
      ).toEqual({ tool_approval_mode: 'auto' });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(database.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    } finally {
      database.close();
    }
  });

  test('aligns Agent message fields while preserving history and opaque payloads', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec('PRAGMA foreign_keys = ON');
      const files = readMigrationSqlFiles();
      const alignmentIndex = readMigrationJournal().entries.findIndex(
        ({ tag }) => tag === '0003_align_agent_fields',
      );
      expect(alignmentIndex).toBeGreaterThan(0);
      for (const sql of files.slice(0, alignmentIndex)) applyMigrationSql(database, sql);
      database.exec(`
        INSERT INTO agent (id, name, order_key, created_at, updated_at)
        VALUES ('agent', 'Agent', 'a0', 1, 1);
        INSERT INTO agent_session (id, agent_id, name, is_name_manually_edited, last_activity_at, created_at, updated_at)
        VALUES ('session', 'agent', 'My conversation', 1, 1, 1, 1);
      `);
      const error = { code: 'INTERRUPTED', message: 'App restarted', retryable: true };
      const output = {
        value: { type: 'tool', providerName: 'nested', displayName: 'Keep', name: 'Keep too' },
        artifacts: [
          {
            ref: { kind: 'managed-file', fileEntryId: 'file' },
            mediaType: 'text/plain',
            name: 'result.txt',
            kind: 'created',
          },
        ],
      };
      const tool = {
        id: 'tool-part',
        type: 'tool',
        toolCallId: 'call',
        toolRef: { source: 'mcp', serverId: 'server', rawToolName: 'search' },
        providerName: 'mcp_search',
        displayName: 'Search',
        state: 'output-available',
        input: { name: 'query.txt' },
        output,
      };
      const parts = [
        { id: 'text', type: 'text', text: 'Keep the order', state: 'done' },
        tool,
        { ...tool, id: 'running', state: 'running', output: undefined },
        {
          ...tool,
          id: 'interrupted',
          state: 'interrupted',
          output: { value: { status: 'interrupted', reason: 'App restarted' }, artifacts: [] },
        },
        {
          id: 'file',
          type: 'file',
          fileEntryId: 'file',
          mediaType: 'text/plain',
          name: 'result.txt',
          purpose: 'artifact',
        },
        {
          id: 'unnamed-file',
          type: 'file',
          fileEntryId: 'file-2',
          mediaType: 'image/png',
          purpose: 'input-attachment',
        },
        { id: 'error', type: 'error', error },
      ];
      const inferenceSnapshot = JSON.stringify({ version: 99, model: { name: 'Historical' } });
      const contextCheckpoint = JSON.stringify({ version: 1, payload: { parts: [tool] } });
      const unversionedData = JSON.stringify({ parts: [parts[0]], extension: true });
      const unreadableData = [
        '{broken',
        JSON.stringify({ version: 1, parts: [null, 'not a part'] }),
      ];
      const insert = database.prepare(`
        INSERT INTO agent_session_message
          (id, session_id, role, data, status, message_snapshot, context_checkpoint, searchable_text, created_at, updated_at)
        VALUES (?, 'session', 'assistant', ?, 'cancelled', ?, ?, 'Keep the order', 1, 2)
      `);
      insert.run(
        'message',
        JSON.stringify({ version: 1, parts }),
        inferenceSnapshot,
        contextCheckpoint,
      );
      insert.run('empty', JSON.stringify({ version: 1, parts: [] }), null, null);
      insert.run('unversioned', unversionedData, inferenceSnapshot, contextCheckpoint);
      unreadableData.forEach((data, index) => insert.run(`unreadable-${index}`, data, null, null));

      for (const sql of files.slice(alignmentIndex)) applyMigrationSql(database, sql);

      const row = database
        .prepare("SELECT * FROM agent_session_message WHERE id = 'message'")
        .get()!;
      const data = JSON.parse(row.data as string);
      expect(data).toEqual({
        parts: [
          parts[0],
          ...parts.slice(1, 4).map((part) => {
            const { providerName, displayName, ...rest } = part as typeof tool;
            return { ...rest, type: 'dynamic-tool', toolName: providerName, title: displayName };
          }),
          {
            id: 'file',
            type: 'file',
            fileEntryId: 'file',
            mediaType: 'text/plain',
            filename: 'result.txt',
            purpose: 'artifact',
          },
          parts[5],
          { id: 'error', type: 'data-error', data: error },
        ],
      });
      expect(row).toMatchObject({
        status: 'cancelled',
        inference_snapshot: inferenceSnapshot,
        context_checkpoint: contextCheckpoint,
        searchable_text: 'Keep the order',
        created_at: 1,
        updated_at: 2,
      });
      expect(row).not.toHaveProperty('message_snapshot');
      expect(
        database
          .prepare("SELECT data, inference_snapshot FROM agent_session_message WHERE id = 'empty'")
          .get(),
      ).toEqual({ data: '{"parts":[]}', inference_snapshot: null });
      expect(
        database.prepare("SELECT data FROM agent_session_message WHERE id = 'unversioned'").get(),
      ).toEqual({
        data: unversionedData,
      });
      unreadableData.forEach((data, index) => {
        expect(
          database
            .prepare('SELECT data FROM agent_session_message WHERE id = ?')
            .get(`unreadable-${index}`),
        ).toEqual({ data });
      });
      expect(
        database.prepare('SELECT name, is_name_manually_edited FROM agent_session').get(),
      ).toEqual({
        name: 'My conversation',
        is_name_manually_edited: 1,
      });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  test('adds automatic routes without losing existing pairing or manual addresses', () => {
    const database = new DatabaseSync(':memory:');
    try {
      const files = readMigrationSqlFiles();
      for (const sql of files.slice(0, 2)) database.exec(sql);
      const addresses = JSON.stringify([{ host: 'company.example', port: 443, security: 'wss' }]);
      const grants = JSON.stringify([{ domain: 'agent', grantId: 'grant' }]);
      database
        .prepare(`INSERT INTO desktop_connection
        (id, name, device_id, desktop_identity, configured_endpoints, grants, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('desktop', 'Desktop', 'device', 'identity', addresses, grants, 1, 1);
      for (const sql of files.slice(2)) database.exec(sql);
      expect(
        database
          .prepare(
            'SELECT device_id, desktop_identity, configured_endpoints, learned_endpoints, grants FROM desktop_connection',
          )
          .get(),
      ).toEqual({
        device_id: 'device',
        desktop_identity: 'identity',
        configured_endpoints: addresses,
        learned_endpoints: '[]',
        grants,
      });
    } finally {
      database.close();
    }
  });

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
        VALUES ('message', 'session', 'user', '{"parts":[]}', 'success', 1, 1);
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
        tool_approval_mode: 'auto',
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
        'learned_endpoints',
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
        'disabled_capabilities',
        'order_key',
        'created_at',
        'updated_at',
        'deleted_at',
        'tool_approval_mode',
      ]);
      expect(columnNames(database, 'agent_session')).toEqual([
        'id',
        'agent_id',
        'name',
        'is_name_manually_edited',
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
        'stats',
        'error',
        'context_checkpoint',
        'model_id',
        'inference_snapshot',
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
      // Pending rows include queued inputs; native Pi work serializes execution.
      expect(indexList(database, 'agent_session_message')).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'agent_session_message_active_turn_uniq' }),
        ]),
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
        VALUES ('m-user', 'session-1', 'turn-1', 'user', '{"parts":[]}', 'success', 1, 1);
        INSERT INTO agent_session_message (id, session_id, turn_id, role, data, status, created_at, updated_at)
        VALUES ('m-assistant', 'session-1', 'turn-1', 'assistant', '{"parts":[]}', 'pending', 1, 1);
      `);
      expect(
        database.prepare("SELECT tool_approval_mode FROM agent WHERE id = 'agent-1'").get(),
      ).toEqual({ tool_approval_mode: 'auto' });
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
      // Queued inputs have their own durable pending rows; Pi owns execution serialization.
      database.exec(`
        INSERT INTO agent_session_message (id, session_id, turn_id, role, data, status, created_at, updated_at)
        VALUES ('m-second', 'session-1', 'turn-2', 'assistant', '{"parts":[]}', 'pending', 2, 2);
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
