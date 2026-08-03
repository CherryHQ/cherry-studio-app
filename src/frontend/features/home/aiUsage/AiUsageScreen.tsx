import { RefreshCwIcon } from 'lucide-uniwind/png';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { AiUsageModelList, AiUsageModelListSkeleton } from './components/AiUsageModelList';
import { AiUsageWeeklyChart } from './components/AiUsageWeeklyChart';
import { useAiUsageDetail } from './hooks/useAiUsageDetail';
import { parseLocalDateKey } from './utils/aiUsageCalendar';

export function AiUsageScreen() {
  const { i18n, t } = useTranslation();
  const { modelUsage, models, selectDate, selectedDateKey, timeline, weeklyData } =
    useAiUsageDetail();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const selectedDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        weekday: 'short',
      }),
    [locale],
  );
  const timelineInitialLoading = timeline.isLoading && !timeline.hasData;
  const timelineInitialError = timeline.isError && !timeline.hasData;
  const modelsInitialLoading = models.isLoading && !models.hasData;
  const modelsInitialError = models.isError && !models.hasData;

  return (
    <>
      <BackHeader title={t('aiUsage.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-7 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4">
          <SectionHeader
            isError={timeline.isError && timeline.hasData}
            isRefreshing={timeline.isRefreshing}
            retryTestID="ai-usage-week-refresh-retry"
            title={t('aiUsage.thisWeek')}
            onRetry={() => void timeline.refetch()}
          />
          {timelineInitialError ? (
            <SectionError
              message={t('aiUsage.loadError')}
              testID="ai-usage-week-retry"
              onRetry={() => void timeline.refetch()}
            />
          ) : (
            <AiUsageWeeklyChart
              data={weeklyData}
              isLoading={timelineInitialLoading}
              locale={locale}
              selectedDateKey={selectedDateKey}
              onSelectDate={selectDate}
            />
          )}
        </View>

        <View className="h-px bg-border" />

        <View className="gap-3">
          <SectionHeader
            detail={selectedDateFormatter.format(parseLocalDateKey(selectedDateKey))}
            isError={models.isError && models.hasData}
            isRefreshing={models.isRefreshing}
            retryTestID="ai-usage-models-refresh-retry"
            title={t('aiUsage.modelUsage')}
            onRetry={() => void models.refetch()}
          />
          {modelsInitialError ? (
            <SectionError
              message={t('aiUsage.modelLoadError')}
              testID="ai-usage-models-retry"
              onRetry={() => void models.refetch()}
            />
          ) : modelsInitialLoading ? (
            <AiUsageModelListSkeleton />
          ) : modelUsage.length > 0 ? (
            <AiUsageModelList key={selectedDateKey} items={modelUsage} locale={locale} />
          ) : (
            <View className="min-h-32 items-center justify-center px-6">
              <Text selectable className="text-center text-muted-foreground text-sm">
                {t('aiUsage.noUsageForDay')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}

type SectionHeaderProps = {
  detail?: string;
  isError: boolean;
  isRefreshing: boolean;
  onRetry: () => void;
  retryTestID: string;
  title: string;
};

function SectionHeader({
  detail,
  isError,
  isRefreshing,
  onRetry,
  retryTestID,
  title,
}: SectionHeaderProps) {
  const { t } = useTranslation();

  return (
    <View className="min-h-8 flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Text selectable className="shrink font-semibold text-default-foreground text-base">
          {title}
        </Text>
        {isRefreshing ? (
          <ActivityIndicator accessibilityLabel={t('aiUsage.loading')} size="small" />
        ) : isError ? (
          <Pressable
            accessibilityLabel={t('aiUsage.retry')}
            accessibilityRole="button"
            className="size-8 items-center justify-center rounded-full active:bg-surface-secondary active:opacity-70"
            hitSlop={6}
            testID={retryTestID}
            onPress={onRetry}
          >
            <RefreshCwIcon className="size-4 text-danger" strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
      {detail ? (
        <Text
          selectable
          className="shrink-0 text-muted-foreground text-sm"
          maxFontSizeMultiplier={1.1}
          numberOfLines={1}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function SectionError({
  message,
  onRetry,
  testID,
}: {
  message: string;
  onRetry: () => void;
  testID: string;
}) {
  const { t } = useTranslation();

  return (
    <View className="min-h-40 items-center justify-center gap-4 px-6">
      <Text selectable className="text-center text-danger-foreground text-sm">
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        className="flex-row items-center gap-2 rounded-lg bg-surface-secondary px-4 py-2 active:opacity-70"
        testID={testID}
        onPress={onRetry}
      >
        <RefreshCwIcon className="size-4 text-default-foreground" strokeWidth={2} />
        <Text className="font-medium text-default-foreground text-sm">{t('aiUsage.retry')}</Text>
      </Pressable>
    </View>
  );
}
