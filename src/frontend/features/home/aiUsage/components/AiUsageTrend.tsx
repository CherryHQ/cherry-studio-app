import { Button, Slider } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { formatCompactNumber } from '@/frontend/utils/compactNumber';
import type {
  AiUsageRecordAnalyticsResponse,
  AiUsageRecordMetric,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { Currency } from '@/shared/data/types/model';

import {
  formatUsageCost,
  formatUsageDate,
  formatUsageNumber,
  usagePoints,
  usageKnownMetricValue,
  type UsagePoint,
  type UsageRange,
} from '../utils/aiUsageAnalytics';
import { parseLocalDateKey } from '../utils/aiUsageCalendar';
import { AiUsageValueRow } from './AiUsageBreakdown';

export function AiUsageTrend({
  data,
  range,
  metric,
  currency,
  locale,
  onOpenRecords,
}: {
  data: AiUsageRecordAnalyticsResponse;
  range: UsageRange;
  metric: AiUsageRecordMetric;
  currency: Currency;
  locale: string;
  onOpenRecords: (point: UsagePoint) => void;
}) {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<string>();
  const points = usagePoints(
    data.timeline.buckets,
    range,
    data.firstRecordAt,
    data.granularity,
    metric,
  );
  const selected = points.find((point) => point.date === selectedDate);
  const max = Math.max(0, ...points.map((point) => point.value ?? 0));
  const cost = data.timeline.costTotals.find((item) => item.currency === currency)?.total ?? null;
  const total =
    metric === 'cost'
      ? cost
      : metric === 'requests'
        ? data.stats.totals.requestCount
        : data.composition.totalTokens;
  const value = selected ? selected.value : total;
  const selectedBucket = selected
    ? data.timeline.buckets.find((bucket) => bucket.date === selected.date)
    : undefined;
  const requestCount = selected
    ? (selectedBucket?.requestCount ?? 0)
    : data.stats.totals.requestCount;
  const totalTokens = selected
    ? selectedBucket
      ? usageKnownMetricValue(selectedBucket, 'tokens')
      : 0
    : data.composition.totalTokens;
  const costs = selected
    ? data.timeline.dailyCosts.filter((item) => item.date === selected.date)
    : data.timeline.costTotals;
  const unpricedCount = selected
    ? (selectedBucket?.unpricedRequestCount ?? 0)
    : data.stats.totals.unpricedRequestCount;
  const estimatedCount = selected
    ? (selectedBucket?.estimatedRequestCount ?? 0)
    : data.stats.totals.estimatedRequestCount;
  const formatted =
    metric === 'cost' ? formatUsageCost(value, currency, locale) : formatUsageNumber(value, locale);
  const metricLabel =
    metric === 'cost'
      ? t('aiUsage.cost')
      : metric === 'requests'
        ? t('chat.messageUsage.requests')
        : t('aiUsage.tokens');
  const dateFormatter = new Intl.DateTimeFormat(
    locale,
    data.granularity === 'year'
      ? { year: 'numeric' }
      : data.granularity === 'month'
        ? { year: '2-digit', month: 'short' }
        : { month: 'short', day: 'numeric' },
  );

  return (
    <View className="gap-5 rounded-3xl bg-card p-5">
      <View className="gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-muted-foreground text-sm">
            {selected
              ? dateFormatter.format(parseLocalDateKey(selected.date))
              : t('aiUsage.rangeTotal')}
          </Text>
          {selected ? (
            <Button size="xs" variant="ghost" onPress={() => setSelectedDate(undefined)}>
              {t('common.clear')}
            </Button>
          ) : null}
        </View>
        <Text
          className="font-semibold text-4xl text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatted}
        </Text>
        <Text className="text-muted-foreground text-sm">{metricLabel}</Text>
      </View>
      <View className="gap-2">
        <Text className="text-muted-foreground text-xs">
          {metric === 'cost' ? formatUsageCost(max, currency, locale) : formatCompactNumber(max)}
        </Text>
        {/* Bar taps yield to page scrolling. The shared Slider owns scrubbing and
            provides a larger touch target and an accessible adjustment action. */}
        <View
          className="flex-row items-end"
          style={{ height: 148, gap: points.length > 30 ? 1 : 4 }}
        >
          {points.map((point) => (
            <Pressable
              accessibilityLabel={`${dateFormatter.format(parseLocalDateKey(point.date))}, ${metric === 'cost' ? formatUsageCost(point.value, currency, locale) : formatUsageNumber(point.value, locale)} ${metricLabel}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedDate === point.date }}
              className="h-full flex-1 justify-end"
              key={point.date}
              onPress={() => setSelectedDate(point.date)}
            >
              <View
                className={
                  selected && selected.date !== point.date
                    ? 'rounded-t-sm bg-chart-5'
                    : 'rounded-t-sm bg-chart-1'
                }
                style={{
                  height:
                    point.value === null || point.value === 0
                      ? 2
                      : Math.max(4, (point.value / (max || 1)) * 148),
                }}
              />
            </Pressable>
          ))}
        </View>
        <View className="flex-row justify-between gap-4">
          <Text className="text-muted-foreground text-xs">
            {points[0] ? dateFormatter.format(parseLocalDateKey(points[0].date)) : ''}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {points.at(-1) ? dateFormatter.format(parseLocalDateKey(points.at(-1)!.date)) : ''}
          </Text>
        </View>
        {points.length > 1 ? (
          <Slider
            accessibilityLabel={t('aiUsage.selectPeriod')}
            min={0}
            max={points.length - 1}
            step={1}
            value={selected ? points.indexOf(selected) : points.length - 1}
            onValueChange={(index) => setSelectedDate(points[Math.round(index)]?.date)}
          />
        ) : null}
      </View>
      <View className="gap-1">
        {metric !== 'tokens' ? (
          <AiUsageValueRow
            label={t('aiUsage.tokens')}
            value={formatUsageNumber(totalTokens, locale)}
          />
        ) : null}
        {metric !== 'requests' ? (
          <AiUsageValueRow
            label={t('chat.messageUsage.requests')}
            value={formatUsageNumber(requestCount, locale)}
          />
        ) : null}
        {costs
          .filter((cost) => metric !== 'cost' || cost.currency !== currency)
          .map((cost) => (
            <AiUsageValueRow
              key={cost.currency}
              label={t('aiUsage.cost')}
              value={formatUsageCost(cost.total, cost.currency, locale)}
            />
          ))}
        {unpricedCount > 0 ? (
          <Text className="text-muted-foreground text-xs">
            {t('aiUsage.unpricedHint', { value: formatUsageNumber(unpricedCount, locale) })}
          </Text>
        ) : null}
        {estimatedCount > 0 ? (
          <Text className="text-muted-foreground text-xs">{t('aiUsage.legacyHint')}</Text>
        ) : null}
      </View>
      {selected ? (
        <Button size="sm" variant="secondary" onPress={() => onOpenRecords(selected)}>
          {t('aiUsage.viewRecords')}
        </Button>
      ) : (
        <Text className="text-muted-foreground text-xs">
          {formatUsageDate(
            range.period === 'all' ? (data.firstRecordAt ?? range.to) : range.from,
            locale,
          )}{' '}
          – {formatUsageDate(range.to, locale)}
        </Text>
      )}
    </View>
  );
}
