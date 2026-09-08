import type { AiUsageRecordEntry } from '@/shared/data/types/aiUsageRecord';

import {
  formatMessageUsageCost,
  getMessageDurationMs,
  getMessageTokenUsage,
  getMessageUsageDetails,
} from '../messageUsage';

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
    expect(getMessageTokenUsage({ inputTokens: 0, outputTokens: 0 }).totalTokens).toBe(0);
    expect(
      getMessageTokenUsage({ inputTokens: 100, outputTokens: 20, totalTokens: 0 }).totalTokens,
    ).toBe(120);
    const detail = getMessageUsageDetails(undefined, [
      record({ cacheReadTokens: 60, reasoningTokens: 10 }),
    ]);
    expect(detail).toMatchObject({ totalTokens: 120, cacheReadTokens: 60, reasoningTokens: 10 });
    expect(detail.noCacheTokens).toBeUndefined();
  });

  test('retains reported token details when another provider omits that field', () => {
    const detail = getMessageUsageDetails(undefined, [record({ cacheReadTokens: 40 }), record()]);
    expect(detail.totalTokens).toBe(240);
    expect(detail.cacheReadTokens).toBe(40);
    expect(detail.reasoningTokens).toBeUndefined();
  });

  test('includes image costs without losing language tokens and derives missing totals per call', () => {
    const detail = getMessageUsageDetails(undefined, [
      record({ totalTokens: 500 }),
      record({ totalTokens: null }),
      record({
        modality: 'image',
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        cost: 1,
        costCurrency: 'CNY',
        costSource: 'provider',
      }),
    ]);
    expect(detail).toMatchObject({
      inputTokens: 200,
      outputTokens: 40,
      totalTokens: 620,
      requestCount: 3,
    });
    expect(detail.costs).toMatchObject([{ amount: 1, currency: 'CNY' }]);
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
    const detail = getMessageUsageDetails(stats, [
      record({ cacheReadTokens: 60, cost: 0.7, costCurrency: 'USD', costSource: 'provider' }),
    ]);
    expect(detail).toMatchObject({
      totalTokens: 120,
      requestCount: 3,
      modelTokensPerSecond: 10,
      hasUnpricedRecords: true,
    });
    expect(detail.costs).toBe(stats.costs);
    expect(detail.cacheReadTokens).toBeUndefined();
  });

  test('identifies historical request estimates without counting a message as one new invocation', () => {
    const detail = getMessageUsageDetails(undefined, [
      record({ recordKind: 'legacy-aggregate', requestCount: 2 }),
      record(),
    ]);
    expect(detail).toMatchObject({ requestCount: 3, estimatedRequestCount: 2 });
    expect(getMessageUsageDetails(undefined, []).requestCount).toBeUndefined();
  });

  test('does not use an image call as the first language-token measurement', () => {
    const detail = getMessageUsageDetails(undefined, [
      record({ modality: 'image', timeFirstTokenMs: 2 }),
      record({ timeFirstTokenMs: 90 }),
    ]);
    expect(detail.firstTokenMs).toBe(90);
  });

  test('keeps currencies and price sources separate and identifies unpriced usage', () => {
    const detail = getMessageUsageDetails(undefined, [
      record({ cost: 0.1, costCurrency: 'USD', costSource: 'provider' }),
      record({ cost: 0.2, costCurrency: 'USD', costSource: 'computed' }),
      record({ cost: 1, costCurrency: 'CNY', costSource: 'computed' }),
      record(),
    ]);
    expect(detail.costs).toHaveLength(2);
    const usd = detail.costs.find((cost) => cost.currency === 'USD');
    expect(usd).toMatchObject({
      currency: 'USD',
      providerReportedRequestCount: 1,
      computedRequestCount: 1,
    });
    expect(usd?.amount).toBeCloseTo(0.3);
    expect(detail.costs.find((cost) => cost.currency === 'CNY')).toMatchObject({ amount: 1 });
    expect(detail.hasUnpricedRecords).toBe(true);
    expect(getMessageUsageDetails(undefined, []).costs).toEqual([]);
    expect(
      getMessageUsageDetails(undefined, [
        record({ cost: 0, costCurrency: 'USD', costSource: 'computed' }),
      ]).costs[0].amount,
    ).toBe(0);
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
      getMessageUsageDetails({ outputTokens: 10, timeCompletionMs: 0 }, []).endToEndTokensPerSecond,
    ).toBeUndefined();
  });
});
