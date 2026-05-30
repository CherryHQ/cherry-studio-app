import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';

import { loggerService } from '@logger';

import { customSqlStatements } from './customSql';
import { migrations } from './migrations';
import { type DatabaseSchema, schema } from './schema';
import { seedDatabase } from './seeding';

const databaseName = 'cherry.db';

const logger = loggerService.withContext('DbService');

export type Database = ExpoSQLiteDatabase<DatabaseSchema>;

export class DbService {
  private readonly sqlite: SQLite.SQLiteDatabase;
  private readonly db: Database;
  private disposed = false;
  private ready = false;
  private writeTail: Promise<void> = Promise.resolve();

  constructor() {
    this.sqlite = SQLite.openDatabaseSync(databaseName, { enableChangeListener: true });
    this.db = createDrizzleDatabase(this.sqlite);
  }

  async init(): Promise<void> {
    this.assertOpen();

    await this.configurePragmas();
    await migrate(this.db, migrations);
    this.runCustomMigrations();
    await seedDatabase(this);
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

  private async runExclusiveWriteTx<TValue>(fn: (tx: Database) => Promise<TValue>) {
    let result: TValue | undefined;

    await this.sqlite.withExclusiveTransactionAsync(async (sqliteTx) => {
      const tx = createDrizzleDatabase(sqliteTx);
      result = await fn(tx);
    });

    return result as TValue;
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
    for (const statement of customSqlStatements) {
      this.sqlite.execSync(statement);
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
