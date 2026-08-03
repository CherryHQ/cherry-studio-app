import type { AiUsageRecordTimelineBucket } from '@/shared/data/api/schemas/aiUsageRecords';

import { addCalendarDays, normalizeLocalDate } from '../aiUsageCalendar';
import { buildAiUsageOverview, getAiUsageWindowRange } from '../aiUsageOverview';

describe('AI usage overview', () => {
  test.each([
    ['30d', 30],
    ['90d', 90],
    ['365d', 365],
  ] as const)('builds an inclusive %s local-date range', (windowKey, expectedDays) => {
    const endDate = new Date(2026, 7, 2, 12);
    const range = getAiUsageWindowRange(windowKey, endDate);
    const overview = buildAiUsageOverview([], range);

    expect(Object.keys(overview.data)).toHaveLength(expectedDays);
    expect(Object.keys(overview.data).at(-1)).toBe('2026-08-02');
    expect(new Date(range.from).getHours()).toBe(0);
    expect(new Date(range.to).getHours()).toBe(23);
    expect(new Date(range.to).getMilliseconds()).toBe(999);
  });

  test('steps across a daylight-saving transition by calendar date', () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = 'America/New_York';

    try {
      const range = getAiUsageWindowRange('30d', new Date(2026, 2, 15, 12));
      const dateKeys = Object.keys(buildAiUsageOverview([], range).data);

      expect(dateKeys).toHaveLength(30);
      expect(dateKeys[0]).toBe('2026-02-14');
      expect(dateKeys.at(-1)).toBe('2026-03-15');
    } finally {
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    }
  });

  test('fills missing dates and uses desktop token quantiles for intensity', () => {
    const range = rangeForDays(new Date(2026, 0, 1), 6);
    const overview = buildAiUsageOverview(
      [
        bucket('2026-01-01', 10),
        bucket('2026-01-02', 20),
        bucket('2026-01-04', 30),
        bucket('2026-01-05', 40),
        bucket('2026-01-06', 50),
      ],
      range,
    );

    expect(overview.data).toEqual({
      '2026-01-01': 1,
      '2026-01-02': 1,
      '2026-01-03': 0,
      '2026-01-04': 2,
      '2026-01-05': 3,
      '2026-01-06': 4,
    });
  });

  test('keeps small samples and tied values deterministic', () => {
    const singleDay = rangeForDays(new Date(2026, 0, 1), 1);
    expect(buildAiUsageOverview([bucket('2026-01-01', 10)], singleDay).data).toEqual({
      '2026-01-01': 1,
    });

    const tiedRange = rangeForDays(new Date(2026, 0, 1), 4);
    expect(
      buildAiUsageOverview(
        [
          bucket('2026-01-01', 10),
          bucket('2026-01-02', 10),
          bucket('2026-01-03', 10),
          bucket('2026-01-04', 20),
        ],
        tiedRange,
      ).data,
    ).toEqual({
      '2026-01-01': 1,
      '2026-01-02': 1,
      '2026-01-03': 1,
      '2026-01-04': 4,
    });
  });

  test('derives totals, cache usage, active days, streak and peak day from the same timeline', () => {
    const range = rangeForDays(new Date(2026, 0, 1), 5);
    const overview = buildAiUsageOverview(
      [
        bucket('2026-01-01', 100, 2, { noCache: 40, read: 50, write: 10 }),
        bucket('2026-01-02', 0, 1),
        bucket('2026-01-04', 300, 3, { noCache: 80, read: 160, write: 20 }),
        bucket('2026-01-05', 200, 2),
      ],
      range,
    );

    expect(overview).toMatchObject({
      activeDays: 4,
      cacheHitRate: 0.375,
      cacheObservedTokens: 560,
      longestStreak: 2,
      peakDay: { dateKey: '2026-01-04', totalTokens: 300 },
      totalTokens: 600,
    });
  });

  test('returns zero metrics and no peak day without usage records', () => {
    const overview = buildAiUsageOverview([], rangeForDays(new Date(2026, 0, 1), 2));

    expect(overview).toMatchObject({
      activeDays: 0,
      cacheObservedTokens: 0,
      data: { '2026-01-01': 0, '2026-01-02': 0 },
      longestStreak: 0,
      totalTokens: 0,
    });
    expect(overview.cacheHitRate).toBeUndefined();
    expect(overview.peakDay).toBeUndefined();
  });
});

function rangeForDays(firstDate: Date, days: number) {
  const first = normalizeLocalDate(firstDate);
  const last = addCalendarDays(first, days - 1);
  return {
    from: new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime(),
    to: new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999).getTime(),
  };
}

function bucket(
  date: string,
  totalTokens: number,
  requestCount = 1,
  cacheTokens: { noCache: number; read: number; write: number } = {
    noCache: totalTokens,
    read: 0,
    write: 0,
  },
): AiUsageRecordTimelineBucket {
  return {
    costCurrency: null,
    date,
    estimatedRequestCount: 0,
    recordCount: requestCount,
    requestCount,
    totalCacheReadTokens: cacheTokens.read,
    totalCacheWriteTokens: cacheTokens.write,
    totalCost: 0,
    totalNoCacheTokens: cacheTokens.noCache,
    totalTokens,
    unpricedRequestCount: 0,
  };
}
