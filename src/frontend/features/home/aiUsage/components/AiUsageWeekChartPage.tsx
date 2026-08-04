import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAiUsageWeekTimeline } from '../hooks/useAiUsageWeekTimeline';
import type { AiUsageDetailPage } from '../types';
import { AiUsageSectionError, AiUsageSectionStatus } from './AiUsageSectionState';
import { AiUsageWeeklyChart } from './AiUsageWeeklyChart';

type AiUsageWeekChartPageProps = {
  enabled: boolean;
  locale: string;
  page: AiUsageDetailPage;
  todayDateKey: string;
  onSelectDate: (dateKey: string) => void;
};

export function AiUsageWeekChartPage({
  enabled,
  locale,
  page,
  todayDateKey,
  onSelectDate,
}: AiUsageWeekChartPageProps) {
  const { t } = useTranslation();
  const { query, weeklyData } = useAiUsageWeekTimeline({
    enabled,
    range: page.range,
    todayDateKey,
  });
  const isInitialLoading = (query.isLoading || !enabled) && !query.hasData;
  const isInitialError = query.isError && !query.hasData;

  return (
    <View testID={`ai-usage-week-chart-page-${page.key}`}>
      {isInitialError ? (
        <AiUsageSectionError
          message={t('aiUsage.loadError')}
          testID={`ai-usage-week-retry-${page.key}`}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <AiUsageWeeklyChart
          data={weeklyData}
          isLoading={isInitialLoading}
          locale={locale}
          selectedDateKey={page.selectedDateKey}
          statusAccessory={
            query.hasData ? (
              <AiUsageSectionStatus
                isError={query.isError}
                isRefreshing={query.isRefreshing}
                retryTestID={`ai-usage-week-refresh-retry-${page.key}`}
                onRetry={() => void query.refetch()}
              />
            ) : undefined
          }
          onSelectDate={onSelectDate}
        />
      )}
    </View>
  );
}
