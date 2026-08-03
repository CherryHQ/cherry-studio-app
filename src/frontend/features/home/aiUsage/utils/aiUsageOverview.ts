import type { AiUsageRecordTimelineBucket } from '@/shared/data/api/schemas/aiUsageRecords';

import type { AiUsageLevel, AiUsageOverview, AiUsageTimeRange, AiUsageWindowKey } from '../types';
import {
  addCalendarDays,
  normalizeLocalDate,
  parseLocalDateKey,
  toLocalDateKey,
} from './aiUsageCalendar';

const aiUsageWindowDays: Record<AiUsageWindowKey, number> = {
  '30d': 30,
  '90d': 90,
  '183d': 183,
  '365d': 365,
};

export function getAiUsageWindowRange(
  windowKey: AiUsageWindowKey,
  endDate = new Date(),
): AiUsageTimeRange {
  const normalizedEndDate = normalizeLocalDate(endDate);
  const startDate = addCalendarDays(normalizedEndDate, -aiUsageWindowDays[windowKey] + 1);

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

export function buildAiUsageOverview(
  buckets: readonly AiUsageRecordTimelineBucket[],
  range: AiUsageTimeRange,
): AiUsageOverview {
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

  const activeDateKeys = new Set<string>();
  let peakDay: AiUsageOverview['peakDay'];
  let cacheReadTokens = 0;
  let cacheObservedTokens = 0;
  let totalTokens = 0;

  for (const bucket of selectedBuckets) {
    cacheReadTokens += bucket.totalCacheReadTokens;
    cacheObservedTokens +=
      bucket.totalNoCacheTokens + bucket.totalCacheReadTokens + bucket.totalCacheWriteTokens;
    totalTokens += bucket.totalTokens;
    if (bucket.requestCount > 0) {
      activeDateKeys.add(bucket.date);
    }
    if (bucket.totalTokens > 0 && (!peakDay || bucket.totalTokens > peakDay.totalTokens)) {
      peakDay = { dateKey: bucket.date, totalTokens: bucket.totalTokens };
    }
  }

  return {
    activeDays: activeDateKeys.size,
    cacheHitRate: cacheObservedTokens > 0 ? cacheReadTokens / cacheObservedTokens : undefined,
    cacheObservedTokens,
    data,
    longestStreak: getLongestStreak(activeDateKeys),
    peakDay,
    totalTokens,
  };
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

function getLongestStreak(dateKeys: ReadonlySet<string>): number {
  const sortedDateKeys = [...dateKeys].sort();
  let current = 0;
  let longest = 0;
  let previousDateKey: string | undefined;

  for (const dateKey of sortedDateKeys) {
    const expectedDateKey = previousDateKey
      ? toLocalDateKey(addCalendarDays(parseLocalDateKey(previousDateKey), 1))
      : undefined;
    current = expectedDateKey === dateKey ? current + 1 : 1;
    longest = Math.max(longest, current);
    previousDateKey = dateKey;
  }

  return longest;
}
