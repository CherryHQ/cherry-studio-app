import { Section, Tabs } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { AiUsageRecordAnalyticsResponse } from '@/shared/data/api/schemas/aiUsageRecords';

import { formatUsageNumber } from '../utils/aiUsageAnalytics';

export const PERFORMANCE_LABELS = {
  timeFirstTokenMs: 'chat.messageUsage.firstToken',
  timeCompletionMs: 'aiUsage.completion',
  timeThinkingMs: 'aiUsage.thinking',
  tokensPerSecond: 'chat.messageUsage.modelSpeed',
} as const;

export function AiUsagePerformance({
  performance,
  locale,
}: {
  performance: NonNullable<AiUsageRecordAnalyticsResponse['performance']>;
  locale: string;
}) {
  const { t } = useTranslation();
  const [statistic, setStatistic] = useState<'average' | 'median' | 'p95'>('median');
  return (
    <View className="gap-5">
      <Tabs
        accessibilityLabel={t('aiUsage.performance')}
        value={statistic}
        onValueChange={setStatistic}
        items={[
          { value: 'average', label: t('aiUsage.average') },
          { value: 'median', label: t('aiUsage.median') },
          { value: 'p95', label: 'P95' },
        ]}
      />
      {Object.entries(PERFORMANCE_LABELS).map(([metric, label]) => {
        const item = performance[metric as keyof typeof performance];
        const value = item[statistic];
        return (
          <View className="gap-1" key={metric}>
            <Section.Header title={t(label)} />
            <View className="flex-row items-baseline gap-2">
              <Text className="font-semibold text-3xl text-foreground">
                {formatUsageNumber(
                  value === null ? null : metric === 'tokensPerSecond' ? value : value / 1000,
                  locale,
                  2,
                )}
              </Text>
              <Text className="text-muted-foreground text-sm">
                {metric === 'tokensPerSecond'
                  ? t('aiUsage.tokensPerSecondUnit')
                  : t('aiUsage.secondsUnit')}
              </Text>
            </View>
            <Text className="text-muted-foreground text-xs">
              {t('aiUsage.samples', { value: formatUsageNumber(item.sampleCount, locale) })}
            </Text>
          </View>
        );
      })}
      <Text className="text-muted-foreground text-xs">{t('aiUsage.performanceHint')}</Text>
    </View>
  );
}
