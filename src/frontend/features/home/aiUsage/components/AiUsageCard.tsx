import { Tabs } from 'heroui-native';
import { RefreshCwIcon } from 'lucide-uniwind';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { homeAiUsageCalendar } from '@/frontend/utils/constants';

import { useAiUsageOverview } from '../hooks/useAiUsageOverview';
import { aiUsageWindowKeys, type AiUsageWindowKey } from '../types';
import { parseLocalDateKey } from '../utils/aiUsageCalendar';
import { AiUsageCalendar } from './AiUsageCalendar';

const windowLabelKeys: Record<AiUsageWindowKey, string> = {
  '30d': 'home.aiUsage.range.30d',
  '90d': 'home.aiUsage.range.90d',
  '365d': 'home.aiUsage.range.365d',
};

export function AiUsageCard() {
  const { i18n, t } = useTranslation();
  const [windowKey, setWindowKey] = useState<AiUsageWindowKey>('30d');
  const { hasData, isError, isLoading, isRefreshing, overview, refetch } =
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
  const totalRequests = isInitialLoading
    ? placeholder
    : numberFormatter.format(overview.totalRequests);
  const activeDays = isInitialLoading ? placeholder : numberFormatter.format(overview.activeDays);
  const longestStreak = isInitialLoading
    ? placeholder
    : t('home.aiUsage.longestStreak', { count: overview.longestStreak });
  const peakTokens = isInitialLoading
    ? placeholder
    : numberFormatter.format(peakDay?.totalTokens ?? 0);
  const peakDate = isInitialLoading
    ? placeholder
    : peakDay
      ? dateFormatter.format(parseLocalDateKey(peakDay.dateKey))
      : placeholder;

  return (
    <View className="w-full rounded-2xl bg-surface p-4" style={styles.card}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 shrink flex-row items-center gap-2">
          <Text
            adjustsFontSizeToFit
            className="min-w-0 shrink font-semibold text-default-foreground text-lg"
            maxFontSizeMultiplier={1.2}
            minimumFontScale={0.85}
            numberOfLines={1}
          >
            {t('home.aiUsage.title')}
          </Text>
          {isRefreshing ? (
            <ActivityIndicator
              accessibilityLabel={t('home.aiUsage.loading')}
              size="small"
              testID="ai-usage-refreshing"
            />
          ) : isError && hasData ? (
            <Pressable
              accessibilityLabel={t('home.aiUsage.retry')}
              accessibilityRole="button"
              className="size-8 items-center justify-center rounded-full active:bg-surface-secondary active:opacity-70"
              hitSlop={6}
              testID="ai-usage-refresh-retry"
              onPress={() => void refetch()}
            >
              <RefreshCwIcon className="size-4 text-danger" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        <Tabs
          className="w-40 shrink-0 gap-0"
          value={windowKey}
          variant="secondary"
          onValueChange={(value) => setWindowKey(value as AiUsageWindowKey)}
        >
          <Tabs.List className="h-9 w-full self-stretch rounded-lg">
            <Tabs.Indicator />
            {aiUsageWindowKeys.map((item) => (
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
          <Text className="text-center text-danger-foreground text-sm">
            {t('home.aiUsage.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-2 rounded-lg bg-surface-secondary px-4 py-2 active:opacity-70"
            testID="ai-usage-retry"
            onPress={() => void refetch()}
          >
            <RefreshCwIcon className="size-4 text-default-foreground" strokeWidth={2} />
            <Text className="font-medium text-default-foreground text-sm">
              {t('home.aiUsage.retry')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="mt-4 gap-4">
          <View className="border-y border-border">
            <View className="flex-row border-b border-border">
              <MetricCell
                className="border-r border-border"
                label={t('home.aiUsage.totalTokens')}
                testID="ai-usage-total-tokens-value"
                value={totalTokens}
              />
              <MetricCell
                label={t('home.aiUsage.requests')}
                testID="ai-usage-requests-value"
                value={totalRequests}
              />
            </View>
            <View className="flex-row">
              <MetricCell
                className="border-r border-border"
                detail={longestStreak}
                label={t('home.aiUsage.activeDays')}
                testID="ai-usage-active-days-value"
                value={activeDays}
              />
              <MetricCell
                detail={peakDate}
                label={t('home.aiUsage.peakDay')}
                testID="ai-usage-peak-day-value"
                value={peakTokens}
              />
            </View>
          </View>

          <AiUsageCalendar
            data={overview.data}
            isLoading={isInitialLoading}
            windowKey={windowKey}
          />
        </View>
      )}
    </View>
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
      <Text
        adjustsFontSizeToFit
        className="font-semibold text-default-foreground text-xl"
        minimumFontScale={0.72}
        numberOfLines={1}
        style={styles.metricValue}
        testID={testID}
      >
        {value}
      </Text>
      {detail ? (
        <Text
          className="text-muted-foreground text-xs"
          maxFontSizeMultiplier={1.1}
          numberOfLines={1}
          style={styles.metricValue}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    boxShadow: homeAiUsageCalendar.cardShadow,
  },
  metricValue: {
    fontVariant: ['tabular-nums'],
  },
  stateContent: {
    minHeight: 316,
  },
});
