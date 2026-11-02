import type {
  AiUsageRecordStatsBucket,
  AiUsageRecordTimelineBucket,
} from '@/shared/data/api/schemas/aiUsageRecords';

import {
  customUsageRange,
  usageGroupFilters,
  usageKnownMetricValue,
  usagePoints,
  usageRange,
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
