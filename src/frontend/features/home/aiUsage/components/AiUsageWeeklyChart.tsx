import CircleArrowDownIcon from '@cherrystudio/app-icons/icons/circle-arrow-down';
import CircleArrowUpIcon from '@cherrystudio/app-icons/icons/circle-arrow-up';
import { type ReactNode, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BarChart,
  type BarChartRenderBarProps,
  type BarChartSeries,
  type CartesianChartTheme,
} from 'react-native-chart-kit/v2';
import { Line, Path, Rect, Svg } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { useMeasuredWidth } from '../hooks/useMeasuredWidth';
import type { AiUsageWeeklyData } from '../types';
import { parseLocalDateKey } from '../utils/aiUsageCalendar';
import { displayAiUsageModelId, getAiUsageChartScale } from '../utils/aiUsageDetail';
import { createAiUsageTokenFormatter } from '../utils/formatAiUsageTokens';

const CHART_HEIGHT = 150;
const AXIS_WIDTH = 48;
const PLOT_TOP = 18;
const PLOT_RIGHT = 14;
const PLOT_BOTTOM = 34;
const PLOT_LEFT = 10;
const PLOT_HEIGHT = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const MIN_CHART_WIDTH = 220;
const AXIS_LABEL_HEIGHT = 16;
const AXIS_LABEL_MIN_GAP = 18;
const EMPTY_LABEL = () => '';
const WEEKLY_CHART_SKELETON_HEIGHTS = [32, 54, 41, 70, 51, 29, 60] as const;

type ChartDatum = Record<string, number | string> & { dateKey: string };

type AiUsageWeeklyChartProps = {
  data: AiUsageWeeklyData;
  isLoading: boolean;
  locale: string;
  onSelectDate: (dateKey: string) => void;
  selectedDateKey: string;
  statusAccessory?: ReactNode;
  /** Signed share of change against the previous week; omitted when not expressible. */
  weekOverWeekChange?: number;
};

export function AiUsageWeeklyChart({
  data,
  isLoading,
  locale,
  onSelectDate,
  selectedDateKey,
  statusAccessory,
  weekOverWeekChange,
}: AiUsageWeeklyChartProps) {
  const { t } = useTranslation();
  const { onLayout, ref: containerRef, width: containerWidth } = useMeasuredWidth();
  const [info, warning, muted, separator, success, foreground] = useThemeColor([
    'info',
    'warning',
    'muted-foreground',
    'border-strong',
    'success',
    'foreground',
  ]);
  const formatTokens = useMemo(() => createAiUsageTokenFormatter(locale), [locale]);
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }),
    [locale],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        weekday: 'short',
        year: 'numeric',
      }),
    [locale],
  );
  const selectedDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        weekday: 'short',
      }),
    [locale],
  );
  const selectedDayTokens =
    data.days.find((day) => day.dateKey === selectedDateKey)?.totalTokens ?? 0;
  const chartWidth = Math.max(0, containerWidth - AXIS_WIDTH);
  const maxDayTokens = Math.max(0, ...data.days.map((day) => day.totalTokens));
  const chartScale = getAiUsageChartScale(maxDayTokens, data.averageTokens);
  const chartMaximum = chartScale.maximum;
  const averageY = valueToY(data.averageTokens, chartMaximum);
  const hasAverage = data.averageTokens > 0;
  const chartData = useMemo<ChartDatum[]>(
    () =>
      data.days.map((day, dayIndex) => {
        const datum: ChartDatum = { dateKey: day.dateKey };
        const sourceSeries = data.series.length > 0 ? data.series : [undefined];
        for (const [seriesIndex, series] of sourceSeries.entries()) {
          datum[seriesValueKey(seriesIndex)] = series?.values[dayIndex] ?? 0;
        }
        return datum;
      }),
    [data.days, data.series],
  );
  const chartSeries = useMemo<BarChartSeries<ChartDatum>[]>(() => {
    if (data.series.length === 0) {
      return [
        {
          color: 'transparent',
          key: 'empty',
          label: '',
          yKey: seriesValueKey(0),
        },
      ];
    }

    return data.series.map((series, index) => ({
      color: getSeriesColor(series.isOther, index, success, info, warning, muted),
      key: series.key,
      label: series.isOther
        ? t('aiUsage.other')
        : displayAiUsageModelId(series.modelId) || t('aiUsage.unknownModel'),
      yKey: seriesValueKey(index),
    }));
  }, [data.series, info, muted, success, t, warning]);
  const chartTheme = useMemo<CartesianChartTheme>(
    () => ({
      axis: 'transparent',
      background: 'transparent',
      grid: 'transparent',
      mutedText: muted,
      plotBackground: 'transparent',
      series: chartSeries.map((series) => series.color ?? success),
      text: foreground,
    }),
    [chartSeries, foreground, muted, success],
  );
  const renderBar = useCallback(
    ({ bar, fill, radius }: BarChartRenderBarProps<ChartDatum>) => {
      const day = data.days[bar.dataIndex];
      const opacity = day?.isFuture ? 0.15 : day?.dateKey === selectedDateKey ? 1 : 0.35;
      const isTopSegment = data.series
        .slice(bar.seriesIndex + 1)
        .every((series) => (series.values[bar.dataIndex] ?? 0) <= 0);

      if (isTopSegment && radius > 0) {
        return (
          <Path
            d={getTopRoundedBarPath(bar.x, bar.y, bar.width, bar.height, radius)}
            fill={fill}
            opacity={opacity}
          />
        );
      }

      return (
        <Rect
          fill={fill}
          height={bar.height}
          opacity={opacity}
          rx={0}
          width={bar.width}
          x={bar.x}
          y={bar.y}
        />
      );
    },
    [data.days, data.series, selectedDateKey],
  );
  const axisTicks = chartScale.tickValues.map((value) => ({
    value,
    y: valueToY(value, chartMaximum),
  }));
  const axisLabelTicks = axisTicks.filter(
    (tick) =>
      !hasAverage ||
      tick.value === chartMaximum ||
      tick.value === 0 ||
      Math.abs(tick.y - averageY) >= AXIS_LABEL_MIN_GAP,
  );

  return (
    <View
      ref={containerRef}
      className="gap-4"
      testID="ai-usage-weekly-chart-container"
      onLayout={onLayout}
    >
      {isLoading ? (
        <WeeklyChartSkeleton />
      ) : (
        <>
          <View className="h-16 flex-row items-start gap-3" testID="ai-usage-selected-day-summary">
            <View className="h-full min-w-0 flex-1 justify-between">
              <Text
                className="text-muted-foreground text-sm"
                maxFontSizeMultiplier={1.1}
                numberOfLines={1}
                testID="ai-usage-selected-date"
              >
                {selectedDateFormatter.format(parseLocalDateKey(selectedDateKey))}
              </Text>
              <Text
                selectable
                adjustsFontSizeToFit
                className="font-semibold text-foreground text-3xl"
                maxFontSizeMultiplier={1.1}
                minimumFontScale={0.75}
                numberOfLines={1}
                style={styles.tabularNumbers}
                testID="ai-usage-selected-day-total"
              >
                {t('aiUsage.tokensValue', { tokens: formatTokens(selectedDayTokens) })}
              </Text>
            </View>
            {weekOverWeekChange === undefined ? null : (
              <AiUsageWeekOverWeekBadge change={weekOverWeekChange} locale={locale} />
            )}
          </View>

          <View className="flex-row" style={styles.chartFrame} testID="ai-usage-weekly-chart">
            {chartWidth >= MIN_CHART_WIDTH ? (
              <View style={{ height: CHART_HEIGHT, width: chartWidth }}>
                <BarChart
                  accessibilityLabel={t('aiUsage.weekChartAccessibility')}
                  barRadius={3}
                  barWidthRatio={0.68}
                  data={chartData}
                  formatXLabel={EMPTY_LABEL}
                  formatYLabel={EMPTY_LABEL}
                  height={CHART_HEIGHT}
                  interaction="none"
                  labelStrategy="hide"
                  legend={false}
                  mode="stacked"
                  renderBar={renderBar}
                  scrollable={false}
                  series={chartSeries}
                  showHorizontalGridLines={false}
                  showXAxisLabels={false}
                  showYAxisLabels={false}
                  testID="ai-usage-bar-chart"
                  theme={chartTheme}
                  tooltip={false}
                  width={chartWidth}
                  xKey="dateKey"
                  yDomain={[0, chartMaximum]}
                  yTickCount={3}
                />

                <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                  {axisTicks.map((tick) => (
                    <Line
                      key={tick.value}
                      opacity={0.45}
                      stroke={separator}
                      strokeWidth={1}
                      testID={`ai-usage-grid-line-${tick.value}`}
                      x1={PLOT_LEFT}
                      x2={chartWidth - PLOT_RIGHT}
                      y1={tick.y}
                      y2={tick.y}
                    />
                  ))}
                  {hasAverage ? (
                    <Line
                      stroke={success}
                      strokeDasharray="5 5"
                      strokeWidth={1.5}
                      testID="ai-usage-average-line"
                      x1={PLOT_LEFT}
                      x2={chartWidth - PLOT_RIGHT}
                      y1={averageY}
                      y2={averageY}
                    />
                  ) : null}
                </Svg>

                <View
                  className="absolute flex-row"
                  style={{
                    bottom: 0,
                    left: PLOT_LEFT,
                    right: PLOT_RIGHT,
                    top: PLOT_TOP,
                  }}
                >
                  {data.days.map((day) => {
                    const isSelected = day.dateKey === selectedDateKey;
                    const formattedTokens = formatTokens(day.totalTokens);

                    return (
                      <Pressable
                        key={day.dateKey}
                        accessibilityLabel={t('aiUsage.dayAccessibility', {
                          date: dateFormatter.format(parseLocalDateKey(day.dateKey)),
                          tokens: formattedTokens,
                        })}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: day.isFuture, selected: isSelected }}
                        className="flex-1 items-center justify-end pb-1 active:opacity-65"
                        disabled={day.isFuture}
                        testID={`ai-usage-day-${day.dateKey}`}
                        onPress={() => onSelectDate(day.dateKey)}
                      >
                        <Text
                          className={
                            isSelected
                              ? 'font-semibold text-foreground text-xs'
                              : 'text-muted-foreground text-xs'
                          }
                          maxFontSizeMultiplier={1.1}
                          style={day.isFuture ? styles.futureLabel : undefined}
                        >
                          {weekdayFormatter.format(parseLocalDateKey(day.dateKey))}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {chartWidth >= MIN_CHART_WIDTH ? (
              <View className="relative" style={{ height: CHART_HEIGHT, width: AXIS_WIDTH }}>
                {axisLabelTicks.map((tick) => (
                  <Text
                    key={tick.value}
                    adjustsFontSizeToFit
                    className="absolute left-1 text-muted-foreground text-xs"
                    minimumFontScale={0.8}
                    numberOfLines={1}
                    style={[styles.axisLabel, { top: getAxisLabelTop(tick.y) }]}
                    testID={`ai-usage-axis-label-${tick.value}`}
                  >
                    {formatTokens(tick.value)}
                  </Text>
                ))}
                {hasAverage ? (
                  <Text
                    className="absolute left-1 font-medium text-success text-xs"
                    numberOfLines={1}
                    style={[styles.axisLabel, { top: getAxisLabelTop(averageY) }]}
                    testID="ai-usage-average-label"
                  >
                    {t('aiUsage.average')}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <View className="border-border border-t" />

          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-2">
              <Text className="text-foreground text-sm">{t('aiUsage.weekTotal')}</Text>
              {statusAccessory}
            </View>
            <Text
              selectable
              className="font-semibold text-muted-foreground text-sm"
              style={styles.tabularNumbers}
              testID="ai-usage-week-total"
            >
              {t('aiUsage.tokensValue', { tokens: formatTokens(data.totalTokens) })}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function AiUsageWeekOverWeekBadge({ change, locale }: { change: number; locale: string }) {
  const { t } = useTranslation();
  const TrendIcon = change > 0 ? CircleArrowUpIcon : CircleArrowDownIcon;
  const percentFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0, style: 'percent' }),
    [locale],
  );

  return (
    <View
      className="shrink-0 flex-row items-center gap-1"
      testID={change > 0 ? 'ai-usage-week-over-week-up' : 'ai-usage-week-over-week-down'}
    >
      <TrendIcon className="size-4 shrink-0 text-muted-foreground" />
      <Text className="text-muted-foreground text-sm" maxFontSizeMultiplier={1.1} numberOfLines={1}>
        {t('aiUsage.weekOverWeek')}
      </Text>
      <Text
        selectable
        className="text-muted-foreground text-sm"
        maxFontSizeMultiplier={1.1}
        numberOfLines={1}
        style={styles.tabularNumbers}
        testID="ai-usage-week-over-week-value"
      >
        {percentFormatter.format(Math.abs(change))}
      </Text>
    </View>
  );
}

function WeeklyChartSkeleton() {
  return (
    <View className="gap-4" testID="ai-usage-weekly-chart-loading">
      <View className="h-16 justify-between">
        <View className="h-4 w-28 rounded-sm bg-secondary" />
        <View className="h-8 w-36 rounded-sm bg-secondary" />
      </View>
      <View className="flex-row items-end gap-3" style={styles.chartFrame}>
        {WEEKLY_CHART_SKELETON_HEIGHTS.map((height) => (
          <View key={height} className="flex-1 items-center justify-end gap-3">
            <View className="w-5 rounded-sm bg-secondary" style={{ height }} />
            <View className="h-3 w-5 rounded-sm bg-secondary" />
          </View>
        ))}
      </View>
      <View className="border-border border-t" />
      {/* h-5 matches the loaded row's text-sm line height, keeping both boxes the same. */}
      <View className="flex-row items-center justify-between gap-3">
        <View className="h-5 w-20 rounded-sm bg-secondary" />
        <View className="h-5 w-24 rounded-sm bg-secondary" />
      </View>
    </View>
  );
}

function getSeriesColor(
  isOther: boolean,
  index: number,
  success: string,
  info: string,
  warning: string,
  muted: string,
): string {
  if (isOther) return muted;
  if (index === 0) return success;
  if (index === 1) return info;
  if (index === 2) return warning;
  return muted;
}

function seriesValueKey(index: number): string {
  return `series${index}`;
}

function valueToY(value: number, maximum: number): number {
  const ratio = Math.max(0, Math.min(1, value / maximum));
  return PLOT_TOP + (1 - ratio) * PLOT_HEIGHT;
}

function getAxisLabelTop(y: number): number {
  return Math.max(0, Math.min(CHART_HEIGHT - AXIS_LABEL_HEIGHT, y - AXIS_LABEL_HEIGHT / 2));
}

function getTopRoundedBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const cornerRadius = Math.min(radius, width / 2, height);

  return [
    `M ${x} ${y + cornerRadius}`,
    `Q ${x} ${y} ${x + cornerRadius} ${y}`,
    `H ${x + width - cornerRadius}`,
    `Q ${x + width} ${y} ${x + width} ${y + cornerRadius}`,
    `V ${y + height}`,
    `H ${x}`,
    'Z',
  ].join(' ');
}

const styles = StyleSheet.create({
  axisLabel: {
    fontVariant: ['tabular-nums'],
  },
  chartFrame: {
    height: CHART_HEIGHT,
  },
  futureLabel: {
    opacity: 0.35,
  },
  tabularNumbers: {
    fontVariant: ['tabular-nums'],
  },
});
