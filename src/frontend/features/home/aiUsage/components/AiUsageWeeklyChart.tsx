import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BarChart,
  type BarChartRenderBarProps,
  type BarChartSeries,
  type CartesianChartTheme,
} from 'react-native-chart-kit/v2';
import { Line, Path, Rect, Svg } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import type { AiUsageWeeklyData } from '../types';
import { parseLocalDateKey } from '../utils/aiUsageCalendar';
import { displayAiUsageModelId } from '../utils/aiUsageDetail';
import { createAiUsageTokenFormatter } from '../utils/formatAiUsageTokens';

const CHART_HEIGHT = 196;
const AXIS_WIDTH = 48;
const PLOT_TOP = 18;
const PLOT_RIGHT = 14;
const PLOT_BOTTOM = 34;
const PLOT_LEFT = 10;
const PLOT_HEIGHT = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const MIN_CHART_WIDTH = 220;
const EMPTY_LABEL = () => '';
const WEEKLY_CHART_SKELETON_HEIGHTS = [42, 70, 54, 92, 66, 38, 78] as const;
const WEEKLY_LEGEND_SKELETON_KEYS = ['primary', 'info', 'warning', 'other'] as const;

type ChartDatum = Record<string, number | string> & { dateKey: string };

type AiUsageWeeklyChartProps = {
  data: AiUsageWeeklyData;
  isLoading: boolean;
  locale: string;
  onSelectDate: (dateKey: string) => void;
  selectedDateKey: string;
};

export function AiUsageWeeklyChart({
  data,
  isLoading,
  locale,
  onSelectDate,
  selectedDateKey,
}: AiUsageWeeklyChartProps) {
  const { t } = useTranslation();
  const [containerWidth, setContainerWidth] = useState(0);
  const [primary, info, warning, muted, separator, success, foreground] = useThemeColor([
    'primary',
    'info',
    'warning',
    'muted-foreground',
    'separator',
    'success',
    'default-foreground',
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
  const chartWidth = Math.max(0, containerWidth - AXIS_WIDTH);
  const maxDayTokens = Math.max(0, ...data.days.map((day) => day.totalTokens));
  const chartMaximum = getChartMaximum(maxDayTokens);
  const averageY = valueToY(data.averageTokens, chartMaximum);
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
      color: getSeriesColor(series.isOther, index, primary, info, warning, muted),
      key: series.key,
      label: series.isOther
        ? t('aiUsage.otherModels')
        : displayAiUsageModelId(series.modelId) || t('aiUsage.unknownModel'),
      yKey: seriesValueKey(index),
    }));
  }, [data.series, info, muted, primary, t, warning]);
  const chartTheme = useMemo<CartesianChartTheme>(
    () => ({
      axis: 'transparent',
      background: 'transparent',
      grid: 'transparent',
      mutedText: muted,
      plotBackground: 'transparent',
      series: chartSeries.map((series) => series.color ?? primary),
      text: foreground,
    }),
    [chartSeries, foreground, muted, primary],
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
  const axisTicks = [
    { value: chartMaximum, y: PLOT_TOP },
    { value: chartMaximum / 2, y: PLOT_TOP + PLOT_HEIGHT / 2 },
    { value: 0, y: PLOT_TOP + PLOT_HEIGHT },
  ];
  const averageLabelTop = getAverageLabelTop(averageY, axisTicks);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setContainerWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
  };

  return (
    <View className="gap-4" onLayout={handleLayout}>
      {isLoading ? (
        <WeeklyChartSkeleton />
      ) : (
        <>
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
                      x1={PLOT_LEFT}
                      x2={chartWidth - PLOT_RIGHT}
                      y1={tick.y}
                      y2={tick.y}
                    />
                  ))}
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
                              ? 'font-semibold text-primary text-xs'
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
                {axisTicks.map((tick) => (
                  <Text
                    key={tick.value}
                    adjustsFontSizeToFit
                    className="absolute left-1 text-muted-foreground text-xs"
                    minimumFontScale={0.8}
                    numberOfLines={1}
                    style={[styles.axisLabel, { top: tick.y - 7 }]}
                  >
                    {formatTokens(tick.value)}
                  </Text>
                ))}
                <Text
                  className="absolute left-1 font-medium text-success text-xs"
                  numberOfLines={1}
                  style={[styles.axisLabel, { top: averageLabelTop }]}
                  testID="ai-usage-average-label"
                >
                  {t('aiUsage.average')}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-muted-foreground text-sm">{t('aiUsage.weekTotal')}</Text>
            <Text
              selectable
              className="font-semibold text-default-foreground text-sm"
              style={styles.tabularNumbers}
              testID="ai-usage-week-total"
            >
              {t('aiUsage.tokensValue', { tokens: formatTokens(data.totalTokens) })}
            </Text>
          </View>

          {data.series.length > 0 ? (
            <View className="flex-row flex-wrap gap-x-4 gap-y-3" testID="ai-usage-week-legend">
              {data.series.map((series, index) => {
                const color = getSeriesColor(series.isOther, index, primary, info, warning, muted);
                const label = series.isOther
                  ? t('aiUsage.otherModels')
                  : displayAiUsageModelId(series.modelId) || t('aiUsage.unknownModel');

                return (
                  <View key={series.key} className="min-w-[44%] flex-1 flex-row items-center gap-2">
                    <View
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <Text
                      className="min-w-0 flex-1 text-muted-foreground text-xs"
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                    <Text
                      selectable
                      className="shrink-0 font-medium text-default-foreground text-xs"
                      numberOfLines={1}
                      style={styles.tabularNumbers}
                    >
                      {t('aiUsage.tokensValue', { tokens: formatTokens(series.totalTokens) })}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function WeeklyChartSkeleton() {
  return (
    <View className="gap-4" testID="ai-usage-weekly-chart-loading">
      <View className="flex-row items-end gap-3" style={styles.chartFrame}>
        {WEEKLY_CHART_SKELETON_HEIGHTS.map((height) => (
          <View key={height} className="flex-1 items-center justify-end gap-3">
            <View className="w-5 rounded-sm bg-surface-secondary" style={{ height }} />
            <View className="h-3 w-5 rounded-sm bg-surface-secondary" />
          </View>
        ))}
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <View className="h-4 w-20 rounded-sm bg-surface-secondary" />
        <View className="h-4 w-24 rounded-sm bg-surface-secondary" />
      </View>
      <View className="flex-row flex-wrap gap-3">
        {WEEKLY_LEGEND_SKELETON_KEYS.map((key) => (
          <View key={key} className="h-4 min-w-[44%] flex-1 rounded-sm bg-surface-secondary" />
        ))}
      </View>
    </View>
  );
}

function getSeriesColor(
  isOther: boolean,
  index: number,
  primary: string,
  info: string,
  warning: string,
  muted: string,
): string {
  if (isOther) return muted;
  if (index === 0) return primary;
  if (index === 1) return info;
  if (index === 2) return warning;
  return muted;
}

function seriesValueKey(index: number): string {
  return `series${index}`;
}

function getChartMaximum(value: number): number {
  if (value <= 0) return 1;
  const target = value * 1.1;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function valueToY(value: number, maximum: number): number {
  const ratio = Math.max(0, Math.min(1, value / maximum));
  return PLOT_TOP + (1 - ratio) * PLOT_HEIGHT;
}

function getAverageLabelTop(
  averageY: number,
  axisTicks: readonly { value: number; y: number }[],
): number {
  const collidesWithTick = axisTicks.some((tick) => Math.abs(tick.y - averageY) < 13);
  const offset = collidesWithTick ? (averageY > CHART_HEIGHT / 2 ? -25 : 8) : -7;
  return Math.max(0, Math.min(CHART_HEIGHT - 16, averageY + offset));
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
