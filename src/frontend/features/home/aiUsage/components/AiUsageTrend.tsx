import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import InfoIcon from '@cherrystudio/app-icons/icons/info';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, InfoPopover } from '@cherrystudio/ui/components';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { formatCompactNumber } from '@/frontend/utils/compactNumber';
import type {
  AiUsageRecordAnalyticsResponse,
  AiUsageRecordGranularity,
  AiUsageRecordMetric,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { Currency } from '@/shared/data/types/model';

import { useMeasuredWidth } from '../hooks/useMeasuredWidth';
import {
  formatUsageCost,
  formatUsageNumber,
  usageKnownMetricValue,
  usagePoints,
  usageTimelineTotals,
  usageTokenParts,
  type UsagePoint,
  type UsageRange,
} from '../utils/aiUsageAnalytics';
import { parseLocalDateKey } from '../utils/aiUsageCalendar';
import { AiUsageMetricTabs } from './AiUsageBreakdown';

type UsageChartPoint = UsagePoint & { parts: ReturnType<typeof usageTokenParts> };

export function AiUsageTrend({
  data,
  range,
  metric,
  locale,
  onMetricChange,
  onOpenRecords,
}: {
  data: AiUsageRecordAnalyticsResponse;
  range: UsageRange;
  metric: AiUsageRecordMetric;
  locale: string;
  onMetricChange: (metric: AiUsageRecordMetric) => void;
  onOpenRecords: (point?: UsagePoint) => void;
}) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const selection = useSharedValue(-1);
  const totals = usageTimelineTotals(data.timeline.buckets);
  const totalsByDate = new Map(totals.map((item) => [item.date, item]));
  const points: UsageChartPoint[] = usagePoints(
    totals,
    range,
    data.firstRecordAt,
    data.granularity,
    metric === 'cost' ? 'tokens' : metric,
  ).map((point) => {
    const bucket = totalsByDate.get(point.date);
    return {
      ...point,
      parts: usageTokenParts(
        point.value,
        bucket?.totalInputTokens ?? 0,
        bucket?.totalOutputTokens ?? 0,
      ),
    };
  });
  const selected = selectedIndex === undefined ? undefined : points[selectedIndex];
  const isEmpty = data.stats.totals.recordCount === 0;
  const totalTokens = isEmpty ? 0 : data.composition.totalTokens;
  const requestCount = data.stats.totals.requestCount;
  const unpricedCount = data.stats.totals.unpricedRequestCount;
  const costs = data.timeline.costTotals;
  const dateFormatter = new Intl.DateTimeFormat(
    locale,
    data.granularity === 'year'
      ? { year: 'numeric' }
      : data.granularity === 'month'
        ? { year: '2-digit', month: 'short' }
        : { month: 'short', day: 'numeric' },
  );
  const costByDate = new Map(
    data.timeline.dailyCosts.map((item) => [`${item.date}:${item.currency}`, item.total]),
  );
  const charts =
    metric === 'cost' && costs.length > 0
      ? costs.map((cost) => ({
          key: cost.currency,
          currency: cost.currency,
          total: cost.total,
          color: cost.currency === 'USD' ? 'bg-chart-1' : 'bg-chart-3',
          points: points.map((point) => ({
            ...point,
            value:
              costByDate.get(`${point.date}:${cost.currency}`) ??
              (totalsByDate.get(point.date)?.unpricedRequestCount ? null : 0),
          })),
        }))
      : [
          {
            key: metric,
            currency: undefined,
            total: metric === 'cost' ? null : usageKnownMetricValue(data.stats.totals, metric),
            color: 'bg-chart-1',
            points: metric === 'cost' ? points.map((point) => ({ ...point, value: null })) : points,
          },
        ];
  const metrics: [string, string][] = [];
  if (metric !== 'requests')
    metrics.push([t('aiUsage.calls'), formatUsageNumber(requestCount, locale)]);
  if (metric !== 'tokens')
    metrics.push([
      t('aiUsage.tokens'),
      totalTokens === null ? '—' : formatCompactNumber(totalTokens),
    ]);
  if (metric !== 'cost') {
    for (const cost of costs)
      metrics.push([
        cost.currency,
        formatUsageCost(cost.total, cost.currency, locale, 'narrowSymbol'),
      ]);
  }
  if (metric === 'cost' && data.composition.imageCount !== null)
    metrics.push([t('aiUsage.images'), formatUsageNumber(data.composition.imageCount, locale)]);
  const hasUnclassified = points.some((point) => point.parts.unclassified > 0);
  const selectionValue = selected
    ? charts
        .map((chart) => {
          const value = chart.points[selectedIndex!]?.value ?? null;
          return chart.currency
            ? formatUsageCost(value, chart.currency, locale)
            : value === null
              ? '—'
              : metric === 'tokens'
                ? formatCompactNumber(value)
                : formatUsageNumber(value, locale);
        })
        .join(' · ')
    : '';

  return (
    <View className="gap-5">
      <View className="gap-4 rounded-3xl bg-card p-5">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <Text
            className={
              metric === 'cost'
                ? 'font-medium text-base text-foreground'
                : 'font-semibold text-4xl text-foreground'
            }
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {metric === 'cost'
              ? t('aiUsage.cost')
              : metric === 'tokens'
                ? totalTokens === null
                  ? '—'
                  : formatCompactNumber(totalTokens)
                : formatUsageNumber(requestCount, locale)}
          </Text>
          <AiUsageMetricTabs metric={metric} onChange={onMetricChange} />
        </View>
        <View className="min-h-8 flex-row flex-wrap items-center justify-between gap-2">
          {selected ? (
            <>
              <Text className="text-muted-foreground text-xs">
                {dateFormatter.format(parseLocalDateKey(selected.date))}
              </Text>
              <View className="min-w-0 shrink flex-row items-center gap-2">
                <Text className="shrink text-right font-medium text-foreground text-xs">
                  {selectionValue}
                </Text>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<XIcon />}
                  accessibilityLabel={t('common.clear')}
                  onPress={() => {
                    selection.set(-1);
                    setSelectedIndex(undefined);
                  }}
                />
              </View>
            </>
          ) : metric === 'tokens' && !isEmpty ? (
            <View className="flex-row flex-wrap items-center gap-4">
              {[
                [t('chat.messageUsage.input'), 'bg-chart-1'],
                [t('chat.messageUsage.output'), 'bg-chart-2'],
                ...(hasUnclassified ? [[t('aiUsage.unclassifiedTokens'), 'bg-chart-5']] : []),
              ].map(([label, color]) => (
                <View key={label} className="flex-row items-center gap-1.5">
                  <View className={`size-1.5 rounded-full ${color}`} />
                  <Text className="text-muted-foreground text-xs">{label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {charts.map((chart, index) => (
          <View
            className={index ? 'gap-4 border-t border-border-subtle pt-5' : 'gap-4'}
            key={chart.key}
          >
            {chart.currency ? (
              <View className="flex-row items-baseline justify-between gap-3">
                <Text
                  className="shrink font-semibold text-2xl text-foreground"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatUsageCost(chart.total, chart.currency, locale, 'narrowSymbol')}
                </Text>
                <Text className="text-muted-foreground text-xs">{chart.currency}</Text>
              </View>
            ) : null}
            <AiUsageChart
              points={chart.points}
              isEmpty={isEmpty}
              metric={metric}
              currency={chart.currency}
              locale={locale}
              granularity={data.granularity}
              selectedIndex={selectedIndex}
              selection={selection}
              onSelectIndex={setSelectedIndex}
              height={chart.currency ? 112 : 184}
              color={chart.color}
            />
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-5 px-1">
        {metrics.map(([label, amount]) => (
          <View className="min-w-0 flex-1 basis-[27%] gap-1.5" key={label}>
            <Text className="text-muted-foreground text-xs">{label}</Text>
            <Text
              className="font-semibold text-2xl text-foreground"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {amount}
            </Text>
          </View>
        ))}
      </View>
      <InfoPopover
        accessibilityLabel={t('aiUsage.costInfo')}
        text={[
          t('aiUsage.costCoverageDetails', {
            reported: formatUsageNumber(data.providerReportedRequestCount, locale),
            computed: formatUsageNumber(data.computedRequestCount, locale),
            unpriced: formatUsageNumber(unpricedCount, locale),
          }),
          data.stats.totals.estimatedRequestCount > 0 ? t('aiUsage.legacyHint') : '',
        ]
          .filter(Boolean)
          .join('\n')}
      >
        <View className="min-h-8 flex-row items-center gap-1.5 px-1">
          <InfoIcon className="size-3.5 text-muted-foreground" />
          <Text className="text-muted-foreground text-xs">
            {unpricedCount > 0
              ? t('aiUsage.unpricedCalls', { value: formatUsageNumber(unpricedCount, locale) })
              : t('aiUsage.costInfo')}
          </Text>
        </View>
      </InfoPopover>
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpenRecords(selected)}
        className="min-h-14 flex-row items-center justify-between gap-3 border-t border-border-subtle px-1 py-3"
      >
        <Text className="min-w-0 flex-1 text-foreground text-sm">{t('aiUsage.callDetails')}</Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-muted-foreground text-xs">
            {formatUsageNumber(
              selected ? (totalsByDate.get(selected.date)?.requestCount ?? 0) : requestCount,
              locale,
            )}
          </Text>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </View>
      </Pressable>
    </View>
  );
}

function AiUsageChart({
  points,
  isEmpty,
  selectedIndex,
  selection,
  onSelectIndex,
  metric,
  currency,
  locale,
  granularity,
  height,
  color,
}: {
  points: UsageChartPoint[];
  isEmpty: boolean;
  selectedIndex?: number;
  selection: SharedValue<number>;
  onSelectIndex: (index: number | undefined) => void;
  metric: AiUsageRecordMetric;
  currency?: Currency;
  locale: string;
  granularity: AiUsageRecordGranularity;
  height: number;
  color: string;
}) {
  const { t } = useTranslation();
  const drag = useSharedValue({ x: 0, y: 0, previous: -1, active: false });
  const { ref, width, onLayout } = useMeasuredWidth();
  const selected = selectedIndex === undefined ? undefined : points[selectedIndex];
  const value = selected?.value ?? null;
  const max = Math.max(0, ...points.map((point) => point.value ?? 0));
  const magnitude = max > 0 ? 10 ** Math.floor(Math.log10(max)) : 1;
  const ceiling = (Math.ceil((max / magnitude) * 2) * magnitude) / 2;
  const format = (value: number | null) =>
    currency ? formatUsageCost(value, currency, locale) : formatUsageNumber(value, locale);
  const metricLabel = t(
    metric === 'tokens'
      ? 'aiUsage.tokens'
      : metric === 'requests'
        ? 'aiUsage.calls'
        : 'aiUsage.cost',
  );
  const dateFormatter = new Intl.DateTimeFormat(
    locale,
    granularity === 'year'
      ? { year: 'numeric' }
      : granularity === 'month'
        ? { year: '2-digit', month: 'short' }
        : { month: 'short', day: 'numeric' },
  );
  const dateLabel = (point: UsagePoint) => dateFormatter.format(parseLocalDateKey(point.date));
  // Native recognizers own tap slop and pan activation. A vertical direction
  // rejects chart panning before activation so the page can scroll. A cancelled
  // pan restores its initial selection and cannot produce a trailing tap.
  const pointCount = points.length;
  const gesture = useMemo(() => {
    const select = (x: number) => {
      if (width <= 0) return;
      const index = Math.max(0, Math.min(pointCount - 1, Math.floor((x / width) * pointCount)));
      selection.set(index);
      onSelectIndex(index);
    };
    const tap = Gesture.Tap()
      .enabled(!isEmpty)
      .runOnJS(true)
      .onEnd((event, success) => {
        if (success) select(event.x);
      });
    const pan = Gesture.Pan()
      .enabled(!isEmpty)
      .runOnJS(true)
      .onTouchesDown((event) => {
        const touch = event.allTouches[0];
        if (touch) drag.set({ x: touch.x, y: touch.y, previous: selection.get(), active: false });
      })
      .onTouchesMove((event, manager) => {
        const touch = event.allTouches[0];
        if (
          !drag.get().active &&
          touch &&
          Math.abs(touch.y - drag.get().y) > Math.abs(touch.x - drag.get().x)
        )
          manager.fail();
      })
      .onStart((event) => {
        drag.set({ ...drag.get(), active: true });
        select(event.x);
      })
      .onUpdate((event) => select(event.x))
      .onFinalize((_event, success) => {
        if (!success && drag.get().active) {
          selection.set(drag.get().previous);
          onSelectIndex(drag.get().previous < 0 ? undefined : drag.get().previous);
        }
      });
    return Gesture.Race(pan, tap);
  }, [drag, isEmpty, onSelectIndex, pointCount, selection, width]);

  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <GestureDetector gesture={gesture}>
          <View
            ref={ref}
            onLayout={onLayout}
            className="flex-1"
            style={{ height: height }}
            accessible
            accessibilityRole={isEmpty ? 'image' : 'adjustable'}
            accessibilityLabel={t(isEmpty ? 'aiUsage.noRecords' : 'aiUsage.selectPeriod')}
            accessibilityValue={
              isEmpty
                ? undefined
                : {
                    min: 0,
                    max: points.length - 1,
                    now: selectedIndex ?? points.length - 1,
                    text: selected
                      ? `${dateLabel(selected)}, ${format(value)} ${metricLabel}`
                      : t('aiUsage.rangeTotal'),
                  }
            }
            accessibilityActions={
              isEmpty ? undefined : [{ name: 'increment' }, { name: 'decrement' }]
            }
            onAccessibilityAction={(event) => {
              const next = Math.max(
                0,
                Math.min(
                  points.length - 1,
                  (selectedIndex ?? points.length - 1) +
                    (event.nativeEvent.actionName === 'increment' ? 1 : -1),
                ),
              );
              selection.set(next);
              onSelectIndex(next);
            }}
            testID="ai-usage-chart"
          >
            <View className="absolute inset-0 justify-between" pointerEvents="none">
              {[0, 1, 2].map((line) => (
                <View className="border-t border-border-subtle" key={line} />
              ))}
            </View>
            {isEmpty ? (
              <View
                className="absolute inset-0 items-center justify-center"
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <View className="h-full flex-row items-end justify-center gap-2 px-5">
                  {[0.24, 0.48, 0.37, 0.74, 0.56, 0.91, 0.64].map((fraction) => (
                    <View
                      key={fraction}
                      className="w-4 rounded-t-sm border border-dashed border-border-strong bg-secondary"
                      style={{ height: height * fraction * 0.8 }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <View
              className="h-full flex-row items-end"
              style={{ gap: points.length > 30 ? 1 : 3 }}
              pointerEvents="none"
            >
              {points.map((point, index) => (
                <View className="h-full min-w-0 flex-1 justify-end" key={point.date}>
                  {selectedIndex === index ? (
                    <View className="absolute inset-0 border-x border-border-strong bg-secondary" />
                  ) : null}
                  <View
                    className={`overflow-hidden rounded-t-sm ${metric === 'tokens' ? '' : color}`}
                    style={{ height: point.value ? (point.value / (ceiling || 1)) * height : 0 }}
                  >
                    {metric === 'tokens' && point.value ? (
                      <>
                        <View className="bg-chart-5" style={{ flex: point.parts.unclassified }} />
                        <View className="bg-chart-2" style={{ flex: point.parts.output }} />
                        <View className="bg-chart-1" style={{ flex: point.parts.input }} />
                      </>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </GestureDetector>
        <View className="justify-between" style={{ height: height }}>
          {[1, 0.5, 0].map((fraction) => (
            <Text className="text-muted-foreground text-xs" key={fraction}>
              {max === 0 && fraction > 0
                ? ''
                : metric === 'cost'
                  ? formatUsageNumber(ceiling * fraction, locale, 4)
                  : formatCompactNumber(ceiling * fraction)}
            </Text>
          ))}
        </View>
      </View>
      <View className="flex-row justify-between gap-2">
        {[
          points[0],
          points.length > 2 ? points[Math.floor(points.length / 2)] : undefined,
          points.length > 1 ? points.at(-1) : undefined,
        ].map((point) =>
          point ? (
            <Text className="text-muted-foreground text-xs" key={point.date}>
              {dateLabel(point)}
            </Text>
          ) : null,
        )}
      </View>
    </View>
  );
}
