import type {
  AiUsageRecordFilters,
  AiUsageRecordGranularity,
  AiUsageRecordMetric,
  AiUsageRecordStatsBucket,
  AiUsageRecordStatsMetrics,
  AiUsageRecordTimelineBucket,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { Currency } from '@/shared/data/types/model';

import { addCalendarDays, parseLocalDateKey, toLocalDateKey } from './aiUsageCalendar';

export type UsagePeriod = 'today' | '7d' | '30d' | 'all' | 'custom';
export type UsageRange = { from: number; to: number; period: UsagePeriod };
export type UsagePoint = { date: string; from: number; to: number; value: number | null };

export function usageRange(period: Exclude<UsagePeriod, 'custom'>, now = new Date()): UsageRange {
  const start = addCalendarDays(now, period === '7d' ? -6 : period === '30d' ? -29 : 0);
  start.setHours(0, 0, 0, 0);
  const end = addCalendarDays(now, 1);
  end.setHours(0, 0, 0, 0);
  return { from: period === 'all' ? 0 : start.getTime(), to: end.getTime() - 1, period };
}

export function customUsageRange(from: string, to: string): UsageRange | null {
  const valid = (key: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(key) && toLocalDateKey(parseLocalDateKey(key)) === key;
  if (!valid(from) || !valid(to) || from > to) return null;
  const start = parseLocalDateKey(from);
  start.setHours(0, 0, 0, 0);
  const end = addCalendarDays(parseLocalDateKey(to), 1);
  end.setHours(0, 0, 0, 0);
  if (start.getTime() < 0) return null;
  return { from: start.getTime(), to: end.getTime() - 1, period: 'custom' };
}

export function usageMetricValue(
  item: Pick<AiUsageRecordStatsMetrics, 'totalTokens' | 'requestCount' | 'totalCost'>,
  metric: AiUsageRecordMetric,
): number {
  return metric === 'cost'
    ? item.totalCost
    : metric === 'requests'
      ? item.requestCount
      : item.totalTokens;
}

export function usageKnownMetricValue(
  item: Pick<
    AiUsageRecordStatsMetrics,
    | 'totalTokens'
    | 'requestCount'
    | 'totalCost'
    | 'recordCount'
    | 'tokenRecordCount'
    | 'costRecordCount'
  >,
  metric: AiUsageRecordMetric,
): number | null {
  if (
    item.recordCount > 0 &&
    ((metric === 'tokens' && item.tokenRecordCount === 0) ||
      (metric === 'cost' && item.costRecordCount === 0))
  )
    return null;
  return usageMetricValue(item, metric);
}

export function usageGroupFilters(bucket: AiUsageRecordStatsBucket): AiUsageRecordFilters {
  switch (bucket.groupBy) {
    case 'provider':
      return { providerId: bucket.providerId };
    case 'model':
      return { providerId: bucket.providerId, modelId: bucket.modelId };
    case 'source':
      return { sourceType: bucket.sourceType, sourceId: bucket.sourceId };
    case 'apiKey':
      return {
        providerId: bucket.providerId,
        apiKeyId: bucket.apiKeyId,
        apiKeyAttribution: bucket.apiKeyAttribution,
        authMethod: bucket.authMethod,
      };
  }
}

export function usageGroupKey(bucket: AiUsageRecordStatsBucket): string {
  return JSON.stringify(usageGroupFilters(bucket));
}

export function usagePoints(
  buckets: AiUsageRecordTimelineBucket[],
  range: UsageRange,
  firstRecordAt: number | null,
  granularity: AiUsageRecordGranularity,
  metric: AiUsageRecordMetric,
): UsagePoint[] {
  const first = range.from === 0 ? (firstRecordAt ?? range.to) : range.from;
  const cursor = new Date(first);
  cursor.setHours(0, 0, 0, 0);
  if (granularity !== 'day') cursor.setDate(1);
  if (granularity === 'year') cursor.setMonth(0);
  const values = new Map(
    buckets.map((bucket) => [bucket.date, usageKnownMetricValue(bucket, metric)]),
  );
  const points: UsagePoint[] = [];
  while (cursor.getTime() <= range.to) {
    const date = toLocalDateKey(cursor);
    const from = Math.max(first, cursor.getTime());
    if (granularity === 'year') cursor.setFullYear(cursor.getFullYear() + 1);
    else if (granularity === 'month') cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
    points.push({
      date,
      from,
      to: Math.min(range.to, cursor.getTime() - 1),
      value: values.has(date) ? values.get(date)! : 0,
    });
  }
  return points;
}

export function formatUsageNumber(
  value: number | null,
  locale: string,
  fractionDigits = 0,
): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat(locale, { maximumFractionDigits: fractionDigits }).format(value);
}

export function formatUsageCost(value: number | null, currency: Currency, locale: string): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
        maximumFractionDigits: 4,
      }).format(value);
}

export function formatUsageDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
}
