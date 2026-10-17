import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

type MigrationJournal = { entries: { tag: string }[] };

export function createServiceTestDatabase(): {
  database: Database;
  dbService: DbService;
  sqlite: DatabaseSync;
} {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sqlite);
  const database = drizzle(
    async (query, params, method) => {
      const statement = sqlite.prepare(query);
      if (method === 'run') {
        statement.run(...params);
        return { rows: [] };
      }
      // Positional rows, like the app driver: joined tables share column names.
      statement.setReturnArrays(true);
      if (method === 'get') {
        return { rows: (statement.get(...params) as unknown[] | undefined) ?? [] };
      }
      return { rows: statement.all(...params) as unknown as unknown[][] };
    },
    undefined as never,
    { casing: 'snake_case', schema },
  ) as unknown as Database;
  const dbService = {
    getDb: () => database,
    withWriteTx: async <TValue>(callback: (tx: Database) => Promise<TValue>) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback(database);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as DbService;
  return { database, dbService, sqlite };
}

function applyMigrations(database: DatabaseSync): void {
  const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(
    readFileSync(`${directory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;
  for (const { tag } of journal.entries) {
    const migration = readFileSync(`${directory}/${tag}.sql`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) database.exec(statement);
    }
  }
}
