import { Link } from 'expo-router';
import { ChevronRightIcon, RefreshCwIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { aiUsageCalendar } from '@/frontend/utils/constants';

import { useAiUsageOverview } from '../hooks/useAiUsageOverview';
import { getFirstAiUsageDateKey } from '../utils/aiUsageOverview';
import { AiUsageCalendar } from './AiUsageCalendar';

export function AiUsageSummaryCard() {
  const { t } = useTranslation();
  const { calendarData, hasData, isError, isLoading, isRefreshing, refetch } = useAiUsageOverview();
  const isInitialLoading = isLoading && !hasData;
  const showInitialError = isError && !hasData;
  const animationStartDateKey = getFirstAiUsageDateKey(calendarData);

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
            {t('aiUsage.title')}
          </Text>
          {isRefreshing ? (
            <ActivityIndicator
              accessibilityLabel={t('aiUsage.loading')}
              size="small"
              testID="ai-usage-summary-refreshing"
            />
          ) : isError && hasData ? (
            <Pressable
              accessibilityLabel={t('aiUsage.retry')}
              accessibilityRole="button"
              className="size-8 items-center justify-center rounded-full active:bg-surface-secondary active:opacity-70"
              hitSlop={6}
              testID="ai-usage-summary-refresh-retry"
              onPress={() => void refetch()}
            >
              <RefreshCwIcon className="size-4 text-danger" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        <Link href="/home/ai-usage" asChild>
          <Pressable
            accessibilityRole="link"
            className="shrink-0 flex-row items-center gap-0.5 py-1 active:opacity-60"
            hitSlop={6}
            testID="ai-usage-view-details"
          >
            <Text className="font-medium text-primary text-sm" numberOfLines={1}>
              {t('aiUsage.viewDetails')}
            </Text>
            <ChevronRightIcon className="size-4 text-primary" strokeWidth={2} />
          </Pressable>
        </Link>
      </View>

      {showInitialError ? (
        <View className="items-center justify-center gap-3" style={styles.stateContent}>
          <Text selectable className="text-center text-danger-foreground text-sm">
            {t('aiUsage.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-2 rounded-lg bg-surface-secondary px-4 py-2 active:opacity-70"
            testID="ai-usage-summary-retry"
            onPress={() => void refetch()}
          >
            <RefreshCwIcon className="size-4 text-default-foreground" strokeWidth={2} />
            <Text className="font-medium text-default-foreground text-sm">
              {t('aiUsage.retry')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="mt-4">
          <AiUsageCalendar
            animationStartDateKey={animationStartDateKey}
            data={calendarData}
            isLoading={isInitialLoading}
            layout="fit"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    boxShadow: aiUsageCalendar.cardShadow,
  },
  stateContent: {
    minHeight: 104,
  },
});
