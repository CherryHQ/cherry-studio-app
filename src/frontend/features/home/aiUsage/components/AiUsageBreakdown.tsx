import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import InfoIcon from '@cherrystudio/app-icons/icons/info';
import {
  ActionMenu,
  Button,
  ContentState,
  InfoPopover,
  OptionPickerBottomSheet,
} from '@cherrystudio/ui/components';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useQuery } from '@/frontend/data';
import { formatCompactNumber } from '@/frontend/utils/compactNumber';
import type {
  AiUsageRecordAnalyticsResponse,
  AiUsageRecordFilters,
  AiUsageRecordGroupBy,
  AiUsageRecordMetric,
  AiUsageRecordStatsBucket,
  AiUsageRecordStatsGroupIdentity,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { Currency } from '@/shared/data/types/model';

import {
  formatUsageCost,
  formatUsageNumber,
  usageGroupKey,
  usageKnownMetricValue,
  usageMetricValue,
  usageTokenParts,
  type UsageRange,
} from '../utils/aiUsageAnalytics';

export const SERIES_CLASSES = [
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

export function usageGroupLabel(bucket: AiUsageRecordStatsGroupIdentity, t: TFunction): string {
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
  range,
  filters,
  locale,
  onGroupChange,
  onMetricChange,
  onSelect,
}: {
  data: AiUsageRecordAnalyticsResponse;
  groupBy: AiUsageRecordGroupBy;
  metric: AiUsageRecordMetric;
  range: UsageRange;
  filters: AiUsageRecordFilters;
  locale: string;
  onGroupChange: (group: AiUsageRecordGroupBy) => void;
  onMetricChange: (metric: AiUsageRecordMetric) => void;
  onSelect: (bucket: AiUsageRecordStatsBucket) => void;
}) {
  const { t } = useTranslation();
  const [groupOpen, setGroupOpen] = useState(false);
  return (
    <View className="gap-5 px-1">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-semibold text-base text-foreground">{t('aiUsage.distribution')}</Text>
        <Button variant="ghost" size="inline" onPress={() => setGroupOpen(true)}>
          <Text className="text-muted-foreground text-xs">{t(GROUP_LABELS[groupBy])}</Text>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </View>
      <View className="items-end">
        <AiUsageMetricSelect metric={metric} onChange={onMetricChange} />
      </View>
      {metric === 'cost' && data.timeline.costTotals.length > 0 ? (
        data.timeline.costTotals.map(({ currency }) => (
          <AiUsageCurrencyBreakdown
            key={currency}
            range={range}
            filters={filters}
            groupBy={groupBy}
            currency={currency}
            locale={locale}
            onSelect={onSelect}
          />
        ))
      ) : (
        <AiUsageRanking data={data} metric={metric} locale={locale} onSelect={onSelect} />
      )}
      {groupOpen ? (
        <OptionPickerBottomSheet
          open
          size="compact"
          title={t('aiUsage.distribution')}
          onClose={() => setGroupOpen(false)}
          selectedValue={groupBy}
          onValueChange={onGroupChange}
          options={(Object.keys(GROUP_LABELS) as AiUsageRecordGroupBy[]).map((value) => ({
            value,
            label: t(GROUP_LABELS[value]),
          }))}
        />
      ) : null}
    </View>
  );
}

function AiUsageCurrencyBreakdown({
  range,
  filters,
  groupBy,
  currency,
  locale,
  onSelect,
}: {
  range: UsageRange;
  filters: AiUsageRecordFilters;
  groupBy: AiUsageRecordGroupBy;
  currency: Currency;
  locale: string;
  onSelect: (bucket: AiUsageRecordStatsBucket) => void;
}) {
  const { t } = useTranslation();
  const query = useQuery('/ai-usage-records/analytics', {
    query: {
      ...filters,
      from: range.from,
      to: range.to,
      groupBy,
      metric: 'cost',
      currency,
      limit: 10,
    },
  });
  return (
    <View className="gap-2">
      <Text className="text-muted-foreground text-xs">{currency}</Text>
      {query.isLoading ? (
        <ContentState.Loading title={t('aiUsage.loading')} />
      ) : query.isError ? (
        <ContentState.Error
          title={t('aiUsage.loadError')}
          primaryAction={{ children: t('aiUsage.retry'), onPress: () => void query.refetch() }}
        />
      ) : query.data ? (
        <AiUsageRanking
          data={query.data}
          metric="cost"
          currency={currency}
          locale={locale}
          onSelect={onSelect}
        />
      ) : null}
    </View>
  );
}

function AiUsageRanking({
  data,
  metric,
  currency,
  locale,
  onSelect,
}: {
  data: AiUsageRecordAnalyticsResponse;
  metric: AiUsageRecordMetric;
  currency?: Currency;
  locale: string;
  onSelect: (bucket: AiUsageRecordStatsBucket) => void;
}) {
  const { t } = useTranslation();
  const total = usageMetricValue(data.stats.totals, metric);
  const format = (value: number | null) =>
    value === null
      ? '—'
      : currency
        ? formatUsageCost(value, currency, locale, 'narrowSymbol')
        : formatCompactNumber(value);
  const buckets = data.stats.buckets.filter(
    (bucket) => metric !== 'cost' || bucket.costRecordCount > 0,
  );
  const share = (value: number | null) =>
    total > 0 && value !== null ? Math.min(1, value / total) : 0;
  const percent = (value: number | null) =>
    value === null
      ? '—'
      : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
          share(value),
        );
  const other = usageKnownMetricValue(data.stats.other, metric);
  return (
    <View className="gap-6">
      {buckets.length === 0 ? (
        <View
          className="flex-row justify-around py-6"
          accessible
          accessibilityLabel={t(
            data.stats.totals.recordCount === 0 ? 'aiUsage.noRecords' : 'aiUsage.unpriced',
          )}
        >
          {[0, 1, 2].map((index) => (
            <View key={index} className="h-24 w-9 rounded-xl bg-secondary" />
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-3">
        {buckets.slice(0, 3).map((bucket, index) => {
          const value = usageKnownMetricValue(bucket, metric);
          const label = usageGroupLabel(bucket, t);
          return (
            <Pressable
              key={usageGroupKey(bucket)}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${formatUsageNumber(value, locale, currency ? 4 : 0)}, ${percent(value)}, ${t('aiUsage.viewRecords')}`}
              className="min-w-0 flex-1 items-center gap-2"
              onPress={() => onSelect(bucket)}
            >
              <Text
                className="font-semibold text-2xl text-foreground"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {percent(value)}
              </Text>
              <View className="h-24 w-9 justify-end overflow-hidden rounded-xl bg-secondary">
                <View
                  className={`w-full rounded-t-sm ${SERIES_CLASSES[index]}`}
                  style={{ height: `${share(value) * 100}%` }}
                />
              </View>
              <Text className="text-center font-medium text-foreground text-xs" numberOfLines={2}>
                {label}
              </Text>
              {(bucket.groupBy === 'model' || bucket.groupBy === 'apiKey') &&
              bucket.providerName ? (
                <Text className="text-center text-muted-foreground text-xs" numberOfLines={1}>
                  {bucket.providerName}
                </Text>
              ) : null}
              <Text className="text-center text-muted-foreground text-xs">{format(value)}</Text>
            </Pressable>
          );
        })}
      </View>
      {buckets.slice(3).map((bucket, index) => {
        const value = usageKnownMetricValue(bucket, metric);
        const label = usageGroupLabel(bucket, t);
        return (
          <Pressable
            key={usageGroupKey(bucket)}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${format(value)}, ${t('aiUsage.viewRecords')}`}
            className="gap-2"
            onPress={() => onSelect(bucket)}
          >
            <View className="flex-row items-center justify-between gap-3">
              <Text className="min-w-0 flex-1 text-foreground text-sm" numberOfLines={2}>
                {label}
              </Text>
              <Text className="text-muted-foreground text-xs">{format(value)}</Text>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </View>
            {(bucket.groupBy === 'model' || bucket.groupBy === 'apiKey') && bucket.providerName ? (
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                {bucket.providerName}
              </Text>
            ) : null}
            <View className="h-1 overflow-hidden rounded-full bg-secondary">
              <View
                className={`h-full rounded-full ${SERIES_CLASSES[(index + 3) % SERIES_CLASSES.length]}`}
                style={{ width: `${share(value) * 100}%` }}
              />
            </View>
          </Pressable>
        );
      })}
      {(metric === 'cost' ? data.stats.other.costRecordCount : data.stats.other.recordCount) > 0 ? (
        <AiUsageValueRow label={t('aiUsage.other')} value={format(other)} />
      ) : null}
    </View>
  );
}

export function AiUsageMetricSelect({
  metric,
  onChange,
}: {
  metric: AiUsageRecordMetric;
  onChange: (metric: AiUsageRecordMetric) => void;
}) {
  const { t } = useTranslation();
  const labels = {
    tokens: t('aiUsage.tokens'),
    cost: t('aiUsage.cost'),
    requests: t('aiUsage.calls'),
  };
  return (
    <ActionMenu
      items={(['tokens', 'cost', 'requests'] as const).map((value) => ({
        id: value,
        label: labels[value],
        checked: value === metric,
        onPress: () => onChange(value),
      }))}
    >
      <Button
        accessibilityLabel={`${t('aiUsage.metric')}: ${labels[metric]}`}
        size="sm"
        variant="ghost"
      >
        <Button.Label>{labels[metric]}</Button.Label>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </Button>
    </ActionMenu>
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
  const isEmpty = data.stats.totals.recordCount === 0;
  const parts = usageTokenParts(c.totalTokens, c.inputTokens ?? 0, c.outputTokens ?? 0);
  const format = (value: number | null) =>
    isEmpty ? '0' : value === null ? '—' : formatCompactNumber(value);
  const groups = [
    {
      label: t('chat.messageUsage.input'),
      total: c.inputTokens,
      color: 'bg-chart-1',
      children: [
        [t('chat.messageUsage.noCache'), c.noCacheTokens],
        [t('chat.messageUsage.cacheRead'), c.cacheReadTokens],
        [t('chat.messageUsage.cacheWrite'), c.cacheWriteTokens],
      ] as const,
    },
    {
      label: t('chat.messageUsage.output'),
      total: c.outputTokens,
      color: 'bg-chart-2',
      children: [[t('aiUsage.reasoningSubset'), c.reasoningTokens]] as const,
    },
  ];
  return (
    <View className="gap-5 rounded-3xl bg-card p-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-semibold text-base text-foreground">
          {t('aiUsage.tokenComposition')}
        </Text>
        <InfoPopover
          accessibilityLabel={t('aiUsage.compositionInfo')}
          text={t('aiUsage.compositionHint')}
        >
          <View className="size-8 items-center justify-center">
            <InfoIcon className="size-4 text-muted-foreground" />
          </View>
        </InfoPopover>
      </View>
      <View className="flex-row gap-6">
        {groups.map((group) => (
          <View key={group.label} className="min-w-0 flex-1 gap-1">
            <View className="flex-row items-center gap-1.5">
              <View className={`size-1.5 rounded-full ${group.color}`} />
              <Text className="shrink text-muted-foreground text-xs">{group.label}</Text>
            </View>
            <Text
              className="font-semibold text-3xl text-foreground"
              accessibilityLabel={formatUsageNumber(isEmpty ? 0 : group.total, locale)}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {format(group.total)}
            </Text>
          </View>
        ))}
      </View>
      <View
        className="h-2.5 flex-row gap-0.5 overflow-hidden rounded-full bg-secondary"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {parts.input > 0 ? <View className="bg-chart-1" style={{ flex: parts.input }} /> : null}
        {parts.output > 0 ? <View className="bg-chart-2" style={{ flex: parts.output }} /> : null}
        {parts.unclassified > 0 ? (
          <View className="bg-chart-5" style={{ flex: parts.unclassified }} />
        ) : null}
      </View>
      <View className="flex-row gap-6">
        {groups.map((group) => (
          <View key={group.label} className="min-w-0 flex-1 gap-3">
            {group.children.map(([label, value]) => (
              <View key={label} className="flex-row flex-wrap items-baseline justify-between gap-1">
                <Text className="shrink text-muted-foreground text-xs">{label}</Text>
                <Text
                  className="text-foreground text-xs"
                  accessibilityLabel={formatUsageNumber(isEmpty ? 0 : value, locale)}
                >
                  {format(value)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {parts.unclassified > 0 ? (
        <AiUsageValueRow
          label={t('aiUsage.unclassifiedTokens')}
          value={format(parts.unclassified)}
        />
      ) : null}
    </View>
  );
}
