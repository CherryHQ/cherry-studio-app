import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import {
  ActionMenu,
  BottomSheet,
  Button,
  ContentState,
  Section,
} from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInfiniteQuery } from '@/frontend/data';
import type {
  AiUsageRecordFilters,
  AiUsageRecordListSortBy,
} from '@/shared/data/api/schemas/aiUsageRecords';
import {
  type AiUsageRecordEntry,
  getAiUsageRecordTotalTokens,
} from '@/shared/data/types/aiUsageRecord';
import type { Currency } from '@/shared/data/types/model';
import { getAiUsageRecordTokensPerSecond } from '@/shared/utils/aiUsage';

import { formatUsageCost, formatUsageNumber, type UsageRange } from '../utils/aiUsageAnalytics';
import { AiUsageValueRow } from './AiUsageBreakdown';
import { PERFORMANCE_LABELS } from './AiUsagePerformance';

const SORT_LABELS = {
  createdAt: 'chat.messageUsage.createdAt',
  totalTokens: 'chat.messageUsage.totalTokens',
  cost: 'aiUsage.cost',
  timeFirstTokenMs: 'chat.messageUsage.firstToken',
  tokensPerSecond: 'chat.messageUsage.modelSpeed',
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
  currency,
  locale,
}: {
  range: UsageRange;
  filters: AiUsageRecordFilters;
  currency: Currency;
  locale: string;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [sortBy, setSortBy] = useState<AiUsageRecordListSortBy>('createdAt');
  const [ascending, setAscending] = useState(false);
  const [selected, setSelected] = useState<AiUsageRecordEntry>();
  const query = useInfiniteQuery('/ai-usage-records', {
    limit: 50,
    query: {
      ...filters,
      from: range.from,
      to: range.to,
      sortBy,
      sortOrder: ascending ? 'asc' : 'desc',
      ...(sortBy === 'cost' ? { costCurrency: currency } : {}),
    },
  });
  const items = query.pages.flatMap((page) => page.items);
  return (
    <>
      <FlatList
        key={JSON.stringify([range, filters, sortBy, ascending, currency])}
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        refreshing={query.isRefreshing && !query.isLoadingMore}
        onRefresh={() => void query.refresh()}
        onEndReached={() => void query.loadNext()}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <View className="gap-2 pb-3">
            <Section.Header
              title={t('aiUsage.recordCount', {
                value: formatUsageNumber(query.pages[0]?.total ?? 0, locale),
              })}
            >
              <ActionMenu
                items={[
                  ...Object.entries(SORT_LABELS).map(([value, label]) => ({
                    id: value,
                    label: t(label),
                    checked: value === sortBy,
                    onPress: () => setSortBy(value as AiUsageRecordListSortBy),
                  })),
                  {
                    id: 'direction',
                    label: t(ascending ? 'aiUsage.descending' : 'aiUsage.ascending'),
                    onPress: () => setAscending(!ascending),
                    group: 'direction',
                  },
                ]}
              >
                <Button size="sm" variant="ghost">
                  {t(SORT_LABELS[sortBy])} {ascending ? '↑' : '↓'}
                </Button>
              </ActionMenu>
            </Section.Header>
            {sortBy === 'cost' ? (
              <Text className="text-muted-foreground text-xs">
                {t('aiUsage.currencyRecords', { currency })}
              </Text>
            ) : null}
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
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.modelName || item.modelId || t('aiUsage.unknownModel')}, ${t('aiUsage.viewDetails')}`}
            onPress={() => setSelected(item)}
          >
            <View className="flex-row items-center gap-3 border-b border-border-subtle py-4">
              <View className="min-w-0 flex-1 gap-1">
                <Text className="font-medium text-foreground text-sm" numberOfLines={2}>
                  {item.modelName || item.modelId || t('aiUsage.unknownModel')}
                </Text>
                <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                  {item.providerName || t('aiUsage.unknownProvider')}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {new Intl.DateTimeFormat(locale, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(item.createdAt))}
                </Text>
              </View>
              <View className="max-w-[45%] items-end gap-1">
                <Text className="text-foreground text-sm">
                  {sortBy === 'timeFirstTokenMs'
                    ? `${formatUsageNumber(item.timeFirstTokenMs === null ? null : item.timeFirstTokenMs / 1000, locale, 2)} ${t('aiUsage.secondsUnit')}`
                    : sortBy === 'tokensPerSecond'
                      ? `${formatUsageNumber(getAiUsageRecordTokensPerSecond(item), locale, 2)} ${t('aiUsage.tokensPerSecondUnit')}`
                      : `${formatUsageNumber(getAiUsageRecordTotalTokens(item), locale)} ${t('aiUsage.tokens')}`}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {item.costCurrency
                    ? formatUsageCost(item.cost, item.costCurrency, locale)
                    : t('aiUsage.unpriced')}
                </Text>
                {item.recordKind === 'legacy-aggregate' ? (
                  <Text className="text-muted-foreground text-xs">{t('aiUsage.legacy')}</Text>
                ) : null}
              </View>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </View>
          </Pressable>
        )}
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
  const number = (value: number | null) => formatUsageNumber(value, locale);
  const tokenFields = [
    ['chat.messageUsage.input', entry.inputTokens],
    ['chat.messageUsage.output', entry.outputTokens],
    ['chat.messageUsage.reasoning', entry.reasoningTokens],
    ['chat.messageUsage.noCache', entry.noCacheTokens],
    ['chat.messageUsage.cacheRead', entry.cacheReadTokens],
    ['chat.messageUsage.cacheWrite', entry.cacheWriteTokens],
    ['aiUsage.images', entry.imageCount],
  ] as const;
  return (
    <BottomSheet
      open
      onClose={onClose}
      size="large"
      title={t('aiUsage.recordDetail')}
      closeAction={{ accessibilityLabel: t('common.close') }}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <AiUsageValueRow
          label={t('chat.messageUsage.model')}
          value={entry.modelName || entry.modelId || t('aiUsage.unknownModel')}
        />
        {entry.modelName && entry.modelId ? (
          <AiUsageValueRow label={t('aiUsage.modelId')} value={entry.modelId} />
        ) : null}
        <AiUsageValueRow
          label={t('chat.messageUsage.provider')}
          value={entry.providerName || entry.providerId || t('aiUsage.unknownProvider')}
        />
        <AiUsageValueRow
          label={t('aiUsage.source')}
          value={entry.sourceName || entry.sourceId || t('aiUsage.unknown')}
        />
        <AiUsageValueRow label={t('aiUsage.modality')} value={t(MODALITY_LABELS[entry.modality])} />
        <AiUsageValueRow
          label={t('settings.provider.apiService.apiKey')}
          value={
            [entry.apiKeyLabel, entry.apiKeyMasked].filter(Boolean).join(' · ') ||
            entry.authMethod ||
            t('aiUsage.unknown')
          }
        />
        <AiUsageValueRow
          label={t('chat.messageUsage.createdAt')}
          value={new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'medium',
          }).format(new Date(entry.createdAt))}
        />
        <AiUsageValueRow
          label={t('chat.messageUsage.requests')}
          value={number(entry.requestCount)}
        />
        {entry.recordKind === 'legacy-aggregate' ? (
          <Text className="py-3 text-muted-foreground text-xs">{t('aiUsage.legacyHint')}</Text>
        ) : null}
        <Section.Header title={t('aiUsage.tokenComposition')} />
        <AiUsageValueRow
          label={t('chat.messageUsage.totalTokens')}
          value={number(getAiUsageRecordTotalTokens(entry))}
        />
        {tokenFields.map(([key, value]) => (
          <AiUsageValueRow key={key} label={t(key)} value={number(value)} />
        ))}
        <Section.Header title={t('aiUsage.cost')} />
        <AiUsageValueRow
          label={
            entry.costSource === 'provider'
              ? t('chat.messageUsage.costBilled')
              : entry.costSource === 'computed'
                ? t('chat.messageUsage.costEstimated')
                : t('aiUsage.unpriced')
          }
          value={entry.costCurrency ? formatUsageCost(entry.cost, entry.costCurrency, locale) : '—'}
        />
        {entry.costBreakdown && entry.costCurrency
          ? (['input', 'output', 'cacheRead', 'cacheWrite', 'image'] as const).map((key) => {
              const value = entry.costBreakdown?.[key];
              const labels = {
                input: 'chat.messageUsage.input',
                output: 'chat.messageUsage.output',
                cacheRead: 'chat.messageUsage.cacheRead',
                cacheWrite: 'chat.messageUsage.cacheWrite',
                image: 'aiUsage.images',
              } as const;
              return value === undefined ? null : (
                <AiUsageValueRow
                  key={key}
                  label={t(labels[key])}
                  value={formatUsageCost(value, entry.costCurrency!, locale)}
                />
              );
            })
          : null}
        <Section.Header title={t('aiUsage.performance')} />
        {(['timeFirstTokenMs', 'timeCompletionMs', 'timeThinkingMs'] as const).map((key) => (
          <AiUsageValueRow
            key={key}
            label={t(PERFORMANCE_LABELS[key])}
            value={
              entry[key] === null
                ? '—'
                : `${formatUsageNumber(entry[key] / 1000, locale, 2)} ${t('aiUsage.secondsUnit')}`
            }
          />
        ))}
        <AiUsageValueRow
          label={t('chat.messageUsage.modelSpeed')}
          value={`${formatUsageNumber(getAiUsageRecordTokensPerSecond(entry), locale, 2)} ${t('aiUsage.tokensPerSecondUnit')}`}
        />
        <Text className="py-3 text-muted-foreground text-xs">{t('aiUsage.compositionHint')}</Text>
      </ScrollView>
    </BottomSheet>
  );
}
