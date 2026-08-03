import { RefreshCwIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { useAiUsageWeekPage } from '../hooks/useAiUsageWeekPage';
import type { AiUsageDetailPage } from '../types';
import { parseLocalDateKey } from '../utils/aiUsageCalendar';
import { AiUsageModelList, AiUsageModelListSkeleton } from './AiUsageModelList';
import { AiUsageWeeklyChart } from './AiUsageWeeklyChart';

type AiUsageWeekPageProps = {
  enabled: boolean;
  locale: string;
  page: AiUsageDetailPage;
  todayDateKey: string;
  onSelectDate: (dateKey: string) => void;
};

export function AiUsageWeekPage({
  enabled,
  locale,
  page,
  todayDateKey,
  onSelectDate,
}: AiUsageWeekPageProps) {
  const { t } = useTranslation();
  const { modelUsage, models, timeline, weeklyData } = useAiUsageWeekPage({
    enabled,
    range: page.range,
    selectedDateKey: page.selectedDateKey,
    todayDateKey,
  });
  const selectedDateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
  const weekRangeLabel = formatWeekRange(locale, page.range.from, page.range.to);
  const weekTitle =
    page.weeksAgo === 0
      ? t('aiUsage.thisWeek')
      : page.weeksAgo === 1
        ? t('aiUsage.lastWeek')
        : weekRangeLabel;
  const weekDetail = page.weeksAgo <= 1 ? weekRangeLabel : undefined;
  const timelineInitialLoading = (timeline.isLoading || !enabled) && !timeline.hasData;
  const timelineInitialError = timeline.isError && !timeline.hasData;
  const modelsInitialLoading = (models.isLoading || !enabled) && !models.hasData;
  const modelsInitialError = models.isError && !models.hasData;

  return (
    <ScrollView
      alwaysBounceVertical={false}
      className="flex-1"
      contentContainerClassName="gap-7 px-4 py-5"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      testID={`ai-usage-week-scroll-${page.key}`}
    >
      <View className="gap-4">
        <SectionHeader
          detail={weekDetail}
          isError={timeline.isError && timeline.hasData}
          isRefreshing={timeline.isRefreshing}
          retryTestID={`ai-usage-week-refresh-retry-${page.key}`}
          title={weekTitle}
          onRetry={() => void timeline.refetch()}
        />
        {timelineInitialError ? (
          <SectionError
            message={t('aiUsage.loadError')}
            testID={`ai-usage-week-retry-${page.key}`}
            onRetry={() => void timeline.refetch()}
          />
        ) : (
          <AiUsageWeeklyChart
            data={weeklyData}
            isLoading={timelineInitialLoading}
            locale={locale}
            selectedDateKey={page.selectedDateKey}
            onSelectDate={onSelectDate}
          />
        )}
      </View>

      <View className="h-px bg-border" />

      <View className="gap-3">
        <SectionHeader
          detail={selectedDateFormatter.format(parseLocalDateKey(page.selectedDateKey))}
          isError={models.isError && models.hasData}
          isRefreshing={models.isRefreshing}
          retryTestID={`ai-usage-models-refresh-retry-${page.key}`}
          title={t('aiUsage.modelUsage')}
          onRetry={() => void models.refetch()}
        />
        {modelsInitialError ? (
          <SectionError
            message={t('aiUsage.modelLoadError')}
            testID={`ai-usage-models-retry-${page.key}`}
            onRetry={() => void models.refetch()}
          />
        ) : modelsInitialLoading ? (
          <AiUsageModelListSkeleton />
        ) : modelUsage.length > 0 ? (
          <AiUsageModelList key={page.selectedDateKey} items={modelUsage} locale={locale} />
        ) : (
          <View className="min-h-32 items-center justify-center px-6">
            <Text selectable className="text-center text-muted-foreground text-sm">
              {t('aiUsage.noUsageForDay')}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
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

function formatWeekRange(locale: string, from: number, to: number): string {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  });

  return `${formatter.format(fromDate)} - ${formatter.format(toDate)}`;
}
