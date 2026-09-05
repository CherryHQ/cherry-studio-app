import type {
  AiUsageRecordStatsQueryParams,
  AiUsageRecordStatsResponse,
  AiUsageRecordTimelineBucket,
  AiUsageRecordTimelineQueryParams,
} from '@/shared/data/api/schemas/aiUsageRecords';

import type {
  AiUsageModelIdentity,
  AiUsageRankingGroup,
  AiUsageRankingItem,
  AiUsageTimeRange,
  AiUsageWeekPage,
  AiUsageWeeklyData,
  AiUsageWeekSeries,
} from '../types';
import {
  addCalendarDays,
  normalizeLocalDate,
  parseLocalDateKey,
  toLocalDateKey,
} from './aiUsageCalendar';

const WEEK_DAY_COUNT = 7;
const TOP_MODEL_COUNT = 3;
const CHART_INTERVAL_COUNT = 5;

export const AI_USAGE_WEEK_PAGE_COUNT = 8;
export const AI_USAGE_CURRENT_WEEK_PAGE_INDEX = AI_USAGE_WEEK_PAGE_COUNT - 1;

export function getAiUsageWeekRange(referenceDate = new Date()): AiUsageTimeRange {
  const today = normalizeLocalDate(referenceDate);
  const daysAfterMonday = (today.getDay() + 6) % WEEK_DAY_COUNT;
  const monday = addCalendarDays(today, -daysAfterMonday);
  const sunday = addCalendarDays(monday, WEEK_DAY_COUNT - 1);

  return {
    from: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime(),
    to: new Date(
      sunday.getFullYear(),
      sunday.getMonth(),
      sunday.getDate(),
      23,
      59,
      59,
      999,
    ).getTime(),
  };
}

export function getAiUsageDayRange(dateKey: string): AiUsageTimeRange {
  const date = parseLocalDateKey(dateKey);

  return {
    from: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
    to: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime(),
  };
}

export function getAiUsageRecentWeekPages(referenceDate = new Date()): AiUsageWeekPage[] {
  return Array.from({ length: AI_USAGE_WEEK_PAGE_COUNT }, (_, index) => {
    const weeksAgo = AI_USAGE_CURRENT_WEEK_PAGE_INDEX - index;
    const correspondingDate = addCalendarDays(referenceDate, -weeksAgo * WEEK_DAY_COUNT);
    const range = getAiUsageWeekRange(correspondingDate);

    return {
      key: toLocalDateKey(new Date(range.from)),
      range,
      weeksAgo,
    };
  });
}

export function getAiUsageWeekDefaultDateKey(referenceDate: Date, weeksAgo: number): string {
  return toLocalDateKey(addCalendarDays(referenceDate, -weeksAgo * WEEK_DAY_COUNT));
}

export function getAiUsageWeekTimelineQuery(range: AiUsageTimeRange) {
  return {
    from: range.from,
    groupBy: 'model',
    limit: TOP_MODEL_COUNT,
    metric: 'tokens',
    to: range.to,
  } satisfies AiUsageRecordTimelineQueryParams;
}

/**
 * Rebuilt through {@link getAiUsageWeekRange} rather than by subtracting a fixed
 * offset, so the result matches the adjacent page's range verbatim and reuses its
 * cached timeline instead of issuing a second query.
 */
export function getAiUsagePreviousWeekRange(range: AiUsageTimeRange): AiUsageTimeRange {
  return getAiUsageWeekRange(addCalendarDays(new Date(range.from), -WEEK_DAY_COUNT));
}

/** Signed share of change against the previous week, or undefined when it cannot be expressed. */
export function getAiUsageWeekOverWeekChange(
  totalTokens: number,
  previousTotalTokens: number | undefined,
): number | undefined {
  if (previousTotalTokens === undefined || previousTotalTokens <= 0) return undefined;

  const change = (totalTokens - previousTotalTokens) / previousTotalTokens;
  return change === 0 ? undefined : change;
}

export function getAiUsageDayStatsQuery(dateKey: string, groupBy: AiUsageRankingGroup) {
  const range = getAiUsageDayRange(dateKey);

  return {
    from: range.from,
    groupBy,
    limit: 50,
    metric: 'tokens',
    to: range.to,
  } satisfies AiUsageRecordStatsQueryParams;
}

export function displayAiUsageModelId(modelId: string | null | undefined): string {
  if (!modelId) return '';
  const separatorIndex = modelId.indexOf('::');
  return separatorIndex >= 0 ? modelId.slice(separatorIndex + 2) : modelId;
}

export function getAiUsageChartScale(maximumTokens: number, averageTokens: number) {
  if (maximumTokens <= 0) {
    return { maximum: 1, tickValues: [1, 0] };
  }

  const targetMaximum = maximumTokens * 1.1;
  const step = getNiceChartStep(targetMaximum / CHART_INTERVAL_COUNT);
  let maximum = Math.ceil(targetMaximum / step) * step;
  const normalizedAverage = Math.max(0, Math.min(averageTokens, maximumTokens));

  if (normalizedAverage <= 0) {
    return { maximum, tickValues: [maximum, 0] };
  }

  // The average replaces its nearest regular tick. Keeping the neighboring
  // ticks leaves a stable label gap on both sides of the average line.
  const nearestTick = Math.round(normalizedAverage / step) * step;
  const lowerTick = Math.max(0, nearestTick - step);
  const upperTick = nearestTick + step;
  maximum = Math.max(maximum, upperTick);

  const tickValues = [...new Set([maximum, upperTick, lowerTick, 0])].sort(
    (left, right) => right - left,
  );

  return { maximum, tickValues };
}

export function buildAiUsageWeeklyData(
  buckets: readonly AiUsageRecordTimelineBucket[],
  range: AiUsageTimeRange,
  todayDateKey: string,
): AiUsageWeeklyData {
  const dateKeys = getDateKeys(range);
  const positions = new Map(dateKeys.map((dateKey, index) => [dateKey, index]));
  const groupedSeries = new Map<string, AiUsageWeekSeries>();
  let otherSeries: AiUsageWeekSeries | undefined;

  for (const bucket of buckets) {
    const position = positions.get(bucket.date);
    if (position === undefined || bucket.date > todayDateKey || bucket.totalTokens <= 0) continue;

    if (bucket.isOther) {
      otherSeries ??= createWeekSeries(otherIdentity(), dateKeys.length);
      addSeriesValue(otherSeries, position, bucket.totalTokens);
      continue;
    }

    const identity = modelIdentity(bucket);
    const series = groupedSeries.get(identity.key) ?? createWeekSeries(identity, dateKeys.length);
    addSeriesValue(series, position, bucket.totalTokens);
    groupedSeries.set(identity.key, series);
  }

  const rankedSeries = [...groupedSeries.values()].sort(
    (left, right) => right.totalTokens - left.totalTokens,
  );
  const visibleSeries = rankedSeries.slice(0, TOP_MODEL_COUNT);
  const overflowSeries = rankedSeries.slice(TOP_MODEL_COUNT);

  if (overflowSeries.length > 0) {
    otherSeries ??= createWeekSeries(otherIdentity(), dateKeys.length);
    for (const series of overflowSeries) {
      for (const [index, value] of series.values.entries()) {
        addSeriesValue(otherSeries, index, value);
      }
    }
  }

  const series = [
    ...visibleSeries,
    ...(otherSeries && otherSeries.totalTokens > 0 ? [otherSeries] : []),
  ];
  const days = dateKeys.map((dateKey, index) => ({
    dateKey,
    isFuture: dateKey > todayDateKey,
    totalTokens: series.reduce((total, item) => total + (item.values[index] ?? 0), 0),
  }));
  const elapsedDays = days.filter((day) => !day.isFuture);
  const elapsedTokens = elapsedDays.reduce((total, day) => total + day.totalTokens, 0);

  return {
    averageTokens: elapsedDays.length > 0 ? elapsedTokens / elapsedDays.length : 0,
    days,
    series,
    totalTokens: days.reduce((total, day) => total + day.totalTokens, 0),
  };
}

export function buildAiUsageRanking(
  response: AiUsageRecordStatsResponse | undefined,
  groupBy: AiUsageRankingGroup,
): AiUsageRankingItem[] {
  if (!response) return [];

  // Each bucket carries its own grouping, so a payload cached under the previous
  // grouping still renders while the new one loads instead of collapsing to empty.
  const items = response.buckets
    .flatMap((bucket): AiUsageRankingItem[] => {
      if (bucket.totalTokens <= 0) return [];
      if (bucket.groupBy === 'model') {
        return [{ ...modelIdentity(bucket), groupBy: 'model', totalTokens: bucket.totalTokens }];
      }
      if (bucket.groupBy === 'provider') {
        return [
          { ...providerIdentity(bucket), groupBy: 'provider', totalTokens: bucket.totalTokens },
        ];
      }
      return [];
    })
    .sort((left, right) => right.totalTokens - left.totalTokens);
  const itemsGroupBy = items[0]?.groupBy ?? groupBy;

  return response.other.totalTokens > 0
    ? [
        ...items,
        {
          ...otherIdentity(),
          groupBy: itemsGroupBy,
          key: `other:${itemsGroupBy}`,
          totalTokens: response.other.totalTokens,
        },
      ]
    : items;
}

function getDateKeys(range: AiUsageTimeRange): string[] {
  const dateKeys: string[] = [];

  for (
    let date = normalizeLocalDate(new Date(range.from));
    date.getTime() <= range.to;
    date = addCalendarDays(date, 1)
  ) {
    dateKeys.push(toLocalDateKey(date));
  }

  return dateKeys;
}

function getNiceChartStep(value: number): number {
  const safeValue = Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(safeValue));
  const normalized = safeValue / magnitude;
  const multiplier = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return multiplier * magnitude;
}

function modelIdentity(identity: {
  modelId?: string | null;
  providerId?: string | null;
  providerName?: string | null;
}): AiUsageModelIdentity {
  const modelId = identity.modelId ?? null;
  const providerId = identity.providerId ?? null;

  return {
    isOther: false,
    key: `model:${JSON.stringify([providerId, modelId])}`,
    modelId,
    providerId,
    providerName: identity.providerName ?? null,
  };
}

function providerIdentity(identity: {
  providerId?: string | null;
  providerName?: string | null;
}): AiUsageModelIdentity {
  const providerId = identity.providerId ?? null;

  return {
    isOther: false,
    key: `provider:${JSON.stringify(providerId)}`,
    modelId: null,
    providerId,
    providerName: identity.providerName ?? null,
  };
}

function otherIdentity(): AiUsageModelIdentity {
  return {
    isOther: true,
    key: 'other',
    modelId: null,
    providerId: null,
    providerName: null,
  };
}

function createWeekSeries(identity: AiUsageModelIdentity, valueCount: number): AiUsageWeekSeries {
  return { ...identity, totalTokens: 0, values: Array.from({ length: valueCount }, () => 0) };
}

function addSeriesValue(series: AiUsageWeekSeries, index: number, value: number): void {
  series.values[index] = (series.values[index] ?? 0) + value;
  series.totalTokens += value;
}
