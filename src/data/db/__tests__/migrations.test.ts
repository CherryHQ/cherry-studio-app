import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type MigrationJournal = {
  entries: { tag: string }[];
};

describe('bundled SQLite migrations', () => {
  test('replays the full journal on top of the release baseline', () => {
    const database = new DatabaseSync(':memory:');

    try {
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
      const modelColumns = database.prepare("PRAGMA table_info('user_model')").all() as {
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
      const tables = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[];
      const messageTableSql = getSchemaSql(database, 'table', 'message');
      const rootIndexSql = getSchemaSql(database, 'index', 'message_topic_root_uniq');
      const assistantKnowledgeBaseFks = getForeignKeys(database, 'assistant_knowledge_base');
      const assistantMcpServerFks = getForeignKeys(database, 'assistant_mcp_server');
      const messageFks = getForeignKeys(database, 'message');

      expect(topicColumns.map((column) => column.name)).toContain('trace_id');
      expect(messageColumns.map((column) => column.name)).not.toContain('trace_id');
      expect(modelColumns.map((column) => column.name)).not.toContain('owned_by');
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
          'topic_group_id_order_key_idx',
          'topic_group_updated_idx',
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
      expect(messageTableSql).toContain('message_root_parent_check');
      expect(rootIndexSql).toContain('"deleted_at" is null');
      expect(assistantKnowledgeBaseFks).toContainEqual(
        expect.objectContaining({ from: 'assistant_id', on_delete: 'CASCADE', table: 'assistant' }),
      );
      expect(assistantMcpServerFks).toContainEqual(
        expect.objectContaining({ from: 'assistant_id', on_delete: 'CASCADE', table: 'assistant' }),
      );
      expect(messageFks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'parent_id', on_delete: 'CASCADE', table: 'message' }),
          expect.objectContaining({ from: 'topic_id', on_delete: 'CASCADE', table: 'topic' }),
        ]),
      );
      expect(tables.map((table) => table.name)).toEqual(
        expect.arrayContaining(['assistant_knowledge_base', 'assistant_mcp_server']),
      );
    } finally {
      database.close();
    }
  });
});

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
  const journal = JSON.parse(
    readFileSync(`${migrationDirectory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;

  return journal.entries.map(({ tag }) => readFileSync(`${migrationDirectory}/${tag}.sql`, 'utf8'));
}
