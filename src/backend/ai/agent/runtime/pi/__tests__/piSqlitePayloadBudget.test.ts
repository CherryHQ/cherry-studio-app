import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from 'node:sqlite';

import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { SqliteExecutor } from '@earendil-works/chord/sqlite';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  createRegistry,
  defineDoc,
  Harness,
  UserEntry,
  type ConversationId,
  type EntryRecord,
  type StoredDocument,
} from '@earendil-works/pi-durable';
import { SqliteStorage } from '@earendil-works/pi-durable/storage/sqlite';

type QueryRecord = {
  method: 'get' | 'all';
  sql: string;
  rowCount: number;
  payloadBytes: number;
};

function payloadColumnBytes(row: Record<string, SQLOutputValue>): number {
  const column = row.record ?? row.content;
  return typeof column === 'string' ? Buffer.byteLength(column, 'utf8') : 0;
}

function createTrackedSqlite(raw: DatabaseSync, maxPayloadReadBytes?: number) {
  const queries: QueryRecord[] = [];
  let closed = 0;

  const makeExecutor = (): SqliteExecutor => ({
    async exec(sql) {
      raw.exec(sql);
    },
    async run(sql, ...params) {
      raw.prepare(sql).run(...(params as SQLInputValue[]));
    },
    async runCounted(sql, ...params) {
      return Number(raw.prepare(sql).run(...(params as SQLInputValue[])).changes);
    },
    async get<Row extends object>(sql: string, ...params: unknown[]) {
      const row = raw.prepare(sql).get(...(params as SQLInputValue[])) as
        | Record<string, SQLOutputValue>
        | undefined;
      queries.push({
        method: 'get',
        sql,
        rowCount: row ? 1 : 0,
        payloadBytes: row ? payloadColumnBytes(row) : 0,
      });
      return row as Row | undefined;
    },
    async all<Row extends object>(sql: string, ...params: unknown[]) {
      const rows = raw.prepare(sql).all(...(params as SQLInputValue[])) as Record<
        string,
        SQLOutputValue
      >[];
      const payloadBytes = rows.reduce((sum, row) => sum + payloadColumnBytes(row), 0);
      queries.push({
        method: 'all',
        sql,
        rowCount: rows.length,
        payloadBytes,
      });
      return rows as Row[];
    },
  });

  const executor = makeExecutor();
  const db = {
    ...executor,
    ...(maxPayloadReadBytes !== undefined ? { maxPayloadReadBytes } : {}),
    async transaction<T>(callback: (tx: SqliteExecutor) => Promise<T>) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback(makeExecutor());
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      closed++;
      raw.close();
    },
  };

  return {
    db,
    queries,
    clearQueries: () => {
      queries.length = 0;
    },
    closeCount: () => closed,
  };
}

function harnessOptions(registry = createRegistry()) {
  return {
    models: createModels({
      authContext: { env: async () => undefined, fileExists: async () => false },
    }),
    registry,
  };
}

function makeUserEntry(label: string, paddingBytes: number, timestamp: number) {
  return {
    kind: UserEntry.kind,
    model: [
      {
        role: 'user' as const,
        content: `${label}:${'x'.repeat(paddingBytes)}`,
        timestamp,
      },
    ],
  };
}

async function scanAllPages(
  storage: SqliteStorage,
  conversationId: ConversationId,
  order: 'ascending' | 'descending',
  limit: number,
  bounds: { minEntryId?: number; maxEntryId?: number } = {},
): Promise<EntryRecord[]> {
  const collected: EntryRecord[] = [];
  let cursor: Record<string, never> | Record<string, number | string> | undefined;
  do {
    const page = await storage.scanEntries(
      {
        conversationId,
        order,
        ...(bounds.minEntryId !== undefined ? { minEntryId: bounds.minEntryId as never } : {}),
        ...(bounds.maxEntryId !== undefined ? { maxEntryId: bounds.maxEntryId as never } : {}),
      },
      limit,
      cursor,
      BACKGROUND_CONTEXT,
    );
    collected.push(...page.items);
    cursor = page.next as typeof cursor;
  } while (cursor !== undefined);
  return collected;
}

describe('SqliteStorage payload byte budget', () => {
  test('chunks descending and ascending entry scans in single-query CTEs across forks and matches unbounded reads', async () => {
    const raw = new DatabaseSync(':memory:');
    const writerDb = createTrackedSqlite(raw);
    const writerStorage = await SqliteStorage.open(writerDb.db);
    const harness = await Harness.open(writerStorage, harnessOptions(), BACKGROUND_CONTEXT);

    let parentId!: ConversationId;
    let forkId!: ConversationId;
    const parentEntryIds: number[] = [];
    const childEntryIds: number[] = [];

    await harness.commit(async (tx) => {
      const parent = await tx.createConversation({ ownership: { kind: 'ownerless' } });
      parentId = parent.id;
      for (let i = 0; i < 6; i++) {
        const padding = i === 2 ? 4200 : 900;
        const entry = await tx.appendEntry(parentId, makeUserEntry(`p-${i}`, padding, i));
        parentEntryIds.push(entry.id);
      }
    }, BACKGROUND_CONTEXT);

    await harness.commit(async (tx) => {
      const fork = await tx.forkConversation(parentId, parentEntryIds[3]! as never, {
        ownership: { kind: 'ownerless' },
      });
      forkId = fork.id;
      // Append parent entries after fork cutoff to verify fork upper bound clipping.
      await tx.appendEntry(parentId, makeUserEntry('p-after-fork', 900, 100));
      for (let i = 0; i < 5; i++) {
        const padding = i === 1 ? 4500 : 1000;
        const entry = await tx.appendEntry(forkId, makeUserEntry(`c-${i}`, padding, 200 + i));
        childEntryIds.push(entry.id);
      }
    }, BACKGROUND_CONTEXT);

    const budget = 3500;
    const unboundedDb = createTrackedSqlite(raw);
    const unbounded = await SqliteStorage.open(unboundedDb.db);
    const boundedDb = createTrackedSqlite(raw, budget);
    const bounded = await SqliteStorage.open(boundedDb.db);

    try {
      // Unbounded mode issues zero octet_length queries.
      unboundedDb.clearQueries();
      const expectedDesc = await scanAllPages(unbounded, forkId, 'descending', 3);
      const expectedAsc = await scanAllPages(unbounded, forkId, 'ascending', 3);
      const expectedAllDesc = await scanAllPages(unbounded, forkId, 'descending', 20);
      expect(unboundedDb.queries.some((q) => q.sql.includes('octet_length'))).toBe(false);
      expect(expectedAllDesc).toHaveLength(9);

      // Bounded descending scan: paginated (limit 3) and single-page full fork scan (limit 20).
      boundedDb.clearQueries();
      const actualDesc = await scanAllPages(bounded, forkId, 'descending', 3);
      expect(actualDesc).toEqual(expectedDesc);

      const descBudgetedQueries = boundedDb.queries.filter(
        (q) => q.method === 'all' && q.sql.includes('octet_length'),
      );
      expect(descBudgetedQueries.length).toBeGreaterThan(0);
      expect(descBudgetedQueries.some((q) => q.rowCount === 1 && q.payloadBytes > budget)).toBe(
        true,
      );
      for (const query of descBudgetedQueries) {
        if (query.rowCount > 1) expect(query.payloadBytes).toBeLessThanOrEqual(budget);
      }

      // Bounded full scan across parent + child segments.
      boundedDb.clearQueries();
      const actualAllDesc = await scanAllPages(bounded, forkId, 'descending', 20);
      expect(actualAllDesc).toEqual(expectedAllDesc);
      for (const query of boundedDb.queries) {
        if (query.method === 'all' && query.sql.includes('octet_length') && query.rowCount > 1) {
          expect(query.payloadBytes).toBeLessThanOrEqual(budget);
        }
      }

      // Bounded ascending scan across fork segments and oversized entries.
      boundedDb.clearQueries();
      const actualAsc = await scanAllPages(bounded, forkId, 'ascending', 3);
      expect(actualAsc).toEqual(expectedAsc);
      const ascBudgetedQueries = boundedDb.queries.filter(
        (q) => q.method === 'all' && q.sql.includes('octet_length'),
      );
      expect(ascBudgetedQueries.length).toBeGreaterThan(0);
      expect(ascBudgetedQueries.some((q) => q.rowCount === 1 && q.payloadBytes > budget)).toBe(
        true,
      );
      for (const query of ascBudgetedQueries) {
        if (query.rowCount > 1) expect(query.payloadBytes).toBeLessThanOrEqual(budget);
      }

      // Small entries fitting within budget run 1 single all() query total (no extra probe).
      const generousDb = createTrackedSqlite(raw, 64 * 1024);
      const generous = await SqliteStorage.open(generousDb.db);
      generousDb.clearQueries();
      const childOnly = await generous.scanEntries(
        { conversationId: forkId, minEntryId: childEntryIds[0]! as never },
        10,
        undefined,
        BACKGROUND_CONTEXT,
      );
      expect(childOnly.items).toHaveLength(5);
      const childOnlyAllQueries = generousDb.queries.filter((q) => q.method === 'all');
      expect(childOnlyAllQueries).toHaveLength(1);
      expect(childOnlyAllQueries[0]?.sql).toContain('octet_length');

      // fetchLimit <= 1 skips octet_length (child has 5 entries, parent boundary check has remaining = 1).
      generousDb.clearQueries();
      const boundaryPage = await generous.scanEntries(
        { conversationId: forkId },
        5,
        undefined,
        BACKGROUND_CONTEXT,
      );
      expect(boundaryPage.items).toHaveLength(5);
      expect(boundaryPage.next).toBeDefined();
      const entryAllQueries = generousDb.queries.filter((q) => q.method === 'all');
      expect(entryAllQueries).toHaveLength(2);
      expect(entryAllQueries[0]?.sql).toContain('octet_length');
      expect(entryAllQueries[1]?.sql).not.toContain('octet_length');
      expect(entryAllQueries[1]?.rowCount).toBe(1);
    } finally {
      await harness.close(BACKGROUND_CONTEXT).catch(() => undefined);
      if (raw.isOpen) raw.close();
    }
  });

  test('streams materializeDocument deltas within budget, skips empty tails, and preserves version boundary errors', async () => {
    const raw = new DatabaseSync(':memory:');
    const GrowingDoc = defineDoc<{ items: string[] }>({
      kind: 'test.growing-doc',
      version: 1,
      scope: 'session',
      checkpointWhen: () => false,
      initial: () => ({ items: [] }),
    });
    const EmptyTailDoc = defineDoc<{ label: string }>({
      kind: 'test.empty-tail-doc',
      version: 1,
      scope: 'session',
      checkpointWhen: () => false,
      initial: () => ({ label: 'initial' }),
    });

    const writerDb = createTrackedSqlite(raw);
    const writerStorage = await SqliteStorage.open(writerDb.db);
    const harness = await Harness.open(writerStorage, harnessOptions(), BACKGROUND_CONTEXT);

    await harness.commit(async (tx) => {
      await tx.doc(EmptyTailDoc);
      const doc = await tx.doc(GrowingDoc);
      doc.items.push(`seed:${'a'.repeat(400)}`);
    }, BACKGROUND_CONTEXT);

    for (let i = 0; i < 8; i++) {
      await harness.commit(async (tx) => {
        const doc = await tx.doc(GrowingDoc);
        const size = i === 4 ? 4200 : 700;
        doc.items.push(`delta-${i}:${'d'.repeat(size)}`);
      }, BACKGROUND_CONTEXT);
    }

    const emptyMeta = await writerStorage.findDocument(
      { kind: EmptyTailDoc.definition.kind, scope: { kind: 'session' } },
      'current',
      BACKGROUND_CONTEXT,
    );
    const growingMeta = await writerStorage.findDocument(
      { kind: GrowingDoc.definition.kind, scope: { kind: 'session' } },
      'current',
      BACKGROUND_CONTEXT,
    );
    expect(emptyMeta).toBeDefined();
    expect(growingMeta).toBeDefined();

    const budget = 3000;
    const unboundedDb = createTrackedSqlite(raw);
    const unbounded = await SqliteStorage.open(unboundedDb.db);
    const generousDb = createTrackedSqlite(raw, 64 * 1024);
    const generous = await SqliteStorage.open(generousDb.db);
    const boundedDb = createTrackedSqlite(raw, budget);
    const bounded = await SqliteStorage.open(boundedDb.db);

    try {
      // Unbounded read issues zero octet_length queries.
      unboundedDb.clearQueries();
      const expected = await unbounded.document(growingMeta!.id, 'current', BACKGROUND_CONTEXT);
      expect(expected).toBeDefined();
      expect(expected!.deltasSinceBase).toBe(8);
      expect(unboundedDb.queries.some((q) => q.sql.includes('octet_length'))).toBe(false);

      // 0 deltas after base runs 1 query returning 0 rows.
      boundedDb.clearQueries();
      const emptyDoc = await bounded.document(emptyMeta!.id, 'current', BACKGROUND_CONTEXT);
      expect(emptyDoc).toMatchObject({
        deltasSinceBase: 0,
        value: { label: 'initial' },
      });
      const emptyTailAllQueries = boundedDb.queries.filter((q) => q.method === 'all');
      expect(emptyTailAllQueries).toHaveLength(1);
      expect(emptyTailAllQueries[0]?.rowCount).toBe(0);

      // Small deltas fitting within budget run 1 single all() query.
      generousDb.clearQueries();
      const generousDoc = await generous.document(growingMeta!.id, 'current', BACKGROUND_CONTEXT);
      expect(generousDoc).toEqual(expected);
      expect(generousDb.queries.filter((q) => q.method === 'all')).toHaveLength(1);

      // Large deltas stream across multiple bounded queries + oversized delta as a 1-row CTE result.
      boundedDb.clearQueries();
      const actual: StoredDocument | undefined = await bounded.document(
        growingMeta!.id,
        'current',
        BACKGROUND_CONTEXT,
      );
      expect(actual).toEqual(expected);

      const revisionAllQueries = boundedDb.queries.filter(
        (q) => q.method === 'all' && q.sql.includes('octet_length'),
      );
      expect(revisionAllQueries.length).toBeGreaterThan(1);
      expect(revisionAllQueries.some((q) => q.rowCount === 1 && q.payloadBytes > budget)).toBe(
        true,
      );
      for (const query of revisionAllQueries) {
        if (query.rowCount > 1) expect(query.payloadBytes).toBeLessThanOrEqual(budget);
      }

      // Version boundary mismatch still rejects under bounded replay.
      raw
        .prepare(
          `UPDATE document_revisions SET version = 99
           WHERE document_id = ? AND seq = (SELECT MAX(seq) FROM document_revisions WHERE document_id = ?)`,
        )
        .run(growingMeta!.id, growingMeta!.id);

      await expect(
        bounded.document(growingMeta!.id, 'current', BACKGROUND_CONTEXT),
      ).rejects.toThrow('crosses a stored version boundary without a base');
    } finally {
      await harness.close(BACKGROUND_CONTEXT).catch(() => undefined);
      if (raw.isOpen) raw.close();
    }
  });

  test('honors db.maxPayloadReadBytes, allows options override, and rejects invalid budgets while closing db', async () => {
    const raw = new DatabaseSync(':memory:');
    const writerDb = createTrackedSqlite(raw);
    const writer = await SqliteStorage.open(writerDb.db);
    const harness = await Harness.open(writer, harnessOptions(), BACKGROUND_CONTEXT);
    let conversationId!: ConversationId;
    await harness.commit(async (tx) => {
      const conversation = await tx.createConversation({ ownership: { kind: 'ownerless' } });
      conversationId = conversation.id;
      await tx.appendEntry(conversationId, makeUserEntry('a', 1500, 1));
      await tx.appendEntry(conversationId, makeUserEntry('b', 1500, 2));
      await tx.appendEntry(conversationId, makeUserEntry('c', 1500, 3));
    }, BACKGROUND_CONTEXT);

    // Honors db.maxPayloadReadBytes when options.maxPayloadReadBytes is omitted.
    const defaultDb = createTrackedSqlite(raw, 2500);
    const fromDb = await SqliteStorage.open(defaultDb.db);
    defaultDb.clearQueries();
    await fromDb.scanEntries({ conversationId }, 10, undefined, BACKGROUND_CONTEXT);
    expect(defaultDb.queries.some((q) => q.sql.includes('octet_length'))).toBe(true);

    // options.maxPayloadReadBytes overrides db.maxPayloadReadBytes (single-row budget runs 1 row per query).
    const overrideDb = createTrackedSqlite(raw, 64 * 1024);
    const fromOptions = await SqliteStorage.open(overrideDb.db, { maxPayloadReadBytes: 100 });
    overrideDb.clearQueries();
    const rows = await fromOptions.scanEntries(
      { conversationId },
      10,
      undefined,
      BACKGROUND_CONTEXT,
    );
    expect(rows.items).toHaveLength(3);
    const entryQueries = overrideDb.queries.filter(
      (q) => q.method === 'all' && q.sql.includes('octet_length'),
    );
    expect(entryQueries.map((q) => q.rowCount)).toEqual([1, 1, 1]);

    await harness.close(BACKGROUND_CONTEXT).catch(() => undefined);
    if (raw.isOpen) raw.close();

    // Invalid budgets reject with RangeError and close db.
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalidRaw = new DatabaseSync(':memory:');
      const tracked = createTrackedSqlite(invalidRaw, invalid);
      await expect(SqliteStorage.open(tracked.db)).rejects.toThrow(RangeError);
      expect(tracked.closeCount()).toBe(1);
    }

    for (const invalid of [0, -5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const invalidRaw = new DatabaseSync(':memory:');
      const tracked = createTrackedSqlite(invalidRaw, 4096);
      await expect(
        SqliteStorage.open(tracked.db, { maxPayloadReadBytes: invalid }),
      ).rejects.toThrow(RangeError);
      expect(tracked.closeCount()).toBe(1);
    }
  });
});
