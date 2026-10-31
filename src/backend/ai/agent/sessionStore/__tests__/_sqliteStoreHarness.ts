import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { customSqlStatements } from '@/backend/data/db/customSql';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';
import type { AgentSessionView } from '@/shared/contracts/agent';
import { parseUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';

import { SqliteAgentSessionStore } from '../SqliteAgentSessionStore';

export type SqliteStoreHarness = {
  store: SqliteAgentSessionStore;
  /** Seeds an empty legacy Session without exposing that operation on the production port. */
  createEmptySession: (input: { agentId: string; name?: string }) => Promise<AgentSessionView>;
  /** Inserts an Agent row, and the model row its foreign key needs, and returns its id. */
  seedAgent: (id?: string) => string;
  /** Inserts the provider and model rows a reserved message's model id references. */
  seedModel: (uniqueModelId: UniqueModelId) => void;
  /** Inserts an active library folder, as a workspace binding requires. */
  seedFolder: (id?: string) => string;
  raw: DatabaseSync;
  cleanup: () => void;
};

/** The durable store over a real migrated in-memory database. */
export function createSqliteStoreHarness(): SqliteStoreHarness {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sqlite);
  for (const statement of customSqlStatements) {
    sqlite.exec(statement);
  }
  const database = drizzle(
    async (sql, params, method) => {
      const statement = sqlite.prepare(sql);
      if (method === 'run') {
        statement.run(...params);
        return { rows: [] };
      }
      if (method === 'get') {
        const row = statement.get(...params) as Record<string, unknown> | undefined;
        return { rows: row ? hybridRow(row) : [] };
      }
      const rows = statement.all(...params) as Record<string, unknown>[];
      return { rows: rows.map(hybridRow) };
    },
    undefined as never,
    { casing: 'snake_case', schema },
  ) as unknown as Database;
  let writeTail: Promise<void> = Promise.resolve();
  const dbService = {
    getDb: () => database,
    getSqlite: () => ({
      getAllAsync: async (query: string, params: SQLInputValue[]) =>
        sqlite.prepare(query).all(...params),
    }),
    withWriteTx: async <T>(callback: (tx: Database) => Promise<T>) => {
      const previous = writeTail;
      let release: () => void = () => undefined;
      writeTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback(database);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      } finally {
        release();
      }
    },
  } as unknown as DbService;
  const store = new SqliteAgentSessionStore(dbService);
  const seedModel = (uniqueModelId: UniqueModelId) => {
    const { providerId, modelId } = parseUniqueModelId(uniqueModelId);
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO user_provider (provider_id, name, order_key, created_at, updated_at)
         VALUES (?, ?, 'a0', 1, 1)`,
      )
      .run(providerId, providerId);
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO user_model (
          id, provider_id, model_id, name, preset_model_id, order_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'a0', 1, 1)`,
      )
      .run(uniqueModelId, providerId, modelId, modelId, modelId);
  };
  return {
    store,
    createEmptySession: (input) => store.createEmptySession(input),
    seedAgent: (id = randomUUID()) => {
      sqlite
        .prepare(
          'INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, 'Agent', 'a0', Date.now(), Date.now());
      return id;
    },
    seedModel,
    seedFolder: (id = randomUUID()) => {
      sqlite
        .prepare(
          `INSERT INTO file_folder (id, name, name_key, created_at, updated_at)
           VALUES (?, ?, ?, 1, 1)`,
        )
        .run(id, id, id);
      return id;
    },
    raw: sqlite,
    cleanup: () => sqlite.close(),
  };
}

type MigrationJournal = { entries: { tag: string }[] };

function applyMigrations(database: DatabaseSync) {
  const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(
    readFileSync(`${directory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;
  for (const { tag } of journal.entries) {
    const migration = readFileSync(`${directory}/${tag}.sql`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) {
        database.exec(statement);
      }
    }
  }
}

/**
 * Positional for drizzle's column mapper, named for raw `db.all` fallbacks —
 * the proxy answers in both shapes at once.
 */
function hybridRow(row: Record<string, unknown>): unknown[] {
  return Object.assign(Object.values(row), row);
}
