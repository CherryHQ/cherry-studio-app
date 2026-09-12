import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { subscribeDataApiChanges } from '@/backend/data/dataApiChanges';
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

  test('commits message projections with usage and notifies only new facts', async () => {
    sqlite.exec(`
      INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('agent-1', 'Agent', 'a', 1, 1);
      INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at) VALUES ('session-1', 'agent-1', 1, 1, 1);
      INSERT INTO agent_session_message (id, session_id, role, data, status, stats, created_at, updated_at)
      VALUES ('message-1', 'session-1', 'assistant', '{"version":1,"parts":[]}', 'success', '{"runtimeTiming":{"startedAt":1,"completedAt":1000,"spans":[]},"contextTokens":42}', 1, 1);
    `);
    const ref = { kind: 'agent-session' as const, id: 'message-1' };
    const first = invocation(
      'call-1',
      1000,
      { inputTokens: 100, outputTokens: 20, reasoningTokens: 5 },
      context('a', { messageRef: ref }),
    );
    const second = invocation(
      'call-2',
      2000,
      { inputTokens: 10, outputTokens: 2 },
      context('a', { messageRef: ref }),
      { amount: 0.25, currency: 'CNY' },
    );
    const image = {
      ...invocation(
        'image-1',
        3000,
        undefined,
        context('a', { messageRef: ref, pricingSnapshot: null }),
      ),
      modality: 'image' as const,
      imageCount: 1,
      metrics: undefined,
    };
    const listener = jest.fn((paths: readonly string[]) => {
      const row = sqlite
        .prepare('SELECT stats FROM agent_session_message WHERE id = ?')
        .get('message-1') as { stats: string };
      return {
        paths,
        inTransaction: sqlite.isTransaction,
        requestCount: JSON.parse(row.stats).requestCount,
      };
    });
    const unsubscribe = subscribeDataApiChanges(listener);
    try {
      await service.recordInvocations([first, second, image]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([
        '/ai-usage-records',
        '/ai-usage-records/stats',
        '/ai-usage-records/timeline',
        '/agent-sessions/session-1/messages',
      ]);
      expect(listener.mock.results[0]?.value).toMatchObject({
        inTransaction: false,
        requestCount: 3,
      });
      const projection = await service.getMessageUsageProjection(ref);
      expect(projection).toMatchObject({
        inputTokens: 110,
        outputTokens: 22,
        totalTokens: 132,
        outputTokenDetails: { reasoningTokens: 5, textTokens: 17 },
        requestCount: 3,
        estimatedRequestCount: 0,
        unpricedRequestCount: 1,
        providerPerformance: { measuredOutputTokens: 22, generationDurationMs: 1000 },
        costs: [
          {
            currency: 'CNY',
            amount: 0.25,
            providerReportedRequestCount: 1,
            computedRequestCount: 0,
          },
          {
            currency: 'USD',
            amount: expect.closeTo(0.00014, 10),
            providerReportedRequestCount: 0,
            computedRequestCount: 1,
          },
        ],
      });
      const row = sqlite
        .prepare('SELECT stats, usage FROM agent_session_message WHERE id = ?')
        .get('message-1') as { stats: string; usage: string };
      expect(JSON.parse(row.stats)).toEqual({
        ...projection,
        contextTokens: 42,
        runtimeTiming: { startedAt: 1, completedAt: 1000, spans: [] },
      });
      expect(JSON.parse(row.usage)).toEqual({
        inputTokens: 110,
        outputTokens: 22,
        totalTokens: 132,
      });
      await service.recordInvocations([first, second, image]);
      expect(listener).toHaveBeenCalledTimes(1);
      await service.refreshMessageProjection(ref);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  test.each(['success', 'error', 'cancelled', 'interrupted'])(
    'refreshes a %s message when an image call commits after finalization',
    async (status) => {
      sqlite.exec(`
        INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('agent-1', 'Agent', 'a', 1, 1);
        INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at) VALUES ('session-1', 'agent-1', 1, 1, 1);
        INSERT INTO agent_session_message (id, session_id, role, data, status, created_at, updated_at)
        VALUES ('message-1', 'session-1', 'assistant', '{"version":1,"parts":[]}', 'pending', 1, 1);
      `);
      const ref = { kind: 'agent-session' as const, id: 'message-1' };
      const listener = jest.fn((paths: readonly string[]) => {
        const row = sqlite
          .prepare('SELECT stats, usage, status FROM agent_session_message WHERE id = ?')
          .get(ref.id) as { stats: string; usage: string; status: string };
        return {
          paths,
          inTransaction: sqlite.isTransaction,
          stats: JSON.parse(row.stats),
          usage: JSON.parse(row.usage),
          status: row.status,
        };
      });
      const unsubscribe = subscribeDataApiChanges(listener);
      const analyticsPaths = [
        '/ai-usage-records',
        '/ai-usage-records/stats',
        '/ai-usage-records/timeline',
      ];
      try {
        await service.recordInvocation(
          invocation(
            'call-1',
            1000,
            { inputTokens: 100, outputTokens: 20 },
            context('a', { messageRef: ref }),
          ),
        );
        expect(listener).toHaveBeenLastCalledWith(analyticsPaths);
        sqlite
          .prepare('UPDATE agent_session_message SET status = ? WHERE id = ?')
          .run('streaming', ref.id);
        await service.recordInvocation(
          invocation(
            'call-2',
            2000,
            { inputTokens: 10, outputTokens: 2 },
            context('a', { messageRef: ref }),
          ),
        );
        expect(listener).toHaveBeenLastCalledWith(analyticsPaths);

        // The Host has already committed and published this terminal message.
        sqlite
          .prepare('UPDATE agent_session_message SET status = ? WHERE id = ?')
          .run(status, ref.id);
        listener.mockClear();
        const image = {
          ...invocation(
            'late-image',
            3000,
            undefined,
            context('a', { messageRef: ref, pricingSnapshot: null }),
            { amount: 0.25, currency: 'CNY' },
          ),
          modality: 'image' as const,
          imageCount: 1,
          metrics: undefined,
        };
        await service.recordInvocation(image);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith([
          ...analyticsPaths,
          '/agent-sessions/session-1/messages',
        ]);
        expect(listener.mock.results[0]?.value).toMatchObject({
          inTransaction: false,
          status,
          stats: {
            requestCount: 3,
            costs: expect.arrayContaining([
              {
                currency: 'CNY',
                amount: 0.25,
                providerReportedRequestCount: 1,
                computedRequestCount: 0,
              },
            ]),
          },
          usage: { inputTokens: 110, outputTokens: 22, totalTokens: 132 },
        });
        await service.recordInvocation(image);
        expect(listener).toHaveBeenCalledTimes(1);
      } finally {
        unsubscribe();
      }
    },
  );

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
