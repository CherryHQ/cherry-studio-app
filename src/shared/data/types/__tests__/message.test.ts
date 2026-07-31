import {
  type MessageData,
  MessageDataSchema,
  MessageIdSchema,
  MessageStatsSchema,
} from '../message';

describe('MessageDataSchema', () => {
  test('accepts parts-only message data', () => {
    const data: MessageData = {
      parts: [{ state: 'done', text: 'hello parts', type: 'text' }],
    };

    expect(MessageDataSchema.safeParse(data).success).toBe(true);
  });
});

describe('MessageIdSchema', () => {
  test('accepts any UUID version and rejects non-UUID IDs', () => {
    expect(MessageIdSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
    expect(MessageIdSchema.safeParse('018f6de0-7a89-7cc5-98ee-2d6f24ec9b1b').success).toBe(true);
    expect(MessageIdSchema.safeParse('mock-message-id').success).toBe(false);
  });
});

describe('MessageStatsSchema', () => {
  test('accepts the durable usage projection shape', () => {
    expect(
      MessageStatsSchema.parse({
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        inputTokenDetails: { noCacheTokens: 80, cacheReadTokens: 20 },
        outputTokenDetails: { textTokens: 15, reasoningTokens: 5 },
        requestCount: 2,
        estimatedRequestCount: 0,
        unpricedRequestCount: 1,
        costs: [
          {
            currency: 'USD',
            amount: 0.25,
            providerReportedRequestCount: 1,
            computedRequestCount: 0,
          },
        ],
        providerPerformance: { measuredOutputTokens: 20, generationDurationMs: 800 },
        runtimeTiming: {
          startedAt: 1_000,
          completedAt: 2_000,
          spans: [
            {
              id: 'tool:call-1',
              kind: 'tool-execution',
              toolCallId: 'call-1',
              toolName: 'search',
              startedAt: 1_100,
              completedAt: 1_300,
            },
            {
              id: 'approval:approval-1',
              kind: 'approval-wait',
              approvalId: 'approval-1',
              toolCallId: 'call-2',
              startedAt: 1_400,
            },
          ],
        },
      }),
    ).toBeDefined();
  });

  test('rejects invalid runtime timing spans', () => {
    expect(
      MessageStatsSchema.safeParse({
        runtimeTiming: {
          startedAt: 1_000,
          spans: [
            {
              id: 'approval:approval-1',
              kind: 'approval-wait',
              toolCallId: 'call-1',
              startedAt: 1_100,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  test('rejects legacy message-owned usage fields', () => {
    expect(MessageStatsSchema.safeParse({ promptTokens: 100 }).success).toBe(false);
    expect(MessageStatsSchema.safeParse({ cost: 0.25 }).success).toBe(false);
  });
});
