import type {
  AiUsageRecordStatsResponse,
  AiUsageRecordTimelineBucket,
} from '@cherrystudio/universal/data/api/schemas/aiUsageRecords';

import type {
  AiUsageModelIdentity,
  AiUsageModelUsage,
  AiUsageTimeRange,
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

export function displayAiUsageModelId(modelId: string | null | undefined): string {
  if (!modelId) return '';
  const separatorIndex = modelId.indexOf('::');
  return separatorIndex >= 0 ? modelId.slice(separatorIndex + 2) : modelId;
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

export function buildAiUsageModelUsage(
  response: AiUsageRecordStatsResponse | undefined,
): AiUsageModelUsage[] {
  if (!response) return [];

  const models = response.buckets
    .flatMap((bucket): AiUsageModelUsage[] => {
      if (bucket.groupBy !== 'model' || bucket.totalTokens <= 0) return [];
      return [{ ...modelIdentity(bucket), totalTokens: bucket.totalTokens }];
    })
    .sort((left, right) => right.totalTokens - left.totalTokens);

  return response.other.totalTokens > 0
    ? [...models, { ...otherIdentity(), totalTokens: response.other.totalTokens }]
    : models;
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
