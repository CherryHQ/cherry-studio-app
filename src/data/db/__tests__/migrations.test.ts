import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type MigrationJournal = {
  entries: { tag: string }[];
};

describe('bundled SQLite migrations', () => {
  test('build topic-scoped trace identity without a message trace column', () => {
    const database = new DatabaseSync(':memory:');

    try {
      for (const migrationSql of readMigrationSqlFiles()) {
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
      const messageIndexes = database.prepare("PRAGMA index_list('message')").all() as {
        name: string;
      }[];
      expect(topicColumns.map((column) => column.name)).toContain('trace_id');
      expect(messageColumns.map((column) => column.name)).not.toContain('trace_id');
      expect(messageIndexes.map((index) => index.name)).not.toContain('message_trace_id_idx');
    } finally {
      database.close();
    }
  });
});

function readMigrationSqlFiles(): string[] {
  const migrationDirectory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(
    readFileSync(`${migrationDirectory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;

  return journal.entries.map(({ tag }) => readFileSync(`${migrationDirectory}/${tag}.sql`, 'utf8'));
}
