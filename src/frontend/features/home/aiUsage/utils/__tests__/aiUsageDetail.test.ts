import type {
  AiUsageRecordStatsMetrics,
  AiUsageRecordStatsResponse,
  AiUsageRecordTimelineBucket,
} from '@/shared/data/api/schemas/aiUsageRecords';

import {
  buildAiUsageRanking,
  buildAiUsageWeeklyData,
  displayAiUsageModelId,
  getAiUsageDayStatsQuery,
  getAiUsageDayRange,
  getAiUsagePreviousWeekRange,
  getAiUsageRecentWeekPages,
  getAiUsageChartScale,
  getAiUsageWeekDefaultDateKey,
  getAiUsageWeekOverWeekChange,
  getAiUsageWeekRange,
  getAiUsageWeekTimelineQuery,
} from '../aiUsageDetail';

describe('AI usage detail', () => {
  test('places the average between neighboring readable axis ticks', () => {
    expect(getAiUsageChartScale(18_000, 14_000)).toEqual({
      maximum: 20_000,
      tickValues: [20_000, 10_000, 0],
    });
    expect(getAiUsageChartScale(22_000, 18_000)).toEqual({
      maximum: 25_000,
      tickValues: [25_000, 15_000, 0],
    });
  });

  test('keeps an outlying maximum visible while bracketing the average', () => {
    expect(getAiUsageChartScale(100_000, 14_000)).toEqual({
      maximum: 120_000,
      tickValues: [120_000, 40_000, 0],
    });
    expect(getAiUsageChartScale(0, 0)).toEqual({ maximum: 1, tickValues: [1, 0] });
  });

  test('builds a Monday-first local week and local day range', () => {
    const range = getAiUsageWeekRange(new Date(2026, 7, 2, 12));
    const dayRange = getAiUsageDayRange('2026-07-29');

    expect(new Date(range.from)).toEqual(new Date(2026, 6, 27));
    expect(new Date(range.to)).toEqual(new Date(2026, 7, 2, 23, 59, 59, 999));
    expect(new Date(dayRange.from)).toEqual(new Date(2026, 6, 29));
    expect(new Date(dayRange.to)).toEqual(new Date(2026, 6, 29, 23, 59, 59, 999));
  });

  test('steps across daylight-saving time using calendar dates', () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = 'America/New_York';

    try {
      const range = getAiUsageWeekRange(new Date(2026, 2, 8, 12));
      const data = buildAiUsageWeeklyData([], range, '2026-03-08');
      const pages = getAiUsageRecentWeekPages(new Date(2026, 2, 8, 12));

      expect(data.days.map((day) => day.dateKey)).toEqual([
        '2026-03-02',
        '2026-03-03',
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
      ]);
      expect(pages.at(-1)?.key).toBe('2026-03-02');
      expect(pages.at(-2)?.key).toBe('2026-02-23');
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  test('builds eight oldest-to-current week pages with matching weekdays', () => {
    const referenceDate = new Date(2026, 7, 2, 12);
    const pages = getAiUsageRecentWeekPages(referenceDate);

    expect(pages).toHaveLength(8);
    expect(pages.map((page) => page.key)).toEqual([
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
      '2026-06-29',
      '2026-07-06',
      '2026-07-13',
      '2026-07-20',
      '2026-07-27',
    ]);
    expect(pages.map((page) => page.weeksAgo)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(pages.map((page) => getAiUsageWeekDefaultDateKey(referenceDate, page.weeksAgo))).toEqual(
      [
        '2026-06-14',
        '2026-06-21',
        '2026-06-28',
        '2026-07-05',
        '2026-07-12',
        '2026-07-19',
        '2026-07-26',
        '2026-08-02',
      ],
    );
  });

  test('keeps week keys and corresponding weekdays across a year boundary', () => {
    const referenceDate = new Date(2026, 0, 2, 12);
    const pages = getAiUsageRecentWeekPages(referenceDate);

    expect(pages[0]?.key).toBe('2025-11-10');
    expect(pages.at(-1)?.key).toBe('2025-12-29');
    expect(getAiUsageWeekDefaultDateKey(referenceDate, 1)).toBe('2025-12-26');
    expect(getAiUsageWeekDefaultDateKey(referenceDate, 0)).toBe('2026-01-02');
  });

  test('builds aggregate query parameters from week and local day ranges', () => {
    const weekRange = getAiUsageWeekRange(new Date(2026, 7, 2, 12));
    const dayRange = getAiUsageDayRange('2026-07-29');

    expect(getAiUsageWeekTimelineQuery(weekRange)).toEqual({
      from: weekRange.from,
      groupBy: 'model',
      limit: 3,
      metric: 'tokens',
      to: weekRange.to,
    });
    expect(getAiUsageDayStatsQuery('2026-07-29', 'model')).toEqual({
      from: dayRange.from,
      groupBy: 'model',
      limit: 50,
      metric: 'tokens',
      to: dayRange.to,
    });
    expect(getAiUsageDayStatsQuery('2026-07-29', 'provider')).toEqual({
      from: dayRange.from,
      groupBy: 'provider',
      limit: 50,
      metric: 'tokens',
      to: dayRange.to,
    });
  });

  test('fills missing days, ranks three models, and merges overflow with server other', () => {
    const range = getAiUsageWeekRange(new Date(2026, 7, 5, 12));
    const data = buildAiUsageWeeklyData(
      [
        timelineBucket('2026-08-03', 100, 'provider-a', 'model-a'),
        timelineBucket('2026-08-04', 80, 'provider-b', 'model-b'),
        timelineBucket('2026-08-05', 60, 'provider-c', 'model-c'),
        timelineBucket('2026-08-03', 40, 'provider-d', 'model-d'),
        timelineBucket('2026-08-04', 20, null, null, true),
        timelineBucket('2026-08-06', 999, 'provider-future', 'model-future'),
      ],
      range,
      '2026-08-05',
    );

    expect(data.series.map((series) => series.modelId)).toEqual([
      'model-a',
      'model-b',
      'model-c',
      null,
    ]);
    expect(data.series.at(-1)).toMatchObject({ isOther: true, totalTokens: 60 });
    expect(data.days.map((day) => day.totalTokens)).toEqual([140, 100, 60, 0, 0, 0, 0]);
    expect(data.averageTokens).toBe(100);
    expect(data.totalTokens).toBe(300);
  });

  test('returns a stable empty week', () => {
    const range = getAiUsageWeekRange(new Date(2026, 7, 3, 12));
    const data = buildAiUsageWeeklyData([], range, '2026-08-03');

    expect(data.series).toEqual([]);
    expect(data.days).toHaveLength(7);
    expect(data.days.every((day) => day.totalTokens === 0)).toBe(true);
    expect(data.averageTokens).toBe(0);
  });

  test('resolves the previous week to the adjacent page range', () => {
    const pages = getAiUsageRecentWeekPages(new Date(2026, 7, 2, 12));
    const currentWeek = pages[pages.length - 1];
    const previousWeek = pages[pages.length - 2];

    // Must match verbatim, otherwise the query key differs and the cache is missed.
    expect(getAiUsagePreviousWeekRange(currentWeek.range)).toEqual(previousWeek.range);
  });

  test('expresses week-over-week change only when there is a baseline to compare', () => {
    expect(getAiUsageWeekOverWeekChange(250, 200)).toBeCloseTo(0.25);
    expect(getAiUsageWeekOverWeekChange(100, 200)).toBeCloseTo(-0.5);
    expect(getAiUsageWeekOverWeekChange(200, 200)).toBeUndefined();
    expect(getAiUsageWeekOverWeekChange(250, 0)).toBeUndefined();
    expect(getAiUsageWeekOverWeekChange(250, undefined)).toBeUndefined();
  });

  test('uses desktop model id display semantics', () => {
    expect(displayAiUsageModelId('provider::model-a')).toBe('model-a');
    expect(displayAiUsageModelId('vendor/model-a')).toBe('vendor/model-a');
    expect(displayAiUsageModelId(null)).toBe('');
  });

  test('builds a sorted model list and appends aggregate other usage', () => {
    const response: AiUsageRecordStatsResponse = {
      buckets: [
        statsBucket('provider-a', 'provider-a::model-a', 100),
        statsBucket('provider-b', 'model-b', 200),
      ],
      other: metrics(50),
      totals: metrics(350),
    };

    expect(buildAiUsageRanking(response, 'model')).toEqual([
      expect.objectContaining({ modelId: 'model-b', totalTokens: 200 }),
      expect.objectContaining({ modelId: 'provider-a::model-a', totalTokens: 100 }),
      expect.objectContaining({ groupBy: 'model', isOther: true, totalTokens: 50 }),
    ]);
  });

  test('builds a sorted provider list', () => {
    const response: AiUsageRecordStatsResponse = {
      buckets: [
        providerStatsBucket('provider-a', 'Provider A', 300),
        providerStatsBucket('provider-c', null, 100),
      ],
      other: metrics(25),
      totals: metrics(425),
    };

    expect(buildAiUsageRanking(response, 'provider')).toEqual([
      expect.objectContaining({
        groupBy: 'provider',
        modelId: null,
        providerId: 'provider-a',
        providerName: 'Provider A',
        totalTokens: 300,
      }),
      expect.objectContaining({ providerId: 'provider-c', totalTokens: 100 }),
      expect.objectContaining({ groupBy: 'provider', isOther: true, totalTokens: 25 }),
    ]);
  });

  test('renders the cached grouping while the requested one is still loading', () => {
    const response: AiUsageRecordStatsResponse = {
      buckets: [statsBucket('provider-b', 'model-b', 500)],
      other: metrics(25),
      totals: metrics(525),
    };

    expect(buildAiUsageRanking(response, 'provider')).toEqual([
      expect.objectContaining({ groupBy: 'model', modelId: 'model-b', totalTokens: 500 }),
      expect.objectContaining({ groupBy: 'model', isOther: true, totalTokens: 25 }),
    ]);
  });
});

function timelineBucket(
  date: string,
  totalTokens: number,
  providerId: string | null,
  modelId: string | null,
  isOther = false,
): AiUsageRecordTimelineBucket {
  return {
    costCurrency: null,
    date,
    estimatedRequestCount: 0,
    ...(isOther ? { isOther: true as const } : { modelId, providerId, providerName: providerId }),
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

function statsBucket(providerId: string, modelId: string, totalTokens: number) {
  return {
    ...metrics(totalTokens),
    groupBy: 'model' as const,
    modelId,
    providerId,
    providerName: providerId,
  };
}

function providerStatsBucket(providerId: string, providerName: string | null, totalTokens: number) {
  return {
    ...metrics(totalTokens),
    groupBy: 'provider' as const,
    providerId,
    providerName,
  };
}

function metrics(totalTokens: number): AiUsageRecordStatsMetrics {
  return {
    costCurrency: null,
    estimatedRequestCount: 0,
    recordCount: totalTokens > 0 ? 1 : 0,
    requestCount: totalTokens > 0 ? 1 : 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalCost: 0,
    totalInputTokens: totalTokens,
    totalNoCacheTokens: totalTokens,
    totalOutputTokens: 0,
    totalTokens,
    unpricedRequestCount: 0,
  };
}
