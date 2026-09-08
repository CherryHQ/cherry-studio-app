import type { AiUsageRecordEntry } from '@/shared/data/types/aiUsageRecord';

import {
  formatMessageUsageCost,
  getMessageDurationMs,
  getMessageTokenUsage,
  getMessageUsageDetails,
} from '../messageUsage';

const CHAT_MODEL = { modelId: 'gpt-5', providerId: 'openai' };

function record(overrides: Partial<AiUsageRecordEntry> = {}): AiUsageRecordEntry {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    requestId: 'request-1',
    recordKind: 'invocation',
    requestCount: 1,
    messageKind: 'agent-session',
    messageId: 'message-1',
    providerId: 'openai',
    providerName: 'OpenAI',
    sourceType: 'agent',
    sourceId: 'agent-1',
    sourceName: 'Assistant',
    sourceIcon: null,
    modelId: 'gpt-5',
    modelName: 'GPT-5',
    modality: 'language',
    apiKeyId: null,
    apiKeyLabel: null,
    apiKeyMasked: null,
    apiKeyAttribution: 'unknown',
    authMethod: null,
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    reasoningTokens: null,
    noCacheTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    imageCount: null,
    cost: null,
    costCurrency: null,
    costSource: null,
    costBreakdown: null,
    pricingSnapshot: null,
    timeFirstTokenMs: null,
    timeCompletionMs: null,
    timeThinkingMs: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('messageUsage', () => {
  test('distinguishes unknown usage from a measured zero without adding cache or reasoning twice', () => {
    expect(getMessageTokenUsage(undefined).totalTokens).toBeUndefined();
    expect(getMessageTokenUsage({ inputTokens: 100 }).totalTokens).toBeUndefined();
    expect(
      getMessageTokenUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }).totalTokens,
    ).toBe(0);
    const detail = getMessageUsageDetails(
      {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        inputTokenDetails: { cacheReadTokens: 60 },
        outputTokenDetails: { reasoningTokens: 10 },
      },
      [],
      CHAT_MODEL,
    );
    expect(detail).toMatchObject({ totalTokens: 120, cacheReadTokens: 60, reasoningTokens: 10 });
    expect(detail.noCacheTokens).toBeUndefined();
  });

  test('uses the persisted message aggregate without filling it from another ledger snapshot', () => {
    const stats = {
      requestCount: 3,
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      unpricedRequestCount: 1,
      providerPerformance: { measuredOutputTokens: 20, generationDurationMs: 2_000 },
      costs: [
        {
          amount: 0.5,
          currency: 'USD' as const,
          providerReportedRequestCount: 2,
          computedRequestCount: 0,
        },
      ],
    };
    const detail = getMessageUsageDetails(
      stats,
      [record({ cacheReadTokens: 60, cost: 0.7, costCurrency: 'USD', costSource: 'provider' })],
      CHAT_MODEL,
    );
    expect(detail).toMatchObject({
      totalTokens: 120,
      requestCount: 3,
      hasUnpricedRecords: true,
    });
    expect(detail.costs).toBe(stats.costs);
    expect(detail.cacheReadTokens).toBeUndefined();
    expect(detail.modelTokensPerSecond).toBeUndefined();
  });

  test('takes first-token latency only from this chat model and provider', () => {
    const detail = getMessageUsageDetails(
      undefined,
      [
        record({ modality: 'image', timeFirstTokenMs: 2 }),
        record({ modelId: 'another-model', timeFirstTokenMs: 3 }),
        record({ providerId: 'another-provider', timeFirstTokenMs: 4 }),
        record({ timeFirstTokenMs: 90 }),
      ],
      CHAT_MODEL,
    );
    expect(detail.firstTokenMs).toBe(90);
  });

  test('leaves chat model speed unavailable when only image calls have timing', () => {
    const detail = getMessageUsageDetails(
      { providerPerformance: { measuredOutputTokens: 600, generationDurationMs: 30_000 } },
      [record({ modality: 'image', outputTokens: 600, timeCompletionMs: 30_000 }), record()],
      CHAT_MODEL,
    );
    expect(detail.modelTokensPerSecond).toBeUndefined();
  });

  test('weights speed by measured language durations and excludes unrelated or unmeasured calls', () => {
    const measured = { outputTokens: 1_000, timeCompletionMs: 1_000 };
    const detail = getMessageUsageDetails(
      undefined,
      [
        record({ ...measured, modality: 'image' }),
        record({ ...measured, modelId: 'another-model' }),
        record({ ...measured, providerId: 'another-provider' }),
        record({ ...measured, recordKind: 'legacy-aggregate' }),
        record({ outputTokens: 20, timeFirstTokenMs: 500, timeCompletionMs: 2_500 }),
        record({ outputTokens: 120, timeFirstTokenMs: 500, timeCompletionMs: 6_500 }),
        record({ outputTokens: 1_000 }),
        record({ outputTokens: null, timeCompletionMs: 1_000 }),
      ],
      CHAT_MODEL,
    );
    expect(detail.modelTokensPerSecond).toBe(17.5);
  });

  test('keeps missing timing or model identity unavailable and preserves measured zero output', () => {
    const measuredZero = record({ outputTokens: 0, timeCompletionMs: 1_000 });
    expect(getMessageUsageDetails(undefined, [measuredZero], CHAT_MODEL).modelTokensPerSecond).toBe(
      0,
    );
    expect(
      getMessageUsageDetails(undefined, [measuredZero], undefined).modelTokensPerSecond,
    ).toBeUndefined();
    expect(
      getMessageUsageDetails(undefined, [record({ timeCompletionMs: 0 })], CHAT_MODEL)
        .modelTokensPerSecond,
    ).toBeUndefined();
  });

  test('does not round a small positive charge to free', () => {
    expect(formatMessageUsageCost(0.000001, 'USD', 'en-US')).toBe('<$0.0001');
    expect(formatMessageUsageCost(0, 'USD', 'en-US')).toBe('$0.00');
  });

  test('merges overlapping tool spans and keeps total throughput distinct from model speed', () => {
    const detail = getMessageUsageDetails(
      {
        outputTokens: 100,
        runtimeTiming: {
          startedAt: 1_000,
          completedAt: 11_000,
          spans: [
            { id: 'a', kind: 'tool-execution', toolCallId: 'a', startedAt: 0, completedAt: 4_000 },
            {
              id: 'b',
              kind: 'tool-execution',
              toolCallId: 'b',
              startedAt: 3_000,
              completedAt: 6_000,
            },
            { id: 'c', kind: 'approval-wait', approvalId: 'c', toolCallId: 'c', startedAt: 8_000 },
          ],
        },
      },
      [],
      CHAT_MODEL,
    );
    expect(detail).toMatchObject({
      durationMs: 10_000,
      toolDurationMs: 5_000,
      approvalDurationMs: 3_000,
      endToEndTokensPerSecond: 10,
    });
    expect(detail.modelTokensPerSecond).toBeUndefined();
    expect(detail.firstTokenMs).toBeUndefined();
    expect(
      getMessageDurationMs({ runtimeTiming: { startedAt: 1_000, spans: [] } }),
    ).toBeUndefined();
    expect(
      getMessageUsageDetails(
        {
          outputTokens: 10,
          runtimeTiming: { startedAt: 1_000, completedAt: 1_000, spans: [] },
        },
        [],
        CHAT_MODEL,
      ).endToEndTokensPerSecond,
    ).toBeUndefined();
  });
});
