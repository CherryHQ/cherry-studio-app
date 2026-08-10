import {
  AiUsagePricingSnapshotSchema,
  AiUsageRecordEntrySchema,
  getAiUsageRecordTotalTokens,
} from '@shared/data/types/aiUsageRecord';

const entry = {
  id: '00000000-0000-7000-8000-000000000000',
  requestId: 'request-1',
  recordKind: 'invocation' as const,
  requestCount: 1,
  messageKind: 'chat' as const,
  messageId: 'message-1',
  providerId: 'openrouter',
  providerName: 'OpenRouter',
  sourceType: 'assistant' as const,
  sourceId: 'assistant-1',
  sourceName: 'Assistant',
  sourceIcon: null,
  modelId: 'openai/gpt-5',
  modelName: 'GPT-5',
  modality: 'language' as const,
  apiKeyId: 'key-1',
  apiKeyLabel: 'Primary',
  apiKeyMasked: 'sk-****',
  apiKeyAttribution: 'explicit' as const,
  authMethod: null,
  inputTokens: 100,
  outputTokens: 25,
  totalTokens: 125,
  reasoningTokens: 5,
  noCacheTokens: 80,
  cacheReadTokens: 20,
  cacheWriteTokens: 0,
  imageCount: null,
  cost: 0.00125,
  costCurrency: 'USD' as const,
  costSource: 'computed' as const,
  costBreakdown: { input: 0.001, output: 0.00025 },
  pricingSnapshot: {
    currency: 'USD' as const,
    inputPerMillionTokens: 10,
    outputPerMillionTokens: 10,
    capturedAt: '2026-07-30T00:00:00.000Z',
  },
  timeFirstTokenMs: 120,
  timeCompletionMs: 900,
  timeThinkingMs: 300,
  createdAt: '2026-07-30T00:00:01.000Z',
};

describe('AiUsageRecordEntrySchema', () => {
  it('parses the complete desktop-compatible record shape', () => {
    expect(AiUsageRecordEntrySchema.parse(entry)).toEqual(entry);
  });

  it('rejects unknown fields and non-finite or unsafe counts', () => {
    expect(() => AiUsageRecordEntrySchema.parse({ ...entry, unknown: true })).toThrow();
    expect(() =>
      AiUsageRecordEntrySchema.parse({ ...entry, cost: Number.POSITIVE_INFINITY }),
    ).toThrow();
    expect(() =>
      AiUsageRecordEntrySchema.parse({ ...entry, inputTokens: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
  });
});

describe('AiUsagePricingSnapshotSchema', () => {
  it('round-trips JSON pricing snapshots without dropping optional fields', () => {
    const snapshot = {
      currency: 'CNY' as const,
      inputPerMillionTokens: 1.25,
      outputPerMillionTokens: 5,
      cacheReadPerMillionTokens: 0.25,
      cacheWritePerMillionTokens: 1.5,
      perImage: { price: 0.1, unit: 'image' as const },
      capturedAt: '2026-07-30T00:00:00.000Z',
    };

    expect(AiUsagePricingSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(
      snapshot,
    );
  });
});

describe('getAiUsageRecordTotalTokens', () => {
  it('prefers provider totals and derives partial totals without treating unknown as zero', () => {
    expect(
      getAiUsageRecordTotalTokens({ inputTokens: 100, outputTokens: 20, totalTokens: 90 }),
    ).toBe(90);
    expect(
      getAiUsageRecordTotalTokens({ inputTokens: 100, outputTokens: 20, totalTokens: null }),
    ).toBe(120);
    expect(
      getAiUsageRecordTotalTokens({ inputTokens: 100, outputTokens: null, totalTokens: null }),
    ).toBe(100);
    expect(
      getAiUsageRecordTotalTokens({ inputTokens: null, outputTokens: null, totalTokens: null }),
    ).toBeNull();
  });
});
