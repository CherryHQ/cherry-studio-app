import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import InfoIcon from '@cherrystudio/app-icons/icons/info';
import { ActionMenu, Button, InfoPopover } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type {
  AiUsageRecordAnalyticsResponse,
  AiUsageRecordModelPerformance,
} from '@/shared/data/api/schemas/aiUsageRecords';

import { formatUsageNumber } from '../utils/aiUsageAnalytics';
import { SERIES_CLASSES } from './AiUsageBreakdown';

export const PERFORMANCE_LABELS = {
  timeFirstTokenMs: 'chat.messageUsage.firstToken',
  tokensPerSecond: 'chat.messageUsage.modelSpeed',
  timeCompletionMs: 'aiUsage.completion',
  timeThinkingMs: 'aiUsage.thinking',
} as const;

export function AiUsagePerformance({
  performance,
  models,
  locale,
  onSelect,
}: {
  performance: NonNullable<AiUsageRecordAnalyticsResponse['performance']>;
  models: AiUsageRecordModelPerformance[];
  locale: string;
  onSelect: (model: AiUsageRecordModelPerformance) => void;
}) {
  const { t } = useTranslation();
  const [statistic, setStatistic] = useState<'average' | 'median' | 'p95'>('median');
  const statisticLabels = {
    median: t('aiUsage.median'),
    p95: 'P95',
    average: t('aiUsage.average'),
  };
  const maximum = Math.max(0, ...models.map((model) => model[statistic] ?? 0));
  return (
    <View className="gap-6">
      <View className="gap-6 rounded-3xl bg-card p-5">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <Text className="font-semibold text-base text-foreground">
            {t('aiUsage.responsePerformance')}
          </Text>
          <ActionMenu
            items={(['median', 'p95', 'average'] as const).map((value) => ({
              id: value,
              label: statisticLabels[value],
              checked: value === statistic,
              onPress: () => setStatistic(value),
            }))}
          >
            <Button
              accessibilityLabel={`${t('aiUsage.performance')}: ${statisticLabels[statistic]}`}
              size="sm"
              variant="ghost"
            >
              <Button.Label>{statisticLabels[statistic]}</Button.Label>
              <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            </Button>
          </ActionMenu>
        </View>
        <View className="flex-row flex-wrap gap-6">
          {Object.entries(PERFORMANCE_LABELS).map(([metric, label]) => {
            const item = performance[metric as keyof typeof performance];
            const value = item[statistic];
            return (
              <View className="min-w-0 flex-1 basis-[40%] gap-2" key={metric}>
                <Text className="text-muted-foreground text-xs">{t(label)}</Text>
                <View className="gap-1">
                  <Text
                    className="font-semibold text-3xl text-foreground"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {formatUsageNumber(
                      value === null ? null : metric === 'tokensPerSecond' ? value : value / 1000,
                      locale,
                      2,
                    )}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
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
        </View>
      </View>
      <View className="gap-5 px-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-semibold text-base text-foreground">
            {t('chat.messageUsage.firstToken')}
          </Text>
          <InfoPopover
            accessibilityLabel={t('aiUsage.performanceInfo')}
            text={t('aiUsage.performanceInfoDescription')}
          >
            <View className="size-8 items-center justify-center">
              <InfoIcon className="size-4 text-muted-foreground" />
            </View>
          </InfoPopover>
        </View>
        {models.map((model, index) => {
          const value = model[statistic];
          return (
            <Pressable
              key={JSON.stringify([model.providerId, model.modelId])}
              accessibilityRole="button"
              accessibilityLabel={`${model.modelId ?? t('aiUsage.unknownModel')}, ${t('aiUsage.viewRecords')}`}
              className="gap-2"
              onPress={() => onSelect(model)}
            >
              <View className="flex-row items-baseline justify-between gap-3">
                <Text
                  className="min-w-0 flex-1 font-medium text-foreground text-sm"
                  numberOfLines={2}
                >
                  {model.modelId ?? t('aiUsage.unknownModel')}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {formatUsageNumber(value === null ? null : value / 1000, locale, 2)}{' '}
                  {t('aiUsage.secondsUnit')}
                </Text>
              </View>
              <View className="flex-row flex-wrap justify-between gap-2">
                <Text className="shrink text-muted-foreground text-xs">
                  {model.providerName ?? model.providerId ?? t('aiUsage.unknownProvider')}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {t('aiUsage.samples', { value: formatUsageNumber(model.sampleCount, locale) })}
                </Text>
              </View>
              <View className="h-1 overflow-hidden rounded-full bg-secondary">
                <View
                  className={`h-full rounded-full ${SERIES_CLASSES[index % SERIES_CLASSES.length]}`}
                  style={{
                    width: `${maximum > 0 && value !== null ? (value / maximum) * 100 : 0}%`,
                  }}
                />
              </View>
            </Pressable>
          );
        })}
        {models.length === 0 ? (
          <View
            className="gap-6 py-4"
            accessible
            accessibilityLabel={t('aiUsage.samples', { value: formatUsageNumber(0, locale) })}
          >
            {[0, 1, 2].map((index) => (
              <View key={index} className="h-1 rounded-full bg-secondary" />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
