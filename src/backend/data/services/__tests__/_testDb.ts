/**
 * Shared in-memory DB harness: node:sqlite over the real generated migrations
 * plus a duck-typed DbService.
 *
 * The duck `withWriteTx` replicates the REAL DbService write-tail
 * serialization (DbService.ts:68-106), not just BEGIN/COMMIT: transactional
 * post-commit contracts (e.g. the job runtime's enqueueTx) depend on write
 * transactions queuing globally, and concurrent transactions would otherwise
 * nest BEGIN IMMEDIATE and throw.
 */
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

type MigrationJournal = { entries: { tag: string }[] };

export function applyMigrations(database: DatabaseSync): void {
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
  applyPendingSchemaSlimming(database);
}

/**
 * Brings tables the schema slimming has already rewritten in line with
 * `db/schemas`, which the migrations have not caught up with yet.
 *
 * The table set is still shrinking, so the release baseline is rewritten once
 * at the end rather than accumulating one throwaway migration per table. Until
 * then services are typed against the new schema while the journal still
 * creates the old one, and every service test would query columns that the
 * replayed migrations never made. Delete this the moment the baseline is
 * regenerated — it exists to keep that regeneration a single deliberate step,
 * not to become a second source of schema truth.
 */
function applyPendingSchemaSlimming(database: DatabaseSync): void {
  // `assistant_mcp_server` cascades off `mcp_server`, so the drop empties it;
  // it is empty at setup time, and its FK re-resolves by name to the new table.
  database.exec(`
    DROP TABLE mcp_server;
    CREATE TABLE mcp_server (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      endpoint_url text NOT NULL,
      is_enabled integer DEFAULT false NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE INDEX mcp_server_is_enabled_idx ON mcp_server (is_enabled);
  `);
}

export type TestDb = {
  database: Database;
  dbService: DbService;
  /** Makes the next withWriteTx call reject before executing (one-shot). */
  failNextWriteTx: (error: Error) => void;
  /** Fails and rolls back a future transaction after its callback succeeds. */
  failWriteTxCommit: (error: Error, successfulCommitsBeforeFailure?: number) => void;
  sqlite: DatabaseSync;
};

export function createTestDb(sqlite: DatabaseSync): TestDb {
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sqlite);
  const database = drizzle(
    async (sql, params, method) => {
      const statement = sqlite.prepare(sql);
      if (method === 'run') {
        statement.run(...params);
        return { rows: [] };
      }
      if (method === 'get') {
        const row = statement.get(...params) as Record<string, unknown> | undefined;
        return { rows: row ? Object.values(row) : [] };
      }
      const rows = statement.all(...params) as Record<string, unknown>[];
      return { rows: rows.map((row) => Object.values(row)) };
    },
    undefined as never,
    { casing: 'snake_case', schema },
  ) as unknown as Database;

  let writeTail: Promise<void> = Promise.resolve();
  let pendingFailure: Error | null = null;
  let pendingCommitFailure: { error: Error; remaining: number } | null = null;
  const withWriteTx = async <T>(fn: (tx: Database) => Promise<T>): Promise<T> => {
    const previous = writeTail;
    let release: () => void = () => {};
    writeTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (pendingFailure) {
        const failure = pendingFailure;
        pendingFailure = null;
        throw failure;
      }
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(database);
        if (pendingCommitFailure) {
          if (pendingCommitFailure.remaining === 0) {
            const failure = pendingCommitFailure.error;
            pendingCommitFailure = null;
            throw failure;
          }
          pendingCommitFailure.remaining -= 1;
        }
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    } finally {
      release();
    }
  };

  const dbService = { getDb: () => database, withWriteTx } as unknown as DbService;
  return {
    database,
    dbService,
    failNextWriteTx: (error) => {
      pendingFailure = error;
    },
    failWriteTxCommit: (error, successfulCommitsBeforeFailure = 0) => {
      pendingCommitFailure = { error, remaining: successfulCommitsBeforeFailure };
    },
    sqlite,
  };
}
