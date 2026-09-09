import type { SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQLiteDatabase } from 'expo-sqlite';

// The dialect only compiles SQL. Execution deliberately uses Expo's async API;
// Drizzle's expo-sqlite driver executes reads synchronously even when awaited.
const DIALECT = new SQLiteSyncDialect({ casing: 'snake_case' });

export async function readSqliteRows<TRow>(
  sqlite: Pick<SQLiteDatabase, 'getAllAsync'>,
  query: SQL,
  signal?: AbortSignal,
): Promise<TRow[]> {
  signal?.throwIfAborted();
  const compiled = DIALECT.sqlToQuery(query);
  const rows = await sqlite.getAllAsync<TRow>(compiled.sql, compiled.params);
  signal?.throwIfAborted();
  return rows;
}
