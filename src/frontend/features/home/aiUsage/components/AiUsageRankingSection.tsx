import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Section } from '@/frontend/components/Section';

import { useAiUsageRanking } from '../hooks/useAiUsageRanking';
import type { AiUsageDetailPage, AiUsageRankingGroup } from '../types';
import { AiUsageRankingList, AiUsageRankingListSkeleton } from './AiUsageRankingList';
import {
  AiUsageSectionAction,
  AiUsageSectionError,
  AiUsageSectionStatus,
} from './AiUsageSectionState';

type AiUsageRankingSectionProps = {
  enabled: boolean;
  locale: string;
  page: AiUsageDetailPage;
};

export function AiUsageRankingSection({ enabled, locale, page }: AiUsageRankingSectionProps) {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<AiUsageRankingGroup>('model');
  const { query, ranking } = useAiUsageRanking({
    enabled,
    groupBy,
    selectedDateKey: page.selectedDateKey,
  });
  const isInitialLoading = (query.isLoading || !enabled) && !query.hasData;
  const isInitialError = query.isError && !query.hasData;
  const toggleGroupBy = useCallback(() => {
    setGroupBy((currentGroup) => (currentGroup === 'model' ? 'provider' : 'model'));
  }, []);

  return (
    <Section
      action={
        <AiUsageSectionAction
          label={groupBy === 'model' ? t('aiUsage.showProviders') : t('aiUsage.showModels')}
          testID="ai-usage-toggle-ranking-group"
          onPress={toggleGroupBy}
        />
      }
      testID="ai-usage-ranking-section"
      title={t('aiUsage.mostUsed')}
      titleAccessory={
        <AiUsageSectionStatus
          isError={query.isError && query.hasData}
          isRefreshing={query.isRefreshing}
          retryTestID={`ai-usage-ranking-refresh-retry-${page.key}`}
          onRetry={() => void query.refetch()}
        />
      }
    >
      <View className="p-4">
        {isInitialError ? (
          <AiUsageSectionError
            message={t('aiUsage.rankingLoadError')}
            testID={`ai-usage-ranking-retry-${page.key}`}
            onRetry={() => void query.refetch()}
          />
        ) : isInitialLoading ? (
          <AiUsageRankingListSkeleton />
        ) : ranking.length > 0 ? (
          <AiUsageRankingList
            items={ranking}
            locale={locale}
            resetKey={`${page.selectedDateKey}:${groupBy}`}
          />
        ) : (
          <View className="min-h-32 items-center justify-center px-6">
            <Text selectable className="text-center text-muted-foreground text-sm">
              {t('aiUsage.noUsageForDay')}
            </Text>
          </View>
        )}
      </View>
    </Section>
  );
}
