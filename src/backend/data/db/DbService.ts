import { loggerService } from '@logger';
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';

import type { CacheService } from '@/backend/data/CacheService';

import { customSqlStatements } from './customSql';
import { migrations } from './migrations';
import { type DatabaseSchema, schema } from './schemas';
import { seedDatabase } from './seeding';
import { hashObject } from './seeding/hashObject';

const databaseName = 'cherry.db';
// app_state journal key for the custom (FTS) DDL; mirrors SeedRunner's `seed:` journal.
const customSqlJournalKey = 'custom-sql:message-fts';

const logger = loggerService.withContext('DbService');

export type Database = ExpoSQLiteDatabase<DatabaseSchema>;

export class DbService {
  private readonly sqlite: SQLite.SQLiteDatabase;
  private readonly db: Database;
  private disposed = false;
  private ready = false;
  private writeTail: Promise<void> = Promise.resolve();

  constructor() {
    this.sqlite = SQLite.openDatabaseSync(databaseName);
    this.db = createDrizzleDatabase(this.sqlite);
  }

  async init(cacheService: CacheService): Promise<void> {
    this.assertOpen();

    await this.configurePragmas();
    await migrate(this.db, migrations);
    this.runCustomMigrations();
    await seedDatabase(this, cacheService);
    this.ready = true;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.sqlite.closeSync();
    this.disposed = true;
    this.ready = false;
  }

  getDb(): Database {
    this.assertOpen();
    return this.db;
  }

  getSqlite(): SQLite.SQLiteDatabase {
    this.assertOpen();
    return this.sqlite;
  }

  isReady(): boolean {
    return this.ready;
  }

  async withWriteTx<TValue>(fn: (tx: Database) => Promise<TValue>): Promise<TValue> {
    this.assertOpen();

    const previous = this.writeTail;
    let release: () => void = () => {};
    this.writeTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await this.runExclusiveWriteTx(fn);
    } finally {
      release();
    }
  }

  private async runExclusiveWriteTx<TValue>(
    fn: (tx: Database) => Promise<TValue>,
  ): Promise<TValue> {
    // Keep write transactions on the long-lived connection. Expo's
    // withExclusiveTransactionAsync opens and closes a temporary connection,
    // which can crash on physical iOS devices when FTS5 tables are present.
    await this.sqlite.execAsync('BEGIN IMMEDIATE');

    try {
      const result = await fn(this.db);
      await this.sqlite.execAsync('COMMIT');
      return result;
    } catch (error) {
      try {
        await this.sqlite.execAsync('ROLLBACK');
      } catch (rollbackError) {
        logger.warn('Failed to roll back database transaction', rollbackError as Error);
      }
      throw error;
    }
  }

  private async configurePragmas(): Promise<void> {
    try {
      this.sqlite.execSync('PRAGMA journal_mode = WAL');
      this.sqlite.execSync('PRAGMA synchronous = NORMAL');
      this.sqlite.execSync('PRAGMA foreign_keys = ON');
      logger.info('Database PRAGMAs configured');
    } catch (error) {
      logger.warn('Failed to configure database PRAGMAs', error as Error);
    }
  }

  private runCustomMigrations(): void {
    // The statements DROP + CREATE triggers, i.e. they write sqlite_master on the
    // startup critical path. Journal a content hash so unchanged DDL is skipped;
    // an unreadable journal falls through to running them (today's behavior).
    const version = hashObject(customSqlStatements);
    if (this.readCustomSqlJournalVersion() === version) {
      return;
    }

    for (const statement of customSqlStatements) {
      this.sqlite.execSync(statement);
    }

    const now = Date.now();
    this.sqlite.runSync(
      `INSERT INTO app_state (key, value, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      customSqlJournalKey,
      JSON.stringify({ version }),
      'Journal for the custom FTS DDL run by DbService',
      now,
      now,
    );
  }

  private readCustomSqlJournalVersion(): string | null {
    try {
      const row = this.sqlite.getFirstSync<{ value: string }>(
        'SELECT value FROM app_state WHERE key = ?',
        customSqlJournalKey,
      );
      if (!row) {
        return null;
      }
      const parsed = JSON.parse(row.value) as { version?: string };
      return parsed.version ?? null;
    } catch (error) {
      logger.warn('Failed to read custom SQL journal; re-running custom DDL', error as Error);
      return null;
    }
  }

  private assertOpen(): void {
    if (this.disposed) {
      throw new Error('Database service has been disposed');
    }
  }
}

function createDrizzleDatabase(sqlite: SQLite.SQLiteDatabase): Database {
  return drizzle(sqlite, { casing: 'snake_case', schema });
}
