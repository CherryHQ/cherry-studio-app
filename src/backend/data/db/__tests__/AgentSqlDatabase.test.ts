import { Directory } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { AgentSqlDatabase, type AgentSqlExecutor } from '../AgentSqlDatabase';

jest.mock('expo-sqlite', () => ({
  ...jest.requireActual('expo-sqlite'),
  openDatabaseAsync: jest.fn(),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function connection() {
  const operations: string[] = [];
  const sqlite = {
    execAsync: jest.fn(async (sql: string) => {
      operations.push(sql);
    }),
    runAsync: jest.fn(async (sql: string) => {
      operations.push(sql);
      return { changes: 1, lastInsertRowId: 1 };
    }),
    getFirstAsync: jest.fn(async (sql: string) => {
      operations.push(sql);
      return null;
    }),
    getAllAsync: jest.fn(async (sql: string) => {
      operations.push(sql);
      return [];
    }),
    closeAsync: jest.fn(async () => {
      operations.push('close');
    }),
  };
  return {
    sqlite,
    operations,
    database: new AgentSqlDatabase(sqlite as unknown as SQLiteDatabase),
  };
}

describe('AgentSqlDatabase', () => {
  test('opens the Android SQLite path without requiring a file URI', async () => {
    const { sqlite, operations } = connection();
    // SQLite accepts its native default path; FileSystem requires a URI instead.
    const create = jest.spyOn(Directory.prototype, 'create').mockImplementation(() => {
      throw new Error('URI is not absolute');
    });
    const open = jest
      .spyOn(SQLite, 'openDatabaseAsync')
      .mockResolvedValue(sqlite as unknown as SQLiteDatabase);
    try {
      const database = await AgentSqlDatabase.open({
        directory: '/data/user/0/com.cherryai.cherrystudio_app.dev/files/SQLite',
      });
      await database.run('usable connection');
      await database.close();
      expect(operations).toEqual([
        'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
        'usable connection',
        'close',
      ]);
    } finally {
      create.mockRestore();
      open.mockRestore();
    }
  });

  test('holds unrelated reads, writes, and another transaction until commit', async () => {
    const { database, operations } = connection();
    const entered = deferred();
    const finish = deferred();
    const first = database.transaction(async (tx) => {
      await tx.run('inside');
      entered.resolve();
      await finish.promise;
    });
    await entered.promise;
    const read = database.get('outside read');
    const write = database.run('outside write');
    const second = database.transaction((tx) => tx.exec('second transaction'));
    await Promise.resolve();
    expect(operations).toEqual(['BEGIN IMMEDIATE', 'inside']);
    finish.resolve();
    await Promise.all([first, read, write, second]);
    expect(operations).toEqual([
      'BEGIN IMMEDIATE',
      'inside',
      'COMMIT',
      'outside read',
      'outside write',
      'BEGIN IMMEDIATE',
      'second transaction',
      'COMMIT',
    ]);
  });

  test('rolls back before admitting another operation and preserves the callback error', async () => {
    const { database, operations } = connection();
    const failure = new Error('callback failure');
    const transaction = database.transaction(async (tx) => {
      await tx.run('inside');
      throw failure;
    });
    const next = database.run('after failure');
    await expect(transaction).rejects.toBe(failure);
    await next;
    expect(operations).toEqual(['BEGIN IMMEDIATE', 'inside', 'ROLLBACK', 'after failure']);
  });

  test('reports failed rollback separately and prevents reuse of the uncertain connection', async () => {
    const { database, sqlite } = connection();
    const failure = new Error('callback failure');
    const rollbackFailure = new Error('rollback failure');
    sqlite.execAsync.mockImplementation(async (sql) => {
      if (sql === 'ROLLBACK') throw rollbackFailure;
    });
    const transaction = database.transaction(async () => {
      throw failure;
    });
    await expect(transaction).rejects.toMatchObject({ errors: [failure, rollbackFailure] });
    await expect(database.run('must not run')).rejects.toBeInstanceOf(AggregateError);
    expect(sqlite.runAsync).not.toHaveBeenCalled();
    await database.close();
    expect(sqlite.closeAsync).toHaveBeenCalledTimes(1);
  });

  test('invalidates an escaped transaction handle once its callback settles', async () => {
    const { database, sqlite } = connection();
    let escaped!: AgentSqlExecutor;
    await database.transaction(async (tx) => {
      escaped = tx;
    });
    await expect(escaped.run('late write')).rejects.toThrow('already settled');
    await expect(escaped.get('late read')).rejects.toThrow('already settled');
    expect(sqlite.runAsync).not.toHaveBeenCalled();
    expect(sqlite.getFirstAsync).not.toHaveBeenCalled();
  });

  test('seals admission immediately and drains accepted work before closing once', async () => {
    const { database, operations } = connection();
    const entered = deferred();
    const finish = deferred();
    const work = database.transaction(async () => {
      entered.resolve();
      await finish.promise;
    });
    await entered.promise;
    const queued = database.run('accepted');
    const closing = database.close();
    expect(database.close()).toBe(closing);
    await expect(database.get('rejected')).rejects.toThrow('closing');
    finish.resolve();
    await Promise.all([work, queued, closing]);
    expect(operations).toEqual(['BEGIN IMMEDIATE', 'COMMIT', 'accepted', 'close']);
  });

  test('preserves null, blob, and exact integer bindings and rejects precision loss', async () => {
    const { database, sqlite } = connection();
    const blob = new Uint8Array([0, 255]);
    await database.run('bindings', null, 'value', blob, 42n);
    expect(sqlite.runAsync).toHaveBeenCalledWith('bindings', [null, 'value', blob, 42]);
    await expect(database.run('unsafe', 9_007_199_254_740_993n)).rejects.toThrow('precision');
    expect(sqlite.runAsync).toHaveBeenCalledTimes(1);
    await expect(database.get('absent')).resolves.toBeUndefined();
  });
});
