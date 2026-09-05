import type { AiUsageRecordTimelineBucket } from '@/shared/data/api/schemas/aiUsageRecords';

import { addCalendarDays, normalizeLocalDate } from '../aiUsageCalendar';
import {
  buildAiUsageCalendarData,
  getAiUsageSummaryRange,
  getFirstAiUsageDateKey,
} from '../aiUsageOverview';

describe('AI usage overview', () => {
  test('finds the earliest day with usage for the animation origin', () => {
    expect(
      getFirstAiUsageDateKey({
        '2026-02-01': 0,
        '2026-04-15': 2,
        '2026-03-20': 1,
      }),
    ).toBe('2026-03-20');
    expect(getFirstAiUsageDateKey({ '2026-02-01': 0, '2026-02-02': 0 })).toBeUndefined();
  });

  test('builds an inclusive 183-day local-date range', () => {
    const endDate = new Date(2026, 7, 2, 12);
    const range = getAiUsageSummaryRange(endDate);
    const data = buildAiUsageCalendarData([], range);

    expect(Object.keys(data)).toHaveLength(183);
    expect(Object.keys(data).at(-1)).toBe('2026-08-02');
    expect(new Date(range.from).getHours()).toBe(0);
    expect(new Date(range.to).getHours()).toBe(23);
    expect(new Date(range.to).getMilliseconds()).toBe(999);
  });

  test('steps across a daylight-saving transition by calendar date', () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = 'America/New_York';

    try {
      const range = getAiUsageSummaryRange(new Date(2026, 2, 15, 12));
      const dateKeys = Object.keys(buildAiUsageCalendarData([], range));

      expect(dateKeys).toHaveLength(183);
      expect(dateKeys[0]).toBe('2025-09-14');
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
    const data = buildAiUsageCalendarData(
      [
        bucket('2026-01-01', 10),
        bucket('2026-01-02', 20),
        bucket('2026-01-04', 30),
        bucket('2026-01-05', 40),
        bucket('2026-01-06', 50),
      ],
      range,
    );

    expect(data).toEqual({
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
    expect(buildAiUsageCalendarData([bucket('2026-01-01', 10)], singleDay)).toEqual({
      '2026-01-01': 1,
    });

    const tiedRange = rangeForDays(new Date(2026, 0, 1), 4);
    expect(
      buildAiUsageCalendarData(
        [
          bucket('2026-01-01', 10),
          bucket('2026-01-02', 10),
          bucket('2026-01-03', 10),
          bucket('2026-01-04', 20),
        ],
        tiedRange,
      ),
    ).toEqual({
      '2026-01-01': 1,
      '2026-01-02': 1,
      '2026-01-03': 1,
      '2026-01-04': 4,
    });
  });

  test('fills the summary with zero levels without usage records', () => {
    expect(buildAiUsageCalendarData([], rangeForDays(new Date(2026, 0, 1), 2))).toEqual({
      '2026-01-01': 0,
      '2026-01-02': 0,
    });
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

function bucket(date: string, totalTokens: number): AiUsageRecordTimelineBucket {
  return {
    costCurrency: null,
    date,
    estimatedRequestCount: 0,
    recordCount: 1,
    requestCount: 1,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalCost: 0,
    totalNoCacheTokens: totalTokens,
    totalTokens,
    unpricedRequestCount: 0,
  };
}
