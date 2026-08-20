import type { AiUsageRecordTimelineBucket } from '@/shared/data/api/schemas/aiUsageRecords';

import type { AiUsageData, AiUsageLevel, AiUsageTimeRange } from '../types';
import { addCalendarDays, normalizeLocalDate, toLocalDateKey } from './aiUsageCalendar';

const AI_USAGE_SUMMARY_DAYS = 183;

export function getAiUsageSummaryRange(endDate = new Date()): AiUsageTimeRange {
  const normalizedEndDate = normalizeLocalDate(endDate);
  const startDate = addCalendarDays(normalizedEndDate, -AI_USAGE_SUMMARY_DAYS + 1);

  return {
    from: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime(),
    to: new Date(
      normalizedEndDate.getFullYear(),
      normalizedEndDate.getMonth(),
      normalizedEndDate.getDate(),
      23,
      59,
      59,
      999,
    ).getTime(),
  };
}

export function buildAiUsageCalendarData(
  buckets: readonly AiUsageRecordTimelineBucket[],
  range: AiUsageTimeRange,
): AiUsageData {
  const firstDateKey = toLocalDateKey(new Date(range.from));
  const lastDateKey = toLocalDateKey(new Date(range.to));
  const selectedBuckets = buckets
    .filter((bucket) => bucket.date >= firstDateKey && bucket.date <= lastDateKey)
    .sort((left, right) => left.date.localeCompare(right.date));
  const tokensByDate = new Map(selectedBuckets.map((bucket) => [bucket.date, bucket.totalTokens]));
  const positiveTokenValues = selectedBuckets
    .map((bucket) => bucket.totalTokens)
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  const thresholds = [
    quantile(positiveTokenValues, 0.25),
    quantile(positiveTokenValues, 0.5),
    quantile(positiveTokenValues, 0.75),
  ] as const;
  const data: Record<string, AiUsageLevel> = {};

  for (
    let date = normalizeLocalDate(new Date(range.from));
    date.getTime() <= range.to;
    date = addCalendarDays(date, 1)
  ) {
    const dateKey = toLocalDateKey(date);
    data[dateKey] = getAiUsageLevel(tokensByDate.get(dateKey) ?? 0, thresholds);
  }

  return data;
}

export function getFirstAiUsageDateKey(data: AiUsageData): string | undefined {
  return Object.keys(data)
    .sort()
    .find((dateKey) => data[dateKey] > 0);
}

function quantile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function getAiUsageLevel(
  value: number,
  thresholds: readonly [number, number, number],
): AiUsageLevel {
  if (value <= 0) return 0;
  if (value <= thresholds[0]) return 1;
  if (value <= thresholds[1]) return 2;
  if (value <= thresholds[2]) return 3;
  return 4;
}
