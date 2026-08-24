import { Button, ContentState, Section } from '@cherrystudio/ui/components';
import { type ReactElement, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAiUsageRanking } from '../hooks/useAiUsageRanking';
import type { AiUsageDetailPage, AiUsageRankingGroup } from '../types';
import { AiUsageRankingList, AiUsageRankingListSkeleton } from './AiUsageRankingList';
import { AiUsageSectionError, AiUsageSectionStatus } from './AiUsageSectionState';

type AiUsageRankingSectionProps = {
  enabled: boolean;
  listHeaderComponent: ReactElement;
  locale: string;
  page: AiUsageDetailPage;
};

export function AiUsageRankingSection({
  enabled,
  listHeaderComponent,
  locale,
  page,
}: AiUsageRankingSectionProps) {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<AiUsageRankingGroup>('model');
  const { query, ranking } = useAiUsageRanking({
    enabled,
    groupBy,
    selectedDateKey: page.selectedDateKey,
  });
  const { hasData, isError, isLoading, isRefreshing, refetch } = query;
  const isInitialLoading = (isLoading || !enabled) && !hasData;
  const isInitialError = isError && !hasData;
  const toggleGroupBy = useCallback(() => {
    setGroupBy((currentGroup) => (currentGroup === 'model' ? 'provider' : 'model'));
  }, []);

  const rankingListHeader = (
    <View className="gap-7 pb-2">
      {listHeaderComponent}
      <Section.Header
        className="px-1"
        testID="ai-usage-ranking-section"
        title={
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <Text
              selectable
              className="shrink font-medium text-foreground text-sm"
              numberOfLines={1}
            >
              {t('aiUsage.mostUsed')}
            </Text>
            <AiUsageSectionStatus
              isError={isError && hasData}
              isRefreshing={isRefreshing}
              retryTestID={`ai-usage-ranking-refresh-retry-${page.key}`}
              onRetry={() => void refetch()}
            />
          </View>
        }
      >
        <Button
          size="xs"
          testID="ai-usage-toggle-ranking-group"
          variant="ghost"
          onPress={toggleGroupBy}
        >
          <Button.Label numberOfLines={1}>
            {groupBy === 'model' ? t('aiUsage.showProviders') : t('aiUsage.showModels')}
          </Button.Label>
        </Button>
      </Section.Header>
    </View>
  );
  const emptyState = isInitialError ? (
    <AiUsageSectionError
      message={t('aiUsage.rankingLoadError')}
      testID={`ai-usage-ranking-retry-${page.key}`}
      onRetry={() => void refetch()}
    />
  ) : isInitialLoading ? (
    <AiUsageRankingListSkeleton />
  ) : (
    <ContentState.Empty className="min-h-32 px-6" description={t('aiUsage.noUsageForDay')} />
  );

  return (
    <AiUsageRankingList
      emptyState={emptyState}
      items={isInitialError || isInitialLoading ? [] : ranking}
      listHeaderComponent={rankingListHeader}
      locale={locale}
      resetKey={`${page.selectedDateKey}:${groupBy}`}
    />
  );
}
