import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { SQLiteDatabase } from 'expo-sqlite';

const itemTable = sqliteTable('item', {
  id: integer().primaryKey(),
  name: text().notNull().unique(),
});

/**
 * Minimal expo-sqlite statement surface backed by node:sqlite. Like expo-sqlite,
 * nothing finalizes a statement unless the caller does, so `open` exposes leaks.
 */
function createExpoClient() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE item (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
  const open = new Set<object>();
  let prepared = 0;

  const execute = (source: string, params: SQLInputValue[], raw: boolean) => {
    const statement = sqlite.prepare(source);
    if (statement.columns().length === 0) {
      const { changes, lastInsertRowid } = statement.run(...params);
      return { changes, lastInsertRowId: lastInsertRowid, rows: [] as unknown[] };
    }
    const rows = statement.all(...params).map((row) => (raw ? Object.values(row) : row));
    return { changes: 0, lastInsertRowId: 0, rows };
  };

  const client = {
    prepareSync(source: string) {
      prepared += 1;
      let finalized = false;
      const run = (params: SQLInputValue[], raw: boolean) => {
        if (finalized) throw new Error('statement used after finalize');
        const { rows, ...result } = execute(source, params, raw);
        return { ...result, getAllSync: () => rows, getFirstSync: () => rows[0] ?? null };
      };
      const statement = {
        executeSync: (params: SQLInputValue[]) => run(params, false),
        executeForRawResultSync: (params: SQLInputValue[]) => run(params, true),
        finalizeSync: () => {
          if (finalized) throw new Error('statement finalized twice');
          finalized = true;
          open.delete(statement);
        },
      };
      open.add(statement);
      return statement;
    },
  };

  return {
    db: drizzle(client as unknown as SQLiteDatabase, { schema: { itemTable } }),
    openStatements: () => open.size,
    preparedStatements: () => prepared,
  };
}

// drizzle-orm's Expo session used to prepare a statement per query and never
// finalize it; expo-sqlite has no native destructor, so every query leaked one.
describe('drizzle-orm expo-sqlite session patch', () => {
  test('finalizes the statement behind every kind of query', async () => {
    const { db, openStatements, preparedStatements } = createExpoClient();

    await db.insert(itemTable).values({ id: 1, name: 'first' });
    await db.insert(itemTable).values({ id: 2, name: 'second' }).returning();
    await db.update(itemTable).set({ name: 'renamed' }).where(eq(itemTable.id, 2));
    expect(await db.select().from(itemTable)).toHaveLength(2);
    expect(await db.select().from(itemTable).get()).toEqual({ id: 1, name: 'first' });
    expect(await db.query.itemTable.findFirst({ where: eq(itemTable.id, 2) })).toEqual({
      id: 2,
      name: 'renamed',
    });
    expect(await db.get(sql`SELECT name FROM item ORDER BY id`)).toEqual({ name: 'first' });
    expect(await db.all(sql`SELECT name FROM item ORDER BY id`)).toHaveLength(2);
    db.transaction((tx) => {
      tx.delete(itemTable).where(eq(itemTable.id, 1)).run();
    });

    expect(preparedStatements()).toBeGreaterThan(0);
    expect(openStatements()).toBe(0);
  });

  test('keeps prepared queries reusable across executions', () => {
    const { db, openStatements } = createExpoClient();
    const insert = db
      .insert(itemTable)
      .values({ id: sql.placeholder('id'), name: sql.placeholder('name') })
      .prepare();
    const byId = db
      .select()
      .from(itemTable)
      .where(eq(itemTable.id, sql.placeholder('id')))
      .prepare();

    insert.run({ id: 1, name: 'first' });
    insert.run({ id: 2, name: 'second' });

    expect(byId.get({ id: 1 })).toEqual({ id: 1, name: 'first' });
    expect(byId.get({ id: 2 })).toEqual({ id: 2, name: 'second' });
    expect(openStatements()).toBe(0);
  });

  test('finalizes a failed statement and surfaces the execution error', async () => {
    const { db, openStatements } = createExpoClient();
    await db.insert(itemTable).values({ id: 1, name: 'first' });

    await expect(db.insert(itemTable).values({ id: 2, name: 'first' })).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
    expect(openStatements()).toBe(0);
  });

  // Metro bundles the ESM build while Jest exercises the CommonJS build above.
  test('patches the ESM build Metro bundles', () => {
    const expoDriverDirectory = dirname(require.resolve('drizzle-orm/expo-sqlite'));
    const source = readFileSync(join(expoDriverDirectory, 'session.js'), 'utf8');

    expect(source).not.toMatch(/this\.stmt\b/);
    expect(source).toMatch(
      /withStatement\(execute\) \{\n\s+const stmt = this\.client\.prepareSync/,
    );
    expect(source.match(/stmt\.finalizeSync\(\)/g)).toHaveLength(2);
  });
});
