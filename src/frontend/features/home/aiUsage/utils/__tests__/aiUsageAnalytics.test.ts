import type {
  AiUsageRecordStatsBucket,
  AiUsageRecordTimelineBucket,
} from '@/shared/data/api/schemas/aiUsageRecords';

import {
  customUsageRange,
  formatUsageCost,
  usageGroupFilters,
  usageKnownMetricValue,
  usagePoints,
  usageRange,
  usageTimelineTotals,
  usageTokenParts,
} from '../aiUsageAnalytics';

const metrics = {
  costCurrency: null,
  totalCost: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  totalNoCacheTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  recordCount: 1,
  tokenRecordCount: 0,
  costRecordCount: 0,
  requestCount: 1,
  estimatedRequestCount: 0,
  unpricedRequestCount: 1,
} as const;

describe('usage analytics presentation', () => {
  test('keeps small positive costs distinct from zero and missing costs', () => {
    expect(formatUsageCost(0.000001, 'USD', 'en-US', 'narrowSymbol')).toBe('<$0.0001');
    expect(formatUsageCost(0.000001, 'CNY', 'en-US', 'narrowSymbol')).toBe('<¥0.0001');
    expect(formatUsageCost(0.000001, 'USD', 'en-US')).toBe('<USD\u00a00.0001');
    expect(formatUsageCost(0.0001, 'USD', 'en-US', 'narrowSymbol')).toBe('$0.0001');
    expect(formatUsageCost(0, 'USD', 'en-US', 'narrowSymbol')).toBe('$0.00');
    expect(formatUsageCost(null, 'USD', 'en-US')).toBe('—');
  });

  test('keeps custom dates inclusive and rejects invalid calendar dates', () => {
    expect(customUsageRange('2026-02-30', '2026-03-01')).toBeNull();
    expect(customUsageRange('2026-03-02', '2026-03-01')).toBeNull();
    const range = customUsageRange('2024-02-29', '2026-03-01')!;
    expect(new Date(range.from).getHours()).toBe(0);
    expect(new Date(range.to).getHours()).toBe(23);
    expect(new Date(range.to).getMilliseconds()).toBe(999);
    expect(range.to - range.from).toBeGreaterThan(366 * 86_400_000);
  });

  test('fills calendar days across DST without shifting record drill-down boundaries', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const range = usageRange('7d', new Date(2026, 2, 10, 12));
      const points = usagePoints([], range, null, 'day', 'tokens');
      expect(points.map((point) => point.date)).toEqual([
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
        '2026-03-09',
        '2026-03-10',
      ]);
      expect(points[4].to - points[4].from + 1).toBe(23 * 60 * 60 * 1000);
      expect(points[4].to + 1).toBe(points[5].from);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  test('preserves full history, zero-use periods and unknown token values', () => {
    const first = new Date(2022, 0, 15, 12).getTime();
    const range = usageRange('all', new Date(2026, 9, 15, 12));
    const bucket: AiUsageRecordTimelineBucket = { ...metrics, date: '2022-01-01' };
    const points = usagePoints([bucket], range, first, 'month', 'tokens');
    expect(points).toHaveLength(58);
    expect(points[0]).toMatchObject({ from: first, date: '2022-01-01', value: null });
    expect(points[1].value).toBe(0);
    expect(points.at(-1)?.date).toBe('2026-10-01');
    expect(usageKnownMetricValue(metrics, 'cost')).toBeNull();
    expect(usageKnownMetricValue({ ...metrics, costRecordCount: 1 }, 'cost')).toBe(0);
  });

  test('sums every model and Other once before generating chart points', () => {
    const date = '2026-10-29';
    const totals = usageTimelineTotals([
      {
        ...metrics,
        date,
        modelId: 'first',
        totalTokens: 100,
        totalInputTokens: 60,
        totalOutputTokens: 40,
        tokenRecordCount: 1,
      },
      {
        ...metrics,
        date,
        modelId: 'second',
        totalTokens: 50,
        totalInputTokens: 30,
        tokenRecordCount: 1,
      },
      {
        ...metrics,
        date,
        isOther: true,
        totalTokens: 30,
        totalOutputTokens: 10,
        tokenRecordCount: 1,
      },
    ]);
    const points = usagePoints(totals, customUsageRange(date, date)!, null, 'day', 'tokens');
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(180);
    expect(totals[0].requestCount).toBe(3);
    expect(totals[0].totalInputTokens).toBe(90);
    expect(totals[0].totalOutputTokens).toBe(50);
    expect(usageKnownMetricValue(totals[0], 'cost')).toBeNull();
  });

  test('keeps missing and inconsistent token splits unclassified instead of inventing a ratio', () => {
    expect(usageTokenParts(100, 60, 40)).toEqual({ input: 60, output: 40, unclassified: 0 });
    expect(usageTokenParts(100, 60, 0)).toEqual({ input: 60, output: 0, unclassified: 40 });
    expect(usageTokenParts(100, 0, 0)).toEqual({ input: 0, output: 0, unclassified: 100 });
    expect(usageTokenParts(100, 80, 40)).toEqual({ input: 0, output: 0, unclassified: 100 });
    expect(usageTokenParts(null, 60, 40)).toEqual({ input: 0, output: 0, unclassified: 0 });
  });

  test('retains nullable credential identity when drilling into unknown keys', () => {
    const bucket: AiUsageRecordStatsBucket = {
      ...metrics,
      groupBy: 'apiKey',
      providerId: 'provider-a',
      providerName: 'Provider',
      apiKeyId: null,
      apiKeyLabel: null,
      apiKeyMasked: null,
      apiKeyAttribution: 'auth',
      authMethod: 'oauth',
    };
    expect(usageGroupFilters(bucket)).toEqual({
      providerId: 'provider-a',
      apiKeyId: null,
      apiKeyAttribution: 'auth',
      authMethod: 'oauth',
    });
  });
});
