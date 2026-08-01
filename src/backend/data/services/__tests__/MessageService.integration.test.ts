import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';
import type { CherryMessagePart, Message } from '@cherrystudio/universal/data/types/message';
import { AiUsageRecordService } from '../AiUsageRecordService';
import { FileEntryService } from '../FileEntryService';
import { MessageService } from '../MessageService';
import { PinService } from '../PinService';
import { TagService } from '../TagService';
import { TopicService } from '../TopicService';

// Rows are inserted in bulk here, so unlike the fixed-id mocks elsewhere these
// have to be distinct. `expo-crypto` is already mocked the same way globally.
jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

// `fractional-indexing` is ESM-only and outside jest's transform allowlist, so
// importing the real TopicService fails to parse without this. Appending to the
// previous key keeps the "last" insert lexicographically greatest, which is all
// topic creation asks of it — no service under test is faked.
jest.mock('fractional-indexing', () => ({
  generateKeyBetween: (lower: null | string) => `${lower ?? 'a'}0`,
  generateNKeysBetween: (lower: null | string, _upper: null | string, count: number) => {
    const keys: string[] = [];
    let previous = lower ?? 'a';
    for (let index = 0; index < count; index += 1) {
      previous = `${previous}0`;
      keys.push(previous);
    }
    return keys;
  },
}));

type MigrationJournal = { entries: { tag: string }[] };

/**
 * The mock-based sibling suite pins the call shapes; this one pins the SQL, so
 * a regression in a WHERE clause or a transaction boundary fails a test instead
 * of quietly shipping. Every collaborator is the real service over the same
 * in-memory database — nothing here is a stand-in.
 */
describe('MessageService integration', () => {
  let sqlite: DatabaseSync;
  let dbService: DbService;
  let service: MessageService;
  let topicService: TopicService;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
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
          return { rows: row ? hybridRow(row) : [] };
        }
        const rows = statement.all(...params) as Record<string, unknown>[];
        return { rows: rows.map(hybridRow) };
      },
      undefined as never,
      { casing: 'snake_case', schema },
    ) as unknown as Database;
    let writeTail: Promise<void> = Promise.resolve();
    dbService = {
      getDb: () => database,
      withWriteTx: async <T>(callback: (tx: Database) => Promise<T>) => {
        const previous = writeTail;
        let release: () => void = () => undefined;
        writeTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const result = await callback(database);
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        } finally {
          release();
        }
      },
    } as unknown as DbService;
    topicService = new TopicService(
      dbService,
      new PinService(dbService),
      new TagService(dbService),
    );
    service = new MessageService(dbService, topicService, new FileEntryService(dbService));
  });

  afterEach(() => sqlite.close());

  // The approval resume hands the SDK the paused assistant message's own id and
  // expects the stream to continue that row. That only works while the row is
  // part of the history the path builds, so its own presence is the contract.
  test('getPathToNode ends at the requested node and drops the virtual root', async () => {
    const topic = await topicService.create({ name: 'path' });
    const user = await service.create(topic.id, {
      data: { parts: [{ text: 'hi', type: 'text' }] },
      role: 'user',
    });
    const assistant = await service.create(topic.id, { data: { parts: [] }, role: 'assistant' });

    const path = await service.getPathToNode(assistant.id);

    expect(path.map((message) => message.id)).toEqual([user.id, assistant.id]);
    expect(path.at(-1)?.id).toBe(assistant.id);
    expect(path.map((message) => message.role)).not.toContain('root');
  });

  // Cold-start reconcile settles whatever this returns to `error`. A `paused`
  // row is a user-stopped generation and must remain terminal.
  test('findPendingAssistantMessageIds returns only live pending assistant rows', async () => {
    const topic = await topicService.create({ name: 'reconcile' });
    const create = (role: 'assistant' | 'user', status: Message['status']) =>
      service.create(topic.id, { data: { parts: [] }, role, setAsActive: false, status });

    const pending = await create('assistant', 'pending');
    await create('assistant', 'paused');
    await create('assistant', 'success');
    await create('assistant', 'error');
    await create('user', 'pending');
    const softDeleted = await create('assistant', 'pending');
    sqlite.prepare('UPDATE message SET deleted_at = 1 WHERE id = ?').run(softDeleted.id);

    await expect(service.findPendingAssistantMessageIds()).resolves.toEqual([pending.id]);
  });

  test('materializes assistant usage stats from durable invocation records', async () => {
    const topic = await topicService.create({ name: 'usage projection' });
    const message = await service.create(topic.id, {
      data: { parts: [] },
      role: 'assistant',
      status: 'pending',
    });
    sqlite
      .prepare('UPDATE message SET stats = ? WHERE id = ?')
      .run(JSON.stringify({ timeFirstTokenMs: 12 }), message.id);
    const usageService = new AiUsageRecordService(dbService);
    const context = {
      providerId: 'openrouter',
      providerName: 'OpenRouter',
      modelId: 'openai/gpt-5',
      modelName: 'GPT-5',
      pricingSnapshot: {
        currency: 'USD' as const,
        inputPerMillionTokens: 1,
        outputPerMillionTokens: 2,
        cacheReadPerMillionTokens: 0.5,
        capturedAt: '2026-07-30T00:00:00.000Z',
      },
      trustProviderReportedCost: true,
      reportedCostCurrency: 'USD' as const,
      credentialReceipt: { attribution: 'unknown' as const },
      source: null,
      messageRef: { kind: 'chat' as const, id: message.id },
    };

    await usageService.recordInvocation({
      requestId: 'request-1',
      context,
      modality: 'language',
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        reasoningTokens: 5,
        noCacheTokens: 80,
        cacheReadTokens: 20,
      },
      metrics: { timeFirstTokenMs: 100, timeCompletionMs: 900 },
      completedAt: 1_785_427_200_000,
    });
    await usageService.recordInvocation({
      requestId: 'request-2',
      context,
      modality: 'language',
      usage: { inputTokens: 50, outputTokens: 10, reasoningTokens: 2 },
      providerCost: { amount: 0.2, currency: 'CNY' },
      metrics: { timeCompletionMs: 400 },
      completedAt: 1_785_427_201_000,
    });
    await service.update(message.id, { data: { parts: [] }, status: 'success' });

    await expect(service.getById(message.id)).resolves.toMatchObject({
      stats: {
        inputTokens: 150,
        outputTokens: 30,
        totalTokens: 180,
        inputTokenDetails: { noCacheTokens: 80, cacheReadTokens: 20 },
        outputTokenDetails: { textTokens: 23, reasoningTokens: 7 },
        requestCount: 2,
        estimatedRequestCount: 0,
        unpricedRequestCount: 0,
        costs: [
          {
            currency: 'CNY',
            amount: 0.2,
            providerReportedRequestCount: 1,
            computedRequestCount: 0,
          },
          {
            currency: 'USD',
            amount: 0.00013000000000000002,
            providerReportedRequestCount: 0,
            computedRequestCount: 1,
          },
        ],
        providerPerformance: { measuredOutputTokens: 30, generationDurationMs: 1200 },
        timeFirstTokenMs: 12,
      },
    });
  });

  test('finalizes assistant runtime timing while preserving the durable usage projection', async () => {
    const topic = await topicService.create({ name: 'runtime timing' });
    const message = await service.create(topic.id, {
      data: { parts: [] },
      role: 'assistant',
      status: 'pending',
    });
    sqlite.prepare('UPDATE message SET stats = ? WHERE id = ?').run(
      JSON.stringify({
        outputTokens: 20,
        providerPerformance: { measuredOutputTokens: 20, generationDurationMs: 500 },
        timeFirstTokenMs: 100,
        runtimeTiming: {
          startedAt: 1_000,
          spans: [
            {
              id: 'tool:first',
              kind: 'tool-execution',
              toolCallId: 'first',
              startedAt: 1_500,
              completedAt: 2_000,
            },
          ],
        },
      }),
      message.id,
    );

    await service.finalizeAssistantMessage(message.id, {
      data: { parts: [{ text: 'done', type: 'text' }] },
      runtimeStats: {
        runtimeTiming: {
          startedAt: 1_000,
          completedAt: 4_000,
          spans: [
            {
              id: 'tool:second',
              kind: 'tool-execution',
              toolCallId: 'second',
              startedAt: 3_000,
              completedAt: 3_500,
            },
          ],
        },
      },
      status: 'success',
    });

    await expect(service.getById(message.id)).resolves.toMatchObject({
      data: { parts: [{ text: 'done', type: 'text' }] },
      stats: {
        outputTokens: 20,
        providerPerformance: { measuredOutputTokens: 20, generationDurationMs: 500 },
        runtimeTiming: {
          startedAt: 1_000,
          completedAt: 4_000,
          spans: [{ id: 'tool:first' }, { id: 'tool:second' }],
        },
      },
      status: 'success',
    });
    expect((await service.getById(message.id)).stats).not.toHaveProperty('timeFirstTokenMs');
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM ai_usage_record').get()).toMatchObject({
      count: 0,
    });
  });

  test('rejects runtime finalization for non-assistant messages', async () => {
    const topic = await topicService.create({ name: 'runtime timing role' });
    const message = await service.create(topic.id, {
      data: { parts: [] },
      role: 'user',
      status: 'success',
    });

    await expect(
      service.finalizeAssistantMessage(message.id, {
        data: { parts: [] },
        status: 'error',
      }),
    ).rejects.toThrow('only assistant messages can be finalized');
  });

  describe('applyToolApprovalDecisions', () => {
    async function seedTip() {
      const topic = await topicService.create({ name: 'approval' });
      await service.create(topic.id, { data: { parts: [] }, role: 'user', status: 'success' });
      const tip = await service.create(topic.id, {
        data: { parts: [requestedPart('a1'), requestedPart('a2')] },
        role: 'assistant',
        status: 'success',
      });

      return { tip, topic };
    }

    test('serializes concurrent decisions without losing either response', async () => {
      const { tip } = await seedTip();

      const [first, second] = await Promise.all([
        service.applyToolApprovalDecisions(tip.id, [
          { approvalId: 'a1', approved: true, updatedInput: { query: 'revised' } },
        ]),
        service.applyToolApprovalDecisions(tip.id, [
          { approvalId: 'a2', approved: false, reason: 'not now' },
        ]),
      ]);

      expect(first?.appliedApprovalIds).toEqual(['a1']);
      expect(second?.appliedApprovalIds).toEqual(['a2']);
      const settled = await service.getById(tip.id);
      expect(settled.status).toBe('pending');
      expect(settled.data.parts).toEqual([
        expect.objectContaining({
          approval: { approved: true, id: 'a1' },
          input: { query: 'revised' },
          state: 'approval-responded',
        }),
        expect.objectContaining({
          approval: { approved: false, id: 'a2', reason: 'not now' },
          state: 'approval-responded',
        }),
      ]);
    });

    test('completes approval wait timing in the same transaction as the decision', async () => {
      const { tip } = await seedTip();
      sqlite.prepare('UPDATE message SET stats = ? WHERE id = ?').run(
        JSON.stringify({
          runtimeTiming: {
            startedAt: 1_000,
            spans: [
              {
                id: 'approval:a1',
                kind: 'approval-wait',
                approvalId: 'a1',
                toolCallId: 'call-a1',
                startedAt: 1_100,
              },
              {
                id: 'approval:a2',
                kind: 'approval-wait',
                approvalId: 'a2',
                toolCallId: 'call-a2',
                startedAt: 1_200,
              },
            ],
          },
        }),
        tip.id,
      );
      const now = jest.spyOn(Date, 'now').mockReturnValue(2_000);

      try {
        await service.applyToolApprovalDecisions(tip.id, [{ approvalId: 'a1', approved: true }]);
      } finally {
        now.mockRestore();
      }

      await expect(service.getById(tip.id)).resolves.toMatchObject({
        stats: {
          runtimeTiming: {
            spans: [
              expect.objectContaining({ approvalId: 'a1', completedAt: 2_000 }),
              expect.not.objectContaining({ completedAt: expect.anything() }),
            ],
          },
        },
      });
    });

    test('returns null for a deleted approval message', async () => {
      const { tip } = await seedTip();
      sqlite.prepare('UPDATE message SET deleted_at = 1 WHERE id = ?').run(tip.id);

      await expect(
        service.applyToolApprovalDecisions(tip.id, [{ approvalId: 'a1', approved: true }]),
      ).resolves.toBeNull();
    });
  });
});

function applyMigrations(database: DatabaseSync) {
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
}

/**
 * Positional for drizzle's column mapper, named for the raw `db.all` queries
 * the recursive tree walks use — drizzle hands those rows straight back
 * unmapped, so the proxy has to answer in both shapes at once.
 */
function hybridRow(row: Record<string, unknown>): unknown[] {
  return Object.assign(Object.values(row), row);
}

function requestedPart(approvalId: string): CherryMessagePart {
  return {
    approval: { id: approvalId },
    input: {},
    state: 'approval-requested',
    toolCallId: `call-${approvalId}`,
    toolName: 'search',
    type: 'dynamic-tool',
  } as CherryMessagePart;
}
