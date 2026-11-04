import { Button } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { AiUsageInvocation } from '@/shared/data/api/schemas/aiUsageRecords';

import { useAiUsageInvocations } from '../hooks/useAiUsageInvocations';
import { getAiUsageInvocationPurposeKey } from '../utils/aiUsageInvocationPurpose';

export function AiUsageInvocationsSection({ locale }: { locale: string }) {
  const { t } = useTranslation();
  const query = useAiUsageInvocations(true);
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AiUsageInvocation>) => {
      const { record, purpose } = item;
      const id = `ai-usage-invocation-${record.id}`;
      return (
        <View className="gap-1 border-border border-b bg-card p-4" testID={id}>
          <Text className="font-semibold text-foreground" testID={`${id}-purpose`}>
            {t(getAiUsageInvocationPurposeKey(purpose))}
          </Text>
          <Text className="text-foreground" testID={`${id}-model`}>
            {record.modelName || record.modelId}
          </Text>
          <Text className="text-muted-foreground" testID={`${id}-model-id`}>
            {record.modelId}
          </Text>
          <Text className="text-muted-foreground" testID={`${id}-provider`}>
            {record.providerName || record.providerId}
          </Text>
          <Text className="text-muted-foreground" testID={`${id}-time`}>
            {t('aiUsage.invocations.completedAt', {
              time: new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'medium',
              }).format(new Date(record.createdAt)),
            })}
          </Text>
        </View>
      );
    },
    [locale, t],
  );
  return (
    <LegendList
      className="flex-1"
      contentContainerClassName="px-4 py-5"
      data={query.items}
      keyExtractor={(item) => item.record.id}
      renderItem={renderItem}
      recycleItems
      testID="ai-usage-invocations"
      ListHeaderComponent={
        <View className="gap-3 pb-4">
          <Text className="text-muted-foreground">{t('aiUsage.invocations.description')}</Text>
          <Button
            testID="ai-usage-invocations-refresh"
            variant="ghost"
            onPress={() => void query.refresh()}
          >
            <Button.Label>{t('aiUsage.invocations.refresh')}</Button.Label>
          </Button>
        </View>
      }
      ListEmptyComponent={
        query.isLoading ? (
          <Text testID="ai-usage-invocations-loading">{t('aiUsage.invocations.loading')}</Text>
        ) : !query.error ? (
          <Text testID="ai-usage-invocations-empty">{t('aiUsage.invocations.empty')}</Text>
        ) : null
      }
      ListFooterComponent={
        <View className="items-center gap-2 py-4">
          {query.error ? (
            <>
              <Text testID="ai-usage-invocations-error">{t('aiUsage.invocations.loadError')}</Text>
              <Button
                testID="ai-usage-invocations-retry"
                variant="ghost"
                onPress={() => void (query.items.length ? query.loadNext() : query.refresh())}
              >
                <Button.Label>{t('common.retry')}</Button.Label>
              </Button>
            </>
          ) : null}
          {query.hasNext && !query.error ? (
            <Button
              testID="ai-usage-invocations-load-more"
              variant="ghost"
              onPress={() => void query.loadNext()}
            >
              <Button.Label>{t('aiUsage.invocations.loadMore')}</Button.Label>
            </Button>
          ) : null}
        </View>
      }
    />
  );
}
