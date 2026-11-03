import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import {
  ActionMenu,
  Button,
  ContentState,
  Section,
  SearchField,
} from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiUsageDetail, AiUsageDetailRow } from '@/frontend/components/AiUsageDetail';
import { ModelAvatar } from '@/frontend/components/Avatar';
import { useInfiniteQuery, useQuery } from '@/frontend/data';
import { formatAiUsageCost } from '@/frontend/utils/aiUsage';
import type { AiUsageRecordFilters } from '@/shared/data/api/schemas/aiUsageRecords';
import {
  type AiUsageRecordEntry,
  getAiUsageRecordTotalTokens,
} from '@/shared/data/types/aiUsageRecord';
import type { Currency } from '@/shared/data/types/model';
import { getAiUsageRecordTokensPerSecond } from '@/shared/utils/aiUsage';

import { formatUsageDate, formatUsageNumber, type UsageRange } from '../utils/aiUsageAnalytics';

type RecordSort = { field: 'createdAt' | 'totalTokens' } | { field: 'cost'; currency: Currency };

const SORT_LABELS = {
  createdAt: 'aiUsage.sortRecent',
  totalTokens: 'aiUsage.sortMostTokens',
  cost: 'aiUsage.sortHighestCost',
} as const;

export const MODALITY_LABELS = {
  language: 'settings.provider.models.classification.text',
  image: 'settings.provider.models.classification.image',
  embedding: 'settings.provider.models.classification.embedding',
  rerank: 'settings.provider.models.classification.rerank',
} as const;

export function AiUsageRecords({
  range,
  filters,
  locale,
  scopeLabel,
  searchDraft,
  onSearchDraftChange,
  onSearch,
}: {
  range: UsageRange;
  filters: AiUsageRecordFilters;
  locale: string;
  scopeLabel?: string;
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onSearch: (value: string) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [sort, setSort] = useState<RecordSort>({ field: 'createdAt' });
  const pricingQuery = useQuery('/ai-usage-records/analytics', {
    query: {
      ...filters,
      from: range.from,
      to: range.to,
      groupBy: 'model',
      metric: 'tokens',
      limit: 1,
      includePerformance: false,
    },
  });
  const currencies = pricingQuery.data?.timeline.costTotals.map((item) => item.currency) ?? [];
  const sortBy =
    sort.field === 'cost' && pricingQuery.data && !currencies.includes(sort.currency)
      ? 'createdAt'
      : sort.field;
  const currency = sortBy === 'cost' && sort.field === 'cost' ? sort.currency : undefined;
  const sortLabel = t(SORT_LABELS[sortBy], { currency });
  const [selected, setSelected] = useState<AiUsageRecordEntry>();
  const query = useInfiniteQuery('/ai-usage-records', {
    limit: 50,
    query: {
      ...filters,
      from: range.from,
      to: range.to,
      sortBy,
      sortOrder: 'desc',
      ...(sortBy === 'cost' ? { costCurrency: currency } : {}),
    },
  });
  const items = query.pages.flatMap((page) => page.items);
  return (
    <>
      <FlatList
        key={JSON.stringify([range, filters, sortBy, currency])}
        data={items}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={RecordSeparator}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        refreshing={query.isRefreshing && !query.isLoadingMore}
        onRefresh={() => void Promise.all([query.refresh(), pricingQuery.refetch()])}
        onEndReached={() => void query.loadNext()}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <View className="gap-3 pb-3">
            <Text className="text-muted-foreground text-xs">
              {range.period === 'all'
                ? t('aiUsage.periodAll')
                : `${formatUsageDate(range.from, locale)} – ${formatUsageDate(range.to, locale)}`}
              {scopeLabel ? ` · ${scopeLabel}` : null}
            </Text>
            <SearchField
              accessibilityLabel={t('aiUsage.search')}
              placeholder={t('aiUsage.search')}
              clearAccessibilityLabel={t('common.clear')}
              value={searchDraft}
              onChangeText={(value) => onSearchDraftChange(value.slice(0, 200))}
              onSubmitEditing={() => onSearch(searchDraft)}
              onClear={() => onSearch('')}
            />
            <Section.Header
              title={t('aiUsage.recordCount', {
                value: formatUsageNumber(query.pages[0]?.total ?? 0, locale),
              })}
            >
              <ActionMenu
                items={[
                  ...(['createdAt', 'totalTokens'] as const).map((field) => ({
                    id: field,
                    label: t(SORT_LABELS[field]),
                    checked: field === sortBy,
                    onPress: () => setSort({ field }),
                  })),
                  ...currencies.map((value) => ({
                    id: `cost-${value}`,
                    label: t('aiUsage.sortHighestCost', { currency: value }),
                    checked: sortBy === 'cost' && currency === value,
                    onPress: () => setSort({ field: 'cost', currency: value }),
                  })),
                ]}
              >
                <Button size="sm" variant="ghost">
                  {sortLabel}
                </Button>
              </ActionMenu>
            </Section.Header>
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <ContentState.Loading title={t('aiUsage.loading')} />
          ) : query.error ? (
            <ContentState.Error
              title={t('aiUsage.loadError')}
              primaryAction={{ children: t('aiUsage.retry'), onPress: () => void query.refresh() }}
            />
          ) : (
            <ContentState.Empty title={t('aiUsage.noRecords')} />
          )
        }
        ListFooterComponent={
          items.length > 0 ? (
            <View className="py-4">
              {query.error ? (
                <ContentState.Error
                  title={t('aiUsage.loadError')}
                  primaryAction={{
                    children: t('aiUsage.retry'),
                    onPress: () => void (query.hasNext ? query.loadNext() : query.refresh()),
                  }}
                />
              ) : query.hasNext ? (
                <Button
                  loading={query.isLoadingMore}
                  variant="ghost"
                  onPress={() => void query.loadNext()}
                >
                  {t('aiUsage.showMore')}
                </Button>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const totalTokens = getAiUsageRecordTotalTokens(item);
          const value =
            sortBy === 'cost'
              ? item.cost !== null && item.costCurrency
                ? formatAiUsageCost(item.cost, item.costCurrency, locale)
                : '—'
              : formatUsageNumber(totalTokens, locale);
          const unit = sortBy === 'cost' ? currency : t('aiUsage.tokens');
          const summary = [
            sortBy === 'cost'
              ? totalTokens === null
                ? undefined
                : `${formatUsageNumber(totalTokens, locale)} ${t('aiUsage.tokens')}`
              : item.cost !== null && item.costCurrency
                ? formatAiUsageCost(item.cost, item.costCurrency, locale)
                : undefined,
            item.timeCompletionMs !== null
              ? `${formatUsageNumber(item.timeCompletionMs / 1000, locale, 2)} ${t('aiUsage.secondsUnit')}`
              : undefined,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.modelName || item.modelId || t('aiUsage.unknownModel')}, ${t('aiUsage.viewDetails')}`}
              onPress={() => setSelected(item)}
            >
              <View className="flex-row items-start gap-3 py-4">
                <ModelAvatar model={recordModel(item, t('aiUsage.unknownModel'))} size={28} />
                <View className="min-w-0 flex-1 gap-3">
                  <View className="gap-0.5">
                    <View className="flex-row items-baseline gap-3">
                      <Text
                        className="min-w-0 flex-1 font-medium text-foreground text-sm"
                        numberOfLines={2}
                      >
                        {item.modelName || item.modelId || t('aiUsage.unknownModel')}
                      </Text>
                      <Text
                        adjustsFontSizeToFit
                        className="max-w-[45%] font-medium text-foreground text-xl tabular-nums"
                        minimumFontScale={0.6}
                        numberOfLines={1}
                      >
                        {value}
                      </Text>
                    </View>
                    <View className="flex-row items-baseline gap-3">
                      <Text
                        className="min-w-0 flex-1 text-muted-foreground text-xs"
                        numberOfLines={1}
                      >
                        {item.providerName || item.providerId || t('aiUsage.unknownProvider')}
                      </Text>
                      <Text className="max-w-[45%] text-right text-muted-foreground text-xs">
                        {unit}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-baseline gap-3">
                    <Text className="min-w-0 flex-1 font-mono text-muted-foreground text-xs">
                      {new Intl.DateTimeFormat(locale, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(item.createdAt))}
                    </Text>
                    <Text className="max-w-[60%] shrink text-right text-muted-foreground text-xs tabular-nums">
                      {summary}
                    </Text>
                  </View>
                  {item.recordKind === 'legacy-aggregate' ? (
                    <Text className="text-muted-foreground text-xs">{t('aiUsage.legacy')}</Text>
                  ) : null}
                </View>
                <View className="self-center">
                  <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      {selected ? (
        <AiUsageRecordDetail
          entry={selected}
          locale={locale}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </>
  );
}

function AiUsageRecordDetail({
  entry,
  locale,
  onClose,
}: {
  entry: AiUsageRecordEntry;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [metadataOpen, setMetadataOpen] = useState(false);
  const costLabels = {
    input: 'chat.messageUsage.input',
    output: 'chat.messageUsage.output',
    cacheRead: 'chat.messageUsage.cacheRead',
    cacheWrite: 'chat.messageUsage.cacheWrite',
    image: 'aiUsage.images',
  } as const;
  return (
    <AiUsageDetail
      model={recordModel(entry, t('aiUsage.unknownModel'))}
      providerName={entry.providerName || entry.providerId || t('aiUsage.unknownProvider')}
      createdAt={entry.createdAt}
      onClose={onClose}
      title={t('aiUsage.recordDetail')}
      detail={{
        totalTokens: getAiUsageRecordTotalTokens(entry) ?? undefined,
        inputTokens: entry.inputTokens ?? undefined,
        outputTokens: entry.outputTokens ?? undefined,
        reasoningTokens: entry.reasoningTokens ?? undefined,
        noCacheTokens: entry.noCacheTokens ?? undefined,
        cacheReadTokens: entry.cacheReadTokens ?? undefined,
        cacheWriteTokens: entry.cacheWriteTokens ?? undefined,
        imageCount: entry.imageCount ?? undefined,
        requestCount: entry.requestCount,
        durationMs: entry.timeCompletionMs ?? undefined,
        firstTokenMs: entry.timeFirstTokenMs ?? undefined,
        thinkingMs: entry.timeThinkingMs ?? undefined,
        modelTokensPerSecond: getAiUsageRecordTokensPerSecond(entry) ?? undefined,
        costs:
          entry.cost !== null && entry.costCurrency
            ? [
                {
                  currency: entry.costCurrency,
                  amount: entry.cost,
                  providerReportedRequestCount:
                    entry.costSource === 'provider' ? entry.requestCount : 0,
                  computedRequestCount: entry.costSource === 'computed' ? entry.requestCount : 0,
                },
              ]
            : [],
      }}
      costDetails={
        entry.costBreakdown && entry.costCurrency ? (
          <View className="gap-2">
            {(Object.keys(costLabels) as (keyof typeof costLabels)[]).map((key) => {
              const value = entry.costBreakdown?.[key];
              return value === undefined ? null : (
                <AiUsageDetailRow
                  key={key}
                  label={t(costLabels[key])}
                  value={formatAiUsageCost(value, entry.costCurrency!, locale)}
                />
              );
            })}
          </View>
        ) : null
      }
    >
      {entry.recordKind === 'legacy-aggregate' ? (
        <Text className="text-muted-foreground text-xs">{t('aiUsage.legacyHint')}</Text>
      ) : null}
      <View className="gap-4">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: metadataOpen }}
          className="min-h-11 flex-row items-center justify-between gap-3"
          onPress={() => setMetadataOpen(!metadataOpen)}
        >
          <Text className="font-medium text-foreground text-sm">{t('common.more')}</Text>
          <ChevronDownIcon
            className={`size-4 text-muted-foreground ${metadataOpen ? 'rotate-180' : ''}`}
          />
        </Pressable>
        {metadataOpen ? (
          <View className="gap-4">
            {entry.modelId ? (
              <AiUsageDetailRow label={t('aiUsage.modelId')} value={entry.modelId} />
            ) : null}
            <AiUsageDetailRow
              label={t('aiUsage.source')}
              value={entry.sourceName || entry.sourceId || t('aiUsage.unknown')}
            />
            <AiUsageDetailRow
              label={t('aiUsage.modality')}
              value={t(MODALITY_LABELS[entry.modality])}
            />
            <AiUsageDetailRow
              label={t('settings.provider.apiService.apiKey')}
              value={
                [entry.apiKeyLabel, entry.apiKeyMasked].filter(Boolean).join(' · ') ||
                entry.authMethod ||
                t('aiUsage.unknown')
              }
            />
            <AiUsageDetailRow
              label={t('chat.messageUsage.message')}
              value={entry.messageId || t('aiUsage.noConversation')}
            />
          </View>
        ) : null}
      </View>
    </AiUsageDetail>
  );
}

function recordModel(entry: AiUsageRecordEntry, unknownModel: string) {
  return {
    id: entry.modelId || entry.id,
    modelId: entry.modelId || '',
    name: entry.modelName || entry.modelId || unknownModel,
    providerId: entry.providerId || '',
  };
}

function RecordSeparator() {
  return <View className="border-t border-border-subtle" />;
}
