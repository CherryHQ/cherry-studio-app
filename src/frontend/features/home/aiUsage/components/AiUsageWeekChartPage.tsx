import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { AiUsageWeekTimelineResult } from '../hooks/useAiUsageWeekTimeline';
import type { AiUsageDetailPage, AiUsageWeeklyData } from '../types';
import { AiUsageSectionError, AiUsageSectionStatus } from './AiUsageSectionState';
import { AiUsageWeeklyChart } from './AiUsageWeeklyChart';

type AiUsageWeekChartPageProps = {
  locale: string;
  page: AiUsageDetailPage;
  timeline?: AiUsageWeekTimelineResult;
  onSelectDate: (dateKey: string) => void;
};

const EMPTY_WEEKLY_DATA: AiUsageWeeklyData = {
  averageTokens: 0,
  days: [],
  series: [],
  totalTokens: 0,
};

export function AiUsageWeekChartPage({
  locale,
  page,
  timeline,
  onSelectDate,
}: AiUsageWeekChartPageProps) {
  const { t } = useTranslation();
  const { hasData, isError, isLoading, isRefreshing, refetch } = timeline?.query ?? {
    hasData: false,
    isError: false,
    isLoading: true,
    isRefreshing: false,
    refetch: undefined,
  };
  const isInitialLoading = isLoading && !hasData;
  const isInitialError = isError && !hasData;

  return (
    <View testID={`ai-usage-week-chart-page-${page.key}`}>
      {isInitialError ? (
        <AiUsageSectionError
          message={t('aiUsage.loadError')}
          testID={`ai-usage-week-retry-${page.key}`}
          onRetry={() => void refetch?.()}
        />
      ) : (
        <AiUsageWeeklyChart
          data={timeline?.weeklyData ?? EMPTY_WEEKLY_DATA}
          isLoading={isInitialLoading}
          locale={locale}
          selectedDateKey={page.selectedDateKey}
          statusAccessory={
            hasData ? (
              <AiUsageSectionStatus
                isError={isError}
                isRefreshing={isRefreshing}
                retryTestID={`ai-usage-week-refresh-retry-${page.key}`}
                onRetry={refetch ? () => void refetch() : undefined}
              />
            ) : undefined
          }
          weekOverWeekChange={timeline?.weekOverWeekChange}
          onSelectDate={onSelectDate}
        />
      )}
    </View>
  );
}
