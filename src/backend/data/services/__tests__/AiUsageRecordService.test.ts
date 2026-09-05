import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { DbService } from '@/backend/data/db/DbService';
import { aiUsageRecordTable } from '@/backend/data/db/schemas';

import type { AiUsageCaptureContext, RecordAiInvocationInput } from '../AiUsageRecordService';
import { AiUsageRecordService } from '../AiUsageRecordService';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000000'),
}));

afterEach(uninstallTestHost);

describe('AiUsageRecordService', () => {
  it('writes immutable identity, usage, metrics, and cache-aware computed cost', async () => {
    const database = await createDatabase();
    const service = new AiUsageRecordService();

    await service.recordInvocation(
      invocation({
        usage: {
          inputTokens: 100,
          outputTokens: 10,
          totalTokens: 110,
          reasoningTokens: 3,
          cacheReadTokens: 20,
          cacheWriteTokens: 10,
        },
        metrics: { timeFirstTokenMs: 100, timeCompletionMs: 900, timeThinkingMs: 250 },
      }),
    );

    expect(database.rows).toHaveLength(1);
    expect(database.rows[0]).toMatchObject({
      requestId: 'request-1',
      providerId: 'openrouter',
      modelId: 'openai/gpt-5',
      sourceType: 'assistant',
      sourceId: 'assistant-1',
      messageKind: 'chat',
      messageId: 'message-1',
      apiKeyAttribution: 'explicit',
      apiKeyId: 'key-1',
      apiKeyMasked: 'sk-****',
      inputTokens: 100,
      outputTokens: 10,
      reasoningTokens: 3,
      cost: 0.0001075,
      costCurrency: 'USD',
      costSource: 'computed',
      costBreakdown: {
        input: 0.00007,
        cacheRead: 0.00001,
        cacheWrite: 0.0000075,
        output: 0.00002,
      },
      timeFirstTokenMs: 100,
      timeCompletionMs: 900,
      timeThinkingMs: 250,
    });
  });

  it('trusts provider cost only when the frozen provider capability allows it', async () => {
    const trustedDatabase = await createDatabase();
    const trustedService = new AiUsageRecordService();
    await trustedService.recordInvocation(
      invocation({
        providerCost: { amount: 0.25, currency: 'USD', breakdown: { input: 0.25 } },
      }),
    );
    expect(trustedDatabase.rows[0]).toMatchObject({
      cost: 0.25,
      costCurrency: 'USD',
      costSource: 'provider',
      costBreakdown: { input: 0.25 },
    });

    const untrustedDatabase = await createDatabase();
    const untrustedService = new AiUsageRecordService();
    await untrustedService.recordInvocation(
      invocation({
        context: { ...captureContext(), trustProviderReportedCost: false },
        providerCost: { amount: 0.25, currency: 'USD' },
      }),
    );
    expect(untrustedDatabase.rows[0]).toMatchObject({
      cost: 0.00012,
      costCurrency: 'USD',
      costSource: 'computed',
    });
  });

  it('is idempotent by request id', async () => {
    const database = await createDatabase();
    const service = new AiUsageRecordService();
    const input = invocation();

    await service.recordInvocation(input);
    await service.recordInvocation(input);

    expect(database.rows).toHaveLength(1);
  });

  it('swallows invalid best-effort writes', async () => {
    const database = await createDatabase();
    const service = new AiUsageRecordService();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        service.recordInvocation(invocation({ usage: { inputTokens: -1 } })),
      ).resolves.toBeUndefined();
      expect(database.rows).toEqual([]);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

function captureContext(): AiUsageCaptureContext {
  return {
    providerId: 'openrouter',
    providerName: 'OpenRouter',
    modelId: 'openai/gpt-5',
    modelName: 'GPT-5',
    pricingSnapshot: {
      currency: 'USD',
      inputPerMillionTokens: 1,
      outputPerMillionTokens: 2,
      cacheReadPerMillionTokens: 0.5,
      cacheWritePerMillionTokens: 0.75,
      capturedAt: '2026-07-30T00:00:00.000Z',
    },
    trustProviderReportedCost: true,
    reportedCostCurrency: 'USD',
    credentialReceipt: {
      attribution: 'explicit',
      id: 'key-1',
      label: 'Primary',
      masked: 'sk-****',
    },
    source: { type: 'assistant', id: 'assistant-1', name: 'Assistant', icon: 'A' },
    messageRef: { kind: 'chat', id: 'message-1' },
  };
}

function invocation(overrides: Partial<RecordAiInvocationInput> = {}): RecordAiInvocationInput {
  return {
    requestId: 'request-1',
    context: captureContext(),
    modality: 'language',
    usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
    completedAt: 1_785_427_200_000,
    ...overrides,
  };
}

async function createDatabase() {
  const rows: Record<string, unknown>[] = [];
  let pendingRow: Record<string, unknown> | undefined;
  const tx = {
    insert: jest.fn(() => ({
      values: jest.fn((row: Record<string, unknown>) => {
        pendingRow = row;
        return {
          onConflictDoNothing: jest.fn(() => ({
            returning: jest.fn(async () => {
              if (rows.some(({ requestId }) => requestId === row.requestId)) return [];
              rows.push({ id: `usage-${rows.length + 1}`, ...row });
              return [{ id: `usage-${rows.length}` }];
            }),
          })),
        };
      }),
    })),
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => ({
        where: jest.fn(() => {
          const matchingRows = rows.filter(({ requestId }) => requestId === pendingRow?.requestId);
          if (table !== aiUsageRecordTable) return { limit: jest.fn(async () => []) };
          return Object.assign(Promise.resolve(rows), {
            limit: jest.fn(async () => matchingRows),
          });
        }),
      })),
    })),
  };
  const dbService = {
    withWriteTx: jest.fn(async (callback: (transaction: typeof tx) => Promise<void>) =>
      callback(tx),
    ),
  } as unknown as DbService;
  // Installed here so every case gets its own fake behind `application.get`;
  // the service resolves `DbService` per call and takes no constructor.
  return installTestHost({ DbService: dbService }).then(() => ({ dbService, rows }));
}
