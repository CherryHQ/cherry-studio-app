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

  test('replays the full journal on top of the release baseline', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      const migrationSqlFiles = readMigrationSqlFiles();
      // 0000_release_baseline is frozen; every schema change after it must be a
      // new appended migration (never edit or re-squash shipped entries).
      expect(migrationSqlFiles.length).toBeGreaterThanOrEqual(1);

      for (const migrationSql of migrationSqlFiles) {
        for (const statement of migrationSql.split('--> statement-breakpoint')) {
          if (statement.trim()) {
            database.exec(statement);
          }
        }
      }

      const topicColumns = database.prepare("PRAGMA table_info('topic')").all() as {
        name: string;
      }[];
      const messageColumns = database.prepare("PRAGMA table_info('message')").all() as {
        name: string;
      }[];
      const fileEntryColumns = database.prepare("PRAGMA table_info('file_entry')").all() as {
        name: string;
      }[];
      const chatMessageFileRefColumns = database
        .prepare("PRAGMA table_info('chat_message_file_ref')")
        .all() as { name: string }[];
      const paintingColumns = database.prepare("PRAGMA table_info('painting')").all() as {
        name: string;
      }[];
      const paintingFileRefColumns = database
        .prepare("PRAGMA table_info('painting_file_ref')")
        .all() as { name: string }[];
      const modelColumns = database.prepare("PRAGMA table_info('user_model')").all() as {
        name: string;
      }[];
      const mcpServerColumns = database.prepare("PRAGMA table_info('mcp_server')").all() as {
        dflt_value: string | null;
        name: string;
        notnull: number;
        pk: number;
        type: string;
      }[];
      const mcpServerIndexes = database.prepare("PRAGMA index_list('mcp_server')").all() as {
        name: string;
      }[];
      const messageIndexes = database.prepare("PRAGMA index_list('message')").all() as {
        name: string;
        unique: number;
      }[];
      const topicIndexes = database.prepare("PRAGMA index_list('topic')").all() as {
        name: string;
      }[];
      const modelIndexes = database.prepare("PRAGMA index_list('user_model')").all() as {
        name: string;
      }[];
      const fileEntryIndexes = database.prepare("PRAGMA index_list('file_entry')").all() as {
        name: string;
      }[];
      const chatMessageFileRefIndexes = database
        .prepare("PRAGMA index_list('chat_message_file_ref')")
        .all() as { name: string; unique: number }[];
      const paintingIndexes = database.prepare("PRAGMA index_list('painting')").all() as {
        name: string;
      }[];
      const paintingFileRefIndexes = database
        .prepare("PRAGMA index_list('painting_file_ref')")
        .all() as { name: string; unique: number }[];
      const tables = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[];
      const messageTableSql = getSchemaSql(database, 'table', 'message');
      const fileEntryTableSql = getSchemaSql(database, 'table', 'file_entry');
      const chatMessageFileRefTableSql = getSchemaSql(database, 'table', 'chat_message_file_ref');
      const mcpServerTableSql = getSchemaSql(database, 'table', 'mcp_server');
      const paintingFileRefTableSql = getSchemaSql(database, 'table', 'painting_file_ref');
      const rootIndexSql = getSchemaSql(database, 'index', 'message_topic_root_uniq');
      const assistantKnowledgeBaseFks = getForeignKeys(database, 'assistant_knowledge_base');
      const assistantMcpServerFks = getForeignKeys(database, 'assistant_mcp_server');
      const messageFks = getForeignKeys(database, 'message');
      const chatMessageFileRefFks = getForeignKeys(database, 'chat_message_file_ref');
      const paintingFileRefFks = getForeignKeys(database, 'painting_file_ref');

      expect(topicColumns.map((column) => column.name)).toContain('trace_id');
      expect(messageColumns.map((column) => column.name)).not.toContain('trace_id');
      expect(modelColumns.map((column) => column.name)).not.toContain('owned_by');
      expect(fileEntryColumns.map((column) => column.name)).toEqual([
        'id',
        'origin',
        'name',
        'ext',
        'size',
        'external_path',
        'created_at',
        'updated_at',
        'deleted_at',
      ]);
      expect(chatMessageFileRefColumns.map((column) => column.name)).toEqual([
        'id',
        'file_entry_id',
        'source_id',
        'role',
        'created_at',
        'updated_at',
      ]);
      expect(paintingColumns.map((column) => column.name)).toEqual([
        'id',
        'provider_id',
        'model_id',
        'prompt',
        'order_key',
        'created_at',
        'updated_at',
      ]);
      expect(paintingFileRefColumns.map((column) => column.name)).toEqual([
        'id',
        'file_entry_id',
        'source_id',
        'role',
        'created_at',
        'updated_at',
      ]);
      expect(mcpServerColumns.map((column) => column.name)).toEqual([
        'id',
        'name',
        'type',
        'description',
        'base_url',
        'command',
        'registry_url',
        'args',
        'env',
        'headers',
        'provider',
        'provider_url',
        'logo_url',
        'tags',
        'long_running',
        'timeout',
        'dxt_version',
        'dxt_path',
        'reference',
        'search_key',
        'config_sample',
        'disabled_tools',
        'disabled_auto_approve_tools',
        'should_config',
        'sort_order',
        'is_active',
        'install_source',
        'is_trusted',
        'trusted_at',
        'installed_at',
        'created_at',
        'updated_at',
      ]);
      expect(
        Object.fromEntries(
          mcpServerColumns.map(({ dflt_value, name, notnull, pk, type }) => [
            name,
            { dflt_value, notnull, pk, type },
          ]),
        ),
      ).toEqual({
        args: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        base_url: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        command: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        config_sample: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        created_at: { dflt_value: null, notnull: 1, pk: 0, type: 'INTEGER' },
        description: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        disabled_auto_approve_tools: {
          dflt_value: null,
          notnull: 0,
          pk: 0,
          type: 'TEXT',
        },
        disabled_tools: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        dxt_path: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        dxt_version: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        env: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        headers: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        id: { dflt_value: null, notnull: 1, pk: 1, type: 'TEXT' },
        install_source: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        installed_at: { dflt_value: null, notnull: 0, pk: 0, type: 'INTEGER' },
        is_active: { dflt_value: 'false', notnull: 1, pk: 0, type: 'INTEGER' },
        is_trusted: { dflt_value: null, notnull: 0, pk: 0, type: 'INTEGER' },
        logo_url: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        long_running: { dflt_value: null, notnull: 0, pk: 0, type: 'INTEGER' },
        name: { dflt_value: null, notnull: 1, pk: 0, type: 'TEXT' },
        provider: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        provider_url: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        reference: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        registry_url: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        search_key: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        should_config: { dflt_value: null, notnull: 0, pk: 0, type: 'INTEGER' },
        sort_order: { dflt_value: '0', notnull: 0, pk: 0, type: 'INTEGER' },
        tags: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        timeout: { dflt_value: null, notnull: 0, pk: 0, type: 'INTEGER' },
        trusted_at: { dflt_value: null, notnull: 0, pk: 0, type: 'INTEGER' },
        type: { dflt_value: null, notnull: 0, pk: 0, type: 'TEXT' },
        updated_at: { dflt_value: null, notnull: 1, pk: 0, type: 'INTEGER' },
      });
      expect(mcpServerIndexes.map((index) => index.name)).toEqual(
        expect.arrayContaining([
          'mcp_server_is_active_idx',
          'mcp_server_name_idx',
          'mcp_server_sort_order_idx',
        ]),
      );
      expect(mcpServerTableSql).toContain('mcp_server_type_check');
      expect(mcpServerTableSql).toContain("'stdio', 'sse', 'streamableHttp', 'inMemory'");
      expect(mcpServerTableSql).toContain('mcp_server_install_source_check');
      expect(mcpServerTableSql).toContain("'builtin', 'manual', 'protocol', 'unknown'");
      expect(messageIndexes.map((index) => index.name)).not.toContain('message_trace_id_idx');
      expect(messageIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'message_parent_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'message_topic_created_idx', unique: 0 }),
          expect.objectContaining({ name: 'message_status_idx', unique: 0 }),
          expect.objectContaining({ name: 'message_topic_root_uniq', unique: 1 }),
        ]),
      );
      expect(topicIndexes.map((index) => index.name)).toEqual(
        expect.arrayContaining([
          'topic_assistant_id_idx',
          'topic_order_key_idx',
          'topic_updated_at_idx',
        ]),
      );
      expect(modelIndexes.map((index) => index.name)).toEqual(
        expect.arrayContaining([
          'user_model_preset_idx',
          'user_model_provider_enabled_idx',
          'user_model_provider_id_order_key_idx',
          'user_model_provider_model_unique',
        ]),
      );
      expect(fileEntryIndexes.map((index) => index.name)).toEqual(
        expect.arrayContaining([
          'fe_created_at_idx',
          'fe_deleted_at_idx',
          'fe_external_path_idx',
          'fe_external_path_lower_unique_idx',
        ]),
      );
      expect(chatMessageFileRefIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'cmfr_entry_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'cmfr_source_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'cmfr_unique_idx', unique: 1 }),
        ]),
      );
      expect(paintingIndexes.map((index) => index.name)).toContain('painting_order_key_idx');
      expect(paintingFileRefIndexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'pfr_entry_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'pfr_source_id_idx', unique: 0 }),
          expect.objectContaining({ name: 'pfr_unique_idx', unique: 1 }),
        ]),
      );
      expect(messageTableSql).toContain('message_root_parent_check');
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_origin_check'));
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_origin_consistency'));
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_external_no_delete'));
      expect(fileEntryTableSql).toEqual(expect.stringContaining('fe_size_internal_only'));
      expect(chatMessageFileRefTableSql).toContain('cmfr_role_check');
      expect(paintingFileRefTableSql).toContain('pfr_role_check');
      expect(rootIndexSql).toContain('"deleted_at" is null');
      expect(assistantKnowledgeBaseFks).toContainEqual(
        expect.objectContaining({ from: 'assistant_id', on_delete: 'CASCADE', table: 'assistant' }),
      );
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
      expect(messageFks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'parent_id', on_delete: 'CASCADE', table: 'message' }),
          expect.objectContaining({ from: 'topic_id', on_delete: 'CASCADE', table: 'topic' }),
        ]),
      );
      expect(chatMessageFileRefFks).toEqual(
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
      expect(paintingFileRefFks).toEqual(
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
      expect(tables.map((table) => table.name)).toEqual(
        expect.arrayContaining([
          'assistant_knowledge_base',
          'assistant_mcp_server',
          'chat_message_file_ref',
          'file_entry',
          'mcp_server',
          'painting',
          'painting_file_ref',
        ]),
      );
      expect(tables.filter((table) => !table.name.startsWith('sqlite_'))).toHaveLength(40);

      database.exec(`
        INSERT INTO assistant (id, name, emoji, settings, order_key, created_at, updated_at)
        VALUES ('assistant-mcp', 'Assistant', 'x', '{}', 'a0', 1, 1);
        INSERT INTO mcp_server (id, name, base_url, created_at, updated_at)
        VALUES ('mcp-1', 'Server', 'https://example.com/mcp', 1, 1);
        INSERT INTO assistant_mcp_server (assistant_id, mcp_server_id, created_at, updated_at)
        VALUES ('assistant-mcp', 'mcp-1', 1, 1);
      `);
      database.exec("DELETE FROM mcp_server WHERE id = 'mcp-1'");
      expect(database.prepare('SELECT count(*) AS count FROM assistant_mcp_server').get()).toEqual({
        count: 0,
      });
      database.exec("DELETE FROM assistant WHERE id = 'assistant-mcp'");
      expect(() =>
        database.exec(`
          INSERT INTO mcp_server (id, name, type, created_at, updated_at)
          VALUES ('mcp-bad-type', 'Bad type', 'websocket', 1, 1);
        `),
      ).toThrow();
      expect(() =>
        database.exec(`
          INSERT INTO mcp_server (id, name, install_source, created_at, updated_at)
          VALUES ('mcp-bad-source', 'Bad source', 'sync', 1, 1);
        `),
      ).toThrow();

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
    } finally {
      database.close();
    }
  });

  test('foreign_keys pragma inside a transaction is ignored', () => {
    // The property 0004's orphan guard exists for: drizzle runs migrations in a
    // transaction, and SQLite silently ignores this pragma mid-transaction, so a
    // table rebuild cannot turn foreign keys off the way its SQL assumes.
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

  test('0004 junction rebuild drops orphaned rows instead of aborting the upgrade', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      const entries = readMigrationEntries();
      const rebuildIndex = entries.findIndex(({ tag }) => tag === '0004_tidy_killraven');
      expect(rebuildIndex).toBeGreaterThan(0);

      for (const { sql } of entries.slice(0, rebuildIndex)) {
        applyMigrationSql(database, sql);
      }

      // Before 0004 the junction had no mcp_server FK, so a row could reference
      // an id that never lands in the table 0004 creates — and since that table
      // is created empty by this same migration, every carried-over row is one.
      database.exec(`
        INSERT INTO assistant (id, name, emoji, settings, order_key, created_at, updated_at)
        VALUES ('assistant-1', 'Assistant', 'x', '{}', 'a0', 1, 1);
        INSERT INTO assistant_mcp_server (assistant_id, mcp_server_id, created_at, updated_at)
        VALUES ('assistant-1', 'mcp-legacy', 1, 1);
      `);

      expect(() => {
        applyMigrationsAsDrizzleWould(database, entries.slice(rebuildIndex));
      }).not.toThrow();

      expect(database.prepare('SELECT * FROM assistant_mcp_server').all()).toEqual([]);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  test('0006 preserves populated chat/model data and opaque knowledge links', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      const entries = readMigrationEntries();
      const migrationIndex = entries.findIndex(({ tag }) => tag === '0006_chubby_abomination');
      expect(migrationIndex).toBeGreaterThan(0);

      for (const { sql } of entries.slice(0, migrationIndex)) {
        applyMigrationSql(database, sql);
      }

      database.exec(`
        INSERT INTO user_provider (
          provider_id, name, order_key, created_at, updated_at
        ) VALUES ('provider-1', 'Provider', 'a0', 1, 1);
        INSERT INTO user_model (
          id, provider_id, model_id, preset_model_id, name, capabilities,
          supports_streaming, order_key, created_at, updated_at
        ) VALUES (
          'provider-1::model-1', 'provider-1', 'model-1', 'model-1', 'Model',
          '["reasoning"]', 1, 'a0', 1, 1
        );
        INSERT INTO assistant (
          id, name, emoji, model_id, settings, order_key, created_at, updated_at
        ) VALUES (
          'assistant-1', 'Assistant', 'A', 'provider-1::model-1', '{}', 'a0', 1, 1
        );
        INSERT INTO topic (
          id, name, assistant_id, order_key, created_at, updated_at
        ) VALUES ('topic-1', 'Topic', 'assistant-1', 'a0', 1, 1);
        INSERT INTO message (
          id, parent_id, topic_id, role, data, status, created_at, updated_at
        ) VALUES ('root-1', NULL, 'topic-1', 'root', '{}', 'success', 1, 1);
        INSERT INTO message (
          id, parent_id, topic_id, role, data, status, model_id, model_snapshot,
          created_at, updated_at
        ) VALUES (
          'message-1', 'root-1', 'topic-1', 'assistant', '{}', 'success',
          'provider-1::model-1', '{"id":"model-1","name":"Model","provider":"provider-1"}',
          2, 2
        );
        INSERT INTO topic (
          id, name, assistant_id, order_key, created_at, updated_at
        ) VALUES ('topic-no-author', 'No author', NULL, 'a1', 1, 1);
        INSERT INTO message (
          id, parent_id, topic_id, role, data, status, created_at, updated_at
        ) VALUES ('root-no-author', NULL, 'topic-no-author', 'root', '{}', 'success', 1, 1);
        INSERT INTO message (
          id, parent_id, topic_id, role, data, status, model_id, model_snapshot,
          created_at, updated_at
        ) VALUES (
          'message-no-author', 'root-no-author', 'topic-no-author', 'assistant', '{}', 'success',
          'provider-1::model-1', '{"id":"model-1","name":"Model","provider":"provider-1"}',
          2, 2
        );
        INSERT INTO assistant_knowledge_base (
          assistant_id, knowledge_base_id, created_at, updated_at
        ) VALUES ('assistant-1', 'legacy-knowledge-1', 1, 2);
      `);

      applyMigrationsAsDrizzleWould(database, entries.slice(migrationIndex));

      expect(database.prepare('SELECT id, model_id FROM assistant').get()).toEqual({
        id: 'assistant-1',
        model_id: 'provider-1::model-1',
      });
      expect(database.prepare('SELECT count(*) AS count FROM message').get()).toEqual({ count: 4 });
      const migratedMessage = database
        .prepare('SELECT message_snapshot FROM message WHERE id = ?')
        .get('message-1') as { message_snapshot: string };
      expect(JSON.parse(migratedMessage.message_snapshot)).toEqual({
        emoji: 'A',
        id: 'assistant-1',
        model: { id: 'model-1', name: 'Model', provider: 'provider-1' },
        name: 'Assistant',
      });
      expect(
        database
          .prepare('SELECT message_snapshot FROM message WHERE id = ?')
          .get('message-no-author'),
      ).toEqual({ message_snapshot: null });
      expect(
        database
          .prepare('SELECT assistant_id, knowledge_base_id FROM assistant_knowledge_base')
          .all(),
      ).toEqual([{ assistant_id: 'assistant-1', knowledge_base_id: 'legacy-knowledge-1' }]);
      expect(
        database
          .prepare('SELECT id, status, error FROM knowledge_base WHERE id = ?')
          .get('legacy-knowledge-1'),
      ).toEqual({
        error: 'missing_vector_store',
        id: 'legacy-knowledge-1',
        status: 'failed',
      });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  test('0006 preserves populated chat, model, knowledge, and MCP data', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec('PRAGMA foreign_keys = ON');
      const entries = readMigrationEntries();
      const syncIndex = entries.findIndex(({ tag }) => tag === '0006_chubby_abomination');
      expect(syncIndex).toBeGreaterThan(0);

      for (const { sql } of entries.slice(0, syncIndex)) {
        applyMigrationSql(database, sql);
      }

      database.exec(`
        INSERT INTO user_provider (
          provider_id, preset_provider_id, name, order_key, created_at, updated_at
        ) VALUES ('openai', 'openai', 'OpenAI', 'a0', 1, 1);

        INSERT INTO user_model (
          id, provider_id, model_id, preset_model_id, name, description, capabilities,
          custom_endpoint_url, supports_streaming, reasoning, is_enabled, is_hidden,
          is_deprecated, order_key, user_overrides, created_at, updated_at
        ) VALUES (
          'openai::gpt-old', 'openai', 'gpt-old', 'gpt-old', 'My GPT', 'legacy',
          '["reasoning"]', 'https://legacy.example/v1', 1,
          '{"type":"openai-chat","supportedEfforts":["low","high"]}',
          1, 0, 0, 'a0', '["name"]', 1, 1
        ), (
          'openai::custom', 'openai', 'custom', NULL, 'Custom', NULL, '["reasoning"]',
          'https://custom.example/v1', 1,
          '{"type":"openai-chat","supportedEfforts":["low"]}',
          1, 0, 0, 'a1', NULL, 1, 1
        );

        INSERT INTO assistant (
          id, name, emoji, model_id, settings, order_key, created_at, updated_at
        ) VALUES ('assistant-1', 'Assistant', 'x', 'openai::gpt-old', '{}', 'a0', 1, 1);
        INSERT INTO "group" (id, entity_type, name, order_key, created_at, updated_at)
        VALUES ('group-1', 'topic', 'Group', 'a0', 1, 1);
        INSERT INTO topic (
          id, name, assistant_id, active_node_id, group_id, order_key, created_at, updated_at
        ) VALUES ('topic-1', 'Topic', 'assistant-1', 'message-assistant', 'group-1', 'a0', 1, 1);
        INSERT INTO message (
          id, parent_id, topic_id, role, data, status, siblings_group_id, model_id,
          model_snapshot, fts_rowid, created_at, updated_at
        ) VALUES (
          'message-root', NULL, 'topic-1', 'root', '{"parts":[]}', 'success', 0,
          NULL, NULL, 1, 1, 1
        ), (
          'message-user', 'message-root', 'topic-1', 'user', '{"parts":[{"type":"text","text":"hello"}]}',
          'success', 0, 'openai::gpt-old',
          '{"id":"gpt-old","name":"GPT Old","provider":"openai"}', 2, 1, 1
        ), (
          'message-assistant', 'message-user', 'topic-1', 'assistant',
          '{"parts":[{"type":"text","text":"world"}]}', 'success', 0,
          'openai::gpt-old', '{"id":"gpt-old","name":"GPT Old","provider":"openai"}',
          3, 1, 1
        );
        INSERT INTO file_entry (
          id, origin, name, ext, size, external_path, created_at, updated_at, deleted_at
        ) VALUES ('file-1', 'internal', 'attachment', 'txt', 5, NULL, 1, 1, NULL);
        INSERT INTO chat_message_file_ref (
          id, file_entry_id, source_id, role, created_at, updated_at
        ) VALUES ('message-file-1', 'file-1', 'message-user', 'attachment', 1, 1);
        INSERT INTO assistant_knowledge_base (
          assistant_id, knowledge_base_id, created_at, updated_at
        ) VALUES ('assistant-1', 'knowledge-opaque', 1, 1);

        INSERT INTO mcp_server (id, name, type, base_url, command, created_at, updated_at)
        VALUES
          ('mcp-stdio', 'stdio', 'stdio', NULL, 'server', 1, 1),
          ('mcp-sse', 'sse', 'sse', 'https://example.com/sse', NULL, 1, 1),
          ('mcp-http', 'http', 'streamableHttp', 'https://example.com/mcp', NULL, 1, 1),
          ('mcp-memory', 'memory', 'inMemory', NULL, NULL, 1, 1);
      `);

      expect(() => {
        applyMigrationsAsDrizzleWould(database, entries.slice(syncIndex));
      }).not.toThrow();
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

      expect(database.prepare('SELECT id, model_id FROM assistant').all()).toEqual([
        expect.objectContaining({ id: 'assistant-1', model_id: 'openai::gpt-old' }),
      ]);
      expect(
        database.prepare('SELECT id, topic_id, model_id FROM message ORDER BY fts_rowid').all(),
      ).toEqual([
        expect.objectContaining({ id: 'message-root', model_id: null, topic_id: 'topic-1' }),
        expect.objectContaining({
          id: 'message-user',
          model_id: 'openai::gpt-old',
          topic_id: 'topic-1',
        }),
        expect.objectContaining({
          id: 'message-assistant',
          model_id: 'openai::gpt-old',
          topic_id: 'topic-1',
        }),
      ]);
      expect(database.prepare('SELECT * FROM chat_message_file_ref').all()).toHaveLength(1);
      expect(
        database.prepare('SELECT message_snapshot FROM message WHERE id = ?').get('message-user'),
      ).toEqual({ message_snapshot: null });

      const presetModel = database
        .prepare('SELECT * FROM user_model WHERE id = ?')
        .get('openai::gpt-old') as Record<string, unknown>;
      expect(presetModel).toEqual(
        expect.objectContaining({
          capabilities: null,
          name: 'My GPT',
          reasoning: null,
          supports_streaming: null,
        }),
      );
      const customReasoning = JSON.parse(
        String(
          (
            database
              .prepare('SELECT reasoning FROM user_model WHERE id = ?')
              .get('openai::custom') as { reasoning: string }
          ).reasoning,
        ),
      ) as Record<string, unknown>;
      expect(customReasoning).toEqual(expect.objectContaining({ selectableEfforts: ['low'] }));
      expect(customReasoning).not.toHaveProperty('type');

      expect(database.prepare('SELECT * FROM assistant_knowledge_base').all()).toHaveLength(1);
      expect(database.prepare('SELECT id, status, error FROM knowledge_base').get()).toEqual({
        error: 'missing_vector_store',
        id: 'knowledge-opaque',
        status: 'failed',
      });
      expect(database.prepare('SELECT type FROM mcp_server ORDER BY id').all()).toEqual([
        { type: 'streamableHttp' },
        { type: 'inMemory' },
        { type: 'sse' },
        { type: 'stdio' },
      ]);

      const retained = database
        .prepare("SELECT value FROM app_state WHERE key = 'migration.0006.opaque-retention'")
        .get() as { value: string };
      expect(JSON.parse(retained.value)).toEqual(
        expect.objectContaining({
          messageModelSnapshots: expect.objectContaining({
            'message-user': expect.objectContaining({ id: 'gpt-old' }),
          }),
          modelFields: expect.objectContaining({
            'openai::gpt-old': expect.objectContaining({
              customEndpointUrl: 'https://legacy.example/v1',
              userOverrides: ['name'],
            }),
          }),
          topicGroupIds: { 'topic-1': 'group-1' },
        }),
      );
    } finally {
      database.close();
    }
  });

  test.each(
    readMigrationEntries().map((entry, index) => [index, entry.tag]),
  )('upgrading from %i (%s) commits in one transaction with foreign keys intact', (resumeIndex) => {
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
  });
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
