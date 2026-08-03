import { Tabs } from 'heroui-native';
import { RefreshCwIcon } from 'lucide-uniwind/png';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { AiUsageCalendar } from './components/AiUsageCalendar';
import { useAiUsageOverview } from './hooks/useAiUsageOverview';
import { aiUsageDetailWindowKeys, type AiUsageDetailWindowKey } from './types';
import { parseLocalDateKey, toLocalDateKey } from './utils/aiUsageCalendar';

const windowLabelKeys: Record<AiUsageDetailWindowKey, string> = {
  '30d': 'aiUsage.range.30d',
  '90d': 'aiUsage.range.90d',
  '365d': 'aiUsage.range.365d',
};

export function AiUsageScreen() {
  const { i18n, t } = useTranslation();
  const [windowKey, setWindowKey] = useState<AiUsageDetailWindowKey>('30d');
  const { calendarData, hasData, isError, isLoading, isRefreshing, overview, range, refetch } =
    useAiUsageOverview(windowKey);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
        notation: 'compact',
      }),
    [locale],
  );
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
        style: 'percent',
      }),
    [locale],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [locale],
  );
  const isInitialLoading = isLoading && !hasData;
  const showInitialError = isError && !hasData;
  const placeholder = '--';
  const peakDay = overview.peakDay;
  const totalTokens = isInitialLoading ? placeholder : numberFormatter.format(overview.totalTokens);
  const cacheHitRate = isInitialLoading
    ? placeholder
    : overview.cacheHitRate === undefined
      ? placeholder
      : percentFormatter.format(overview.cacheHitRate);
  const cacheHitDetail =
    !isInitialLoading && overview.cacheHitRate !== undefined
      ? t('aiUsage.cacheObservedTokens', {
          tokens: numberFormatter.format(overview.cacheObservedTokens),
        })
      : undefined;
  const activeDays = isInitialLoading ? placeholder : numberFormatter.format(overview.activeDays);
  const longestStreak = isInitialLoading
    ? undefined
    : t('aiUsage.longestStreak', { count: overview.longestStreak });
  const peakTokens = isInitialLoading
    ? placeholder
    : numberFormatter.format(peakDay?.totalTokens ?? 0);
  const peakDate =
    !isInitialLoading && peakDay
      ? dateFormatter.format(parseLocalDateKey(peakDay.dateKey))
      : undefined;

  return (
    <>
      <BackHeader title={t('aiUsage.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5 px-4 py-5">
          <View className="min-h-9 flex-row items-center justify-end gap-2">
            {isRefreshing ? (
              <ActivityIndicator
                accessibilityLabel={t('aiUsage.loading')}
                size="small"
                testID="ai-usage-refreshing"
              />
            ) : isError && hasData ? (
              <Pressable
                accessibilityLabel={t('aiUsage.retry')}
                accessibilityRole="button"
                className="size-8 items-center justify-center rounded-full active:bg-surface-secondary active:opacity-70"
                hitSlop={6}
                testID="ai-usage-refresh-retry"
                onPress={() => void refetch()}
              >
                <RefreshCwIcon className="size-4 text-danger" strokeWidth={2} />
              </Pressable>
            ) : null}

            <Tabs
              className="w-40 shrink-0 gap-0"
              value={windowKey}
              variant="secondary"
              onValueChange={(value) => setWindowKey(value as AiUsageDetailWindowKey)}
            >
              <Tabs.List className="h-9 w-full self-stretch rounded-lg">
                <Tabs.Indicator />
                {aiUsageDetailWindowKeys.map((item) => (
                  <Tabs.Trigger
                    key={item}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: item === windowKey }}
                    className="h-8 flex-1 px-1 py-0"
                    testID={`ai-usage-range-${item}`}
                    value={item}
                  >
                    <Tabs.Label
                      adjustsFontSizeToFit
                      className="text-xs"
                      maxFontSizeMultiplier={1.1}
                      minimumFontScale={0.85}
                      numberOfLines={1}
                    >
                      {t(windowLabelKeys[item])}
                    </Tabs.Label>
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Tabs>
          </View>

          {showInitialError ? (
            <View className="items-center justify-center gap-4" style={styles.stateContent}>
              <Text selectable className="text-center text-danger-foreground text-sm">
                {t('aiUsage.loadError')}
              </Text>
              <Pressable
                accessibilityRole="button"
                className="flex-row items-center gap-2 rounded-lg bg-surface-secondary px-4 py-2 active:opacity-70"
                testID="ai-usage-retry"
                onPress={() => void refetch()}
              >
                <RefreshCwIcon className="size-4 text-default-foreground" strokeWidth={2} />
                <Text className="font-medium text-default-foreground text-sm">
                  {t('aiUsage.retry')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="border-y border-border">
                <View className="flex-row border-b border-border">
                  <MetricCell
                    className="border-r border-border"
                    label={t('aiUsage.totalTokens')}
                    testID="ai-usage-total-tokens-value"
                    value={totalTokens}
                  />
                  <MetricCell
                    detail={cacheHitDetail}
                    label={t('aiUsage.cacheHitRate')}
                    testID="ai-usage-cache-hit-rate-value"
                    value={cacheHitRate}
                  />
                </View>
                <View className="flex-row">
                  <MetricCell
                    className="border-r border-border"
                    detail={longestStreak}
                    label={t('aiUsage.activeDays')}
                    testID="ai-usage-active-days-value"
                    value={activeDays}
                  />
                  <MetricCell
                    detail={peakDate}
                    label={t('aiUsage.peakDay')}
                    testID="ai-usage-peak-day-value"
                    value={peakTokens}
                  />
                </View>
              </View>

              <View className="gap-3">
                <Text className="font-medium text-default-foreground text-sm">
                  {t('aiUsage.dailyActivity')}
                </Text>
                <AiUsageCalendar
                  data={calendarData}
                  highlightedFromDateKey={toLocalDateKey(new Date(range.from))}
                  isLoading={isInitialLoading}
                  layout="scroll"
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </>
  );
}

type MetricCellProps = {
  className?: string;
  detail?: string;
  label: string;
  testID: string;
  value: string;
};

function MetricCell({ className, detail, label, testID, value }: MetricCellProps) {
  return (
    <View className={`min-h-20 flex-1 justify-center gap-1 px-3 py-3 ${className ?? ''}`}>
      <Text className="text-muted-foreground text-xs" maxFontSizeMultiplier={1.2} numberOfLines={1}>
        {label}
      </Text>
      <View className="min-w-0 flex-row items-baseline gap-1">
        <Text
          adjustsFontSizeToFit
          className="shrink-0 font-semibold text-default-foreground text-xl"
          minimumFontScale={0.72}
          numberOfLines={1}
          style={styles.metricValue}
          testID={testID}
        >
          {value}
        </Text>
        {detail ? (
          <Text
            adjustsFontSizeToFit
            className="min-w-0 flex-1 text-muted-foreground text-xs"
            maxFontSizeMultiplier={1.1}
            minimumFontScale={0.7}
            numberOfLines={1}
            style={styles.metricValue}
          >
            {`(${detail})`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricValue: {
    fontVariant: ['tabular-nums'],
  },
  stateContent: {
    minHeight: 316,
  },
});
