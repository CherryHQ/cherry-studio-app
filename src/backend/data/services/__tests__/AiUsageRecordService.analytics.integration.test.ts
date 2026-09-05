import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';
import {
  AiUsageRecordListQuerySchema,
  AiUsageRecordStatsQuerySchema,
  AiUsageRecordTimelineQuerySchema,
} from '@/shared/data/api/schemas/aiUsageRecords';

import type { AiUsageCaptureContext, RecordAiInvocationInput } from '../AiUsageRecordService';
import { AiUsageRecordService } from '../AiUsageRecordService';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

type MigrationJournal = { entries: { tag: string }[] };

describe('AI usage analytics', () => {
  let sqlite: DatabaseSync;
  let service: AiUsageRecordService;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
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
          return { rows: row ? [Object.values(row)] : [] };
        }
        const rows = statement.all(...params) as Record<string, unknown>[];
        return { rows: rows.map(Object.values) };
      },
      undefined as never,
      { casing: 'snake_case', schema },
    ) as unknown as Database;
    const dbService = {
      getDb: () => database,
      withWriteTx: async <T>(callback: (tx: Database) => Promise<T>) => {
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
    // Data services resolve `DbService` from `application`, so the fake is
    // installed as a host override instead of being passed to constructors.
    await installTestHost({ DbService: dbService });
    service = new AiUsageRecordService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  test('uses stable keyset pagination for derived token and performance metrics', async () => {
    await service.recordInvocations([
      invocation('tokens-120', 1_001, { inputTokens: 100, outputTokens: 20 }),
      invocation('tokens-100', 1_002, { totalTokens: 100 }),
      invocation('tokens-unknown', 1_003),
    ]);

    const requestIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(
        AiUsageRecordListQuerySchema.parse({
          limit: 1,
          sortBy: 'totalTokens',
          sortOrder: 'desc',
          cursor,
        }),
      );
      requestIds.push(...page.items.map((item) => item.requestId));
      cursor = page.nextCursor;
    } while (cursor);

    expect(requestIds).toEqual(['tokens-120', 'tokens-100', 'tokens-unknown']);
    expect(new Set(requestIds).size).toBe(3);
  });

  test('returns top groups, other totals, daily buckets, and independent currency totals', async () => {
    const dayOne = Date.UTC(2026, 0, 1, 12);
    const dayTwo = Date.UTC(2026, 0, 2, 12);
    await service.recordInvocations([
      invocation('provider-a', dayOne, { inputTokens: 80, outputTokens: 20 }, context('a')),
      invocation(
        'provider-b',
        dayOne,
        { inputTokens: 40, outputTokens: 10 },
        context('b', { pricingSnapshot: null }),
        { amount: 0.5, currency: 'CNY' },
      ),
      invocation(
        'provider-c',
        dayTwo,
        { inputTokens: 20, outputTokens: 5 },
        context('c', { pricingSnapshot: null }),
      ),
    ]);

    const stats = await service.stats(
      AiUsageRecordStatsQuerySchema.parse({
        groupBy: 'provider',
        metric: 'tokens',
        limit: 2,
        from: dayOne - 1,
        to: dayTwo + 1,
        currency: 'USD',
      }),
    );
    expect(
      stats.buckets.map((bucket) => (bucket.groupBy === 'provider' ? bucket.providerId : null)),
    ).toEqual(['a', 'b']);
    expect(stats.totals).toMatchObject({
      totalInputTokens: 140,
      totalOutputTokens: 35,
      totalTokens: 175,
      recordCount: 3,
      requestCount: 3,
      unpricedRequestCount: 1,
    });
    expect(stats.other).toMatchObject({ totalTokens: 25, recordCount: 1, requestCount: 1 });

    const timeline = await service.timeline(
      AiUsageRecordTimelineQuerySchema.parse({
        groupBy: 'provider',
        metric: 'tokens',
        limit: 2,
        from: dayOne - 1,
        to: dayTwo + 1,
        currency: 'USD',
      }),
    );
    expect(timeline.costTotals).toEqual([
      { currency: 'CNY', total: 0.5 },
      { currency: 'USD', total: 0.00012000000000000002 },
    ]);
    expect(timeline.dailyCosts).toHaveLength(2);
    expect(timeline.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'a', totalTokens: 100 }),
        expect.objectContaining({ providerId: 'b', totalTokens: 50 }),
        expect.objectContaining({ isOther: true, totalTokens: 25, unpricedRequestCount: 1 }),
      ]),
    );
  });
});

function context(
  providerId: string,
  overrides: Partial<AiUsageCaptureContext> = {},
): AiUsageCaptureContext {
  return {
    providerId,
    providerName: `Provider ${providerId.toUpperCase()}`,
    modelId: 'model-1',
    modelName: 'Model One',
    pricingSnapshot: {
      currency: 'USD',
      inputPerMillionTokens: 1,
      outputPerMillionTokens: 2,
      capturedAt: '2026-01-01T00:00:00.000Z',
    },
    trustProviderReportedCost: true,
    reportedCostCurrency: 'USD',
    credentialReceipt: { attribution: 'unknown' },
    source: { type: 'assistant', id: `assistant-${providerId}`, name: null, icon: null },
    messageRef: null,
    ...overrides,
  };
}

function invocation(
  requestId: string,
  completedAt: number,
  usage?: RecordAiInvocationInput['usage'],
  captureContext = context('a', { pricingSnapshot: null }),
  providerCost?: RecordAiInvocationInput['providerCost'],
): RecordAiInvocationInput {
  return {
    requestId,
    context: captureContext,
    modality: 'language',
    usage,
    ...(providerCost ? { providerCost } : {}),
    metrics: { timeFirstTokenMs: 100, timeCompletionMs: 600 },
    completedAt,
  };
}

function applyMigrations(database: DatabaseSync) {
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
