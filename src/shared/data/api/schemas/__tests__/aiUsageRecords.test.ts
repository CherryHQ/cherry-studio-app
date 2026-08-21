import {
  AI_USAGE_RECORD_MAX_RANGE_DAYS,
  AiUsageRecordListQuerySchema,
  AiUsageRecordStatsQuerySchema,
  AiUsageRecordTimelineQuerySchema,
} from '../aiUsageRecords';

describe('AI usage record query schemas', () => {
  const from = Date.UTC(2026, 0, 1);
  const to = Date.UTC(2026, 0, 31);

  test('applies list and aggregate defaults', () => {
    expect(AiUsageRecordListQuerySchema.parse({})).toMatchObject({
      limit: 50,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(AiUsageRecordStatsQuerySchema.parse({ groupBy: 'provider', from, to })).toMatchObject({
      metric: 'tokens',
      limit: 10,
    });
  });

  test('requires a currency for monetary ordering and aggregation', () => {
    expect(AiUsageRecordListQuerySchema.safeParse({ sortBy: 'cost' }).success).toBe(false);
    expect(
      AiUsageRecordStatsQuerySchema.safeParse({ groupBy: 'provider', from, to, metric: 'cost' })
        .success,
    ).toBe(false);
    expect(
      AiUsageRecordListQuerySchema.safeParse({ sortBy: 'cost', costCurrency: 'CNY' }).success,
    ).toBe(true);
  });

  test('requires message kind and id together', () => {
    expect(AiUsageRecordListQuerySchema.safeParse({ messageKind: 'chat' }).success).toBe(false);
    expect(AiUsageRecordListQuerySchema.safeParse({ messageId: 'message-1' }).success).toBe(false);
    expect(
      AiUsageRecordListQuerySchema.safeParse({ messageKind: 'chat', messageId: 'message-1' })
        .success,
    ).toBe(true);
  });

  test('rejects reversed and overlong aggregate ranges', () => {
    expect(AiUsageRecordTimelineQuerySchema.safeParse({ from: to, to: from }).success).toBe(false);
    expect(
      AiUsageRecordTimelineQuerySchema.safeParse({
        from,
        to: from + (AI_USAGE_RECORD_MAX_RANGE_DAYS + 1) * 24 * 60 * 60 * 1000,
      }).success,
    ).toBe(false);
  });
});
