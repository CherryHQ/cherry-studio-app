import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { ActionMenu, Button, Section } from '@cherrystudio/ui/components';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type {
  AiUsageRecordAnalyticsResponse,
  AiUsageRecordGroupBy,
  AiUsageRecordMetric,
  AiUsageRecordStatsBucket,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { Currency } from '@/shared/data/types/model';

import {
  formatUsageCost,
  formatUsageNumber,
  usageGroupKey,
  usageKnownMetricValue,
  usageMetricValue,
} from '../utils/aiUsageAnalytics';

const SERIES_CLASSES = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const;
export const GROUP_LABELS = {
  model: 'chat.messageUsage.model',
  provider: 'chat.messageUsage.provider',
  source: 'aiUsage.source',
  apiKey: 'settings.provider.apiService.apiKey',
} as const;

export function usageGroupLabel(bucket: AiUsageRecordStatsBucket, t: TFunction): string {
  switch (bucket.groupBy) {
    case 'model':
      return bucket.modelId || t('aiUsage.unknownModel');
    case 'provider':
      return bucket.providerName || bucket.providerId || t('aiUsage.unknownProvider');
    case 'source':
      return bucket.sourceName || bucket.sourceId || t('aiUsage.unknown');
    case 'apiKey':
      return (
        [bucket.apiKeyLabel, bucket.apiKeyMasked].filter(Boolean).join(' · ') ||
        bucket.authMethod ||
        t('aiUsage.unknown')
      );
  }
}

export function AiUsageBreakdown({
  data,
  groupBy,
  metric,
  currency,
  locale,
  onGroupChange,
  onSelect,
}: {
  data: AiUsageRecordAnalyticsResponse;
  groupBy: AiUsageRecordGroupBy;
  metric: AiUsageRecordMetric;
  currency: Currency;
  locale: string;
  onGroupChange: (group: AiUsageRecordGroupBy) => void;
  onSelect: (bucket: AiUsageRecordStatsBucket) => void;
}) {
  const { t } = useTranslation();
  const total = usageMetricValue(data.stats.totals, metric);
  const format = (value: number | null) =>
    metric === 'cost' ? formatUsageCost(value, currency, locale) : formatUsageNumber(value, locale);
  const buckets = data.stats.buckets;
  const other = usageKnownMetricValue(data.stats.other, metric);
  return (
    <View className="gap-4">
      <Section.Header title={t('aiUsage.distribution')}>
        <ActionMenu
          items={(Object.keys(GROUP_LABELS) as AiUsageRecordGroupBy[]).map((value) => ({
            id: value,
            label: t(GROUP_LABELS[value]),
            checked: value === groupBy,
            onPress: () => onGroupChange(value),
          }))}
        >
          <Button size="sm" variant="ghost">
            {t(GROUP_LABELS[groupBy])}
          </Button>
        </ActionMenu>
      </Section.Header>
      {total > 0 ? (
        <View
          className="h-3 flex-row gap-1 overflow-hidden rounded-full"
          accessible
          accessibilityLabel={t('aiUsage.distribution')}
        >
          {buckets.map((bucket, index) => {
            const value = usageMetricValue(bucket, metric);
            return value > 0 ? (
              <View
                key={usageGroupKey(bucket)}
                className={SERIES_CLASSES[index % SERIES_CLASSES.length]}
                style={{ flex: value }}
              />
            ) : null;
          })}
          {other !== null && other > 0 ? (
            <View className="bg-chart-5" style={{ flex: other }} />
          ) : null}
        </View>
      ) : null}
      <View>
        {buckets.map((bucket, index) => {
          const value = usageKnownMetricValue(bucket, metric);
          const label = usageGroupLabel(bucket, t);
          const subtitle =
            bucket.groupBy === 'model' || bucket.groupBy === 'apiKey'
              ? bucket.providerName || bucket.providerId
              : null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${format(value)}, ${t('aiUsage.viewRecords')}`}
              key={usageGroupKey(bucket)}
              onPress={() => onSelect(bucket)}
            >
              <View className="flex-row items-center gap-3 py-3">
                <View
                  className={`h-8 w-1.5 rounded-full ${SERIES_CLASSES[index % SERIES_CLASSES.length]}`}
                />
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-medium text-foreground text-sm" numberOfLines={2}>
                    {label}
                  </Text>
                  {subtitle ? (
                    <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <View className="max-w-[45%] items-end gap-1">
                  <Text className="font-medium text-foreground text-sm">{format(value)}</Text>
                  <Text className="text-muted-foreground text-xs">
                    {value === null
                      ? '—'
                      : new Intl.NumberFormat(locale, {
                          style: 'percent',
                          maximumFractionDigits: 1,
                        }).format(total > 0 ? value / total : 0)}
                  </Text>
                </View>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </View>
            </Pressable>
          );
        })}
        {data.stats.other.recordCount > 0 ? (
          <AiUsageValueRow label={t('aiUsage.other')} value={format(other)} />
        ) : null}
      </View>
    </View>
  );
}

export function AiUsageValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-2">
      <Text className="flex-1 text-muted-foreground text-sm">{label}</Text>
      <Text
        className="max-w-[60%] text-right font-medium text-foreground text-sm"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}

export function AiUsageComposition({
  data,
  locale,
}: {
  data: AiUsageRecordAnalyticsResponse;
  locale: string;
}) {
  const { t } = useTranslation();
  const c = data.composition;
  const fields = [
    ['chat.messageUsage.input', c.inputTokens],
    ['chat.messageUsage.noCache', c.noCacheTokens],
    ['chat.messageUsage.cacheRead', c.cacheReadTokens],
    ['chat.messageUsage.cacheWrite', c.cacheWriteTokens],
    ['chat.messageUsage.output', c.outputTokens],
    ['chat.messageUsage.reasoning', c.reasoningTokens],
    ['aiUsage.images', c.imageCount],
  ] as const;
  return (
    <View className="gap-2">
      <Section.Header title={t('aiUsage.tokenComposition')} />
      {fields.map(([key, value]) => (
        <AiUsageValueRow key={key} label={t(key)} value={formatUsageNumber(value, locale)} />
      ))}
      <Text className="text-muted-foreground text-xs">{t('aiUsage.compositionHint')}</Text>
      <Section.Header title={t('aiUsage.costCoverage')} />
      <AiUsageValueRow
        label={t('chat.messageUsage.costBilled')}
        value={formatUsageNumber(data.providerReportedRequestCount, locale)}
      />
      <AiUsageValueRow
        label={t('chat.messageUsage.costEstimated')}
        value={formatUsageNumber(data.computedRequestCount, locale)}
      />
      <AiUsageValueRow
        label={t('aiUsage.unpriced')}
        value={formatUsageNumber(data.stats.totals.unpricedRequestCount, locale)}
      />
    </View>
  );
}
