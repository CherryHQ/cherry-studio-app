import { File } from 'expo-file-system';
import {
  deleteDatabaseAsync,
  openDatabaseAsync,
  type SQLiteBindValue,
  type SQLiteDatabase,
} from 'expo-sqlite';

import { databaseDirectory } from '@/backend/data/storage/storagePaths';

import { captureDatabase } from './backupDatabase';

export const AGENT_DATABASE_NAME = 'pi-agent.db';

/** Portable values used by the Agent's storage; no upstream runtime types enter data. */
export type AgentSqlValue = null | number | bigint | string | Uint8Array;

export interface AgentSqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: AgentSqlValue[]): Promise<void>;
  get<T extends object>(sql: string, ...params: AgentSqlValue[]): Promise<T | undefined>;
  all<T extends object>(sql: string, ...params: AgentSqlValue[]): Promise<T[]>;
}

/** Owns one connection. Unrelated reads and writes wait for an active transaction. */
export class AgentSqlDatabase implements AgentSqlExecutor {
  private tail: Promise<void> = Promise.resolve();
  private closing: Promise<void> | undefined;
  private failure: Error | undefined;

  constructor(private readonly sqlite: SQLiteDatabase) {}

  /** The caller closed the idle runtime and persisted every result before discarding its cache. */
  static async reset(): Promise<AgentSqlDatabase> {
    await deleteDatabaseAsync(AGENT_DATABASE_NAME, databaseDirectory());
    return AgentSqlDatabase.open();
  }

  static async open(
    options: { directory?: string; name?: string; journal?: 'wal' | 'preserve' } = {},
  ): Promise<AgentSqlDatabase> {
    const directory = options.directory ?? databaseDirectory();
    const database = new AgentSqlDatabase(
      await openDatabaseAsync(
        options.name ?? AGENT_DATABASE_NAME,
        { useNewConnection: true, finalizeUnusedStatementsBeforeClosing: false },
        directory,
      ),
    );
    try {
      await database.exec(
        `${options.journal === 'preserve' ? '' : 'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; '}PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`,
      );
      return database;
    } catch (error) {
      await database.close().catch(() => undefined);
      throw error;
    }
  }

  exec(sql: string): Promise<void> {
    return this.enqueue(() => this.sqlite.execAsync(sql));
  }

  /** A sealed snapshot, ordered after earlier queued Pi writes; its source stays open. */
  capture(destinationUri: string): Promise<void> {
    return this.enqueue(() => captureDatabase(this.sqlite, new File(destinationUri)));
  }

  run(sql: string, ...params: AgentSqlValue[]): Promise<void> {
    return this.enqueue(async () => {
      await this.sqlite.runAsync(sql, bindings(params));
    });
  }

  get<T extends object>(sql: string, ...params: AgentSqlValue[]): Promise<T | undefined> {
    return this.enqueue(
      async () => (await this.sqlite.getFirstAsync<T>(sql, bindings(params))) ?? undefined,
    );
  }

  all<T extends object>(sql: string, ...params: AgentSqlValue[]): Promise<T[]> {
    return this.enqueue(() => this.sqlite.getAllAsync<T>(sql, bindings(params)));
  }

  transaction<T>(callback: (transaction: AgentSqlExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      await this.sqlite.execAsync('BEGIN IMMEDIATE');
      let active = true;
      const assertActive = () => {
        if (!active) throw new Error('The Agent SQL transaction has already settled.');
      };
      const transaction: AgentSqlExecutor = {
        exec: async (sql) => {
          assertActive();
          await this.sqlite.execAsync(sql);
        },
        run: async (sql, ...params) => {
          assertActive();
          await this.sqlite.runAsync(sql, bindings(params));
        },
        get: async <Row extends object>(sql: string, ...params: AgentSqlValue[]) => {
          assertActive();
          return (await this.sqlite.getFirstAsync<Row>(sql, bindings(params))) ?? undefined;
        },
        all: async <Row extends object>(sql: string, ...params: AgentSqlValue[]) => {
          assertActive();
          return this.sqlite.getAllAsync<Row>(sql, bindings(params));
        },
      };
      try {
        const result = await callback(transaction);
        active = false;
        await this.sqlite.execAsync('COMMIT');
        return result;
      } catch (error) {
        active = false;
        try {
          await this.sqlite.execAsync('ROLLBACK');
        } catch (rollbackError) {
          this.failure = new AggregateError(
            [error, rollbackError],
            'The Agent SQL transaction failed and could not be rolled back.',
          );
          throw this.failure;
        }
        throw error;
      }
    });
  }

  close(): Promise<void> {
    if (!this.closing) {
      // Seal admission immediately, then drain every operation already accepted.
      this.closing = this.tail.then(() => this.sqlite.closeAsync());
    }
    return this.closing;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('The Agent database is closing.'));
    const result = this.tail.then(() => {
      if (this.failure) throw this.failure;
      return operation();
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function bindings(values: AgentSqlValue[]): SQLiteBindValue[] {
  return values.map((value) => {
    if (typeof value !== 'bigint') return value;
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw new RangeError('The Agent SQL integer exceeds JavaScript integer precision.');
    return number;
  });
}
