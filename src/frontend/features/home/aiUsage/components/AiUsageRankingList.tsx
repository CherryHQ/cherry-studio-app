import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { resolveIcon, resolveProviderIcon } from '@cherrystudio/ui/icons';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { type ReactElement, type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BrandAvatar, BrandAvatarIcon } from '@/frontend/components/avatar';

import type { AiUsageRankingItem } from '../types';
import { displayAiUsageModelId } from '../utils/aiUsageDetail';
import { createAiUsageTokenFormatter } from '../utils/formatAiUsageTokens';

const AI_USAGE_RANKING_PAGE_SIZE = 7;
const MAX_PROGRESS_WIDTH_PERCENT = 68;
const AI_USAGE_RANKING_AVATAR_SIZE = 32;

type AiUsageRankingListProps = {
  emptyState?: ReactNode;
  items: readonly AiUsageRankingItem[];
  listHeaderComponent: ReactElement;
  locale: string;
  /** Collapses back to the first page when it changes, without remounting the rows. */
  resetKey: string;
};

type AiUsageRankingRowExtraData = {
  formatTokens: (value: number) => string;
  hasMore: boolean;
  maximumTokens: number;
};

export function AiUsageRankingList({
  emptyState,
  items,
  listHeaderComponent,
  locale,
  resetKey,
}: AiUsageRankingListProps) {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(AI_USAGE_RANKING_PAGE_SIZE);
  const [renderedResetKey, setRenderedResetKey] = useState(resetKey);
  const formatTokens = useMemo(() => createAiUsageTokenFormatter(locale), [locale]);

  if (renderedResetKey !== resetKey) {
    setRenderedResetKey(resetKey);
    setVisibleCount(AI_USAGE_RANKING_PAGE_SIZE);
  }

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;
  const rowExtraData = useMemo<AiUsageRankingRowExtraData>(
    () => ({
      formatTokens,
      hasMore,
      maximumTokens: Math.max(1, ...items.map((item) => item.totalTokens)),
    }),
    [formatTokens, hasMore, items],
  );
  const renderItem = useCallback(
    ({ extraData, index, item }: LegendListRenderItemProps<AiUsageRankingItem>) => (
      <AiUsageRankingRow
        extraData={extraData as AiUsageRankingRowExtraData}
        index={index}
        isLast={index === visibleItems.length - 1}
        item={item}
      />
    ),
    [visibleItems.length],
  );

  return (
    <LegendList
      alwaysBounceVertical={false}
      className="flex-1 bg-grouped-background"
      contentContainerClassName="px-4 py-5"
      contentInsetAdjustmentBehavior="automatic"
      data={visibleItems}
      dataKey={resetKey}
      extraData={rowExtraData}
      keyExtractor={getRankingItemKey}
      ListEmptyComponent={
        <View
          className="overflow-hidden rounded-xl bg-grouped-surface"
          style={styles.continuousCorners}
        >
          {emptyState}
        </View>
      }
      ListFooterComponent={
        hasMore ? (
          <View
            className="items-center rounded-b-xl bg-grouped-surface px-4 pt-3 pb-4"
            style={styles.continuousCorners}
          >
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center gap-1.5 rounded-lg px-3 py-2 active:bg-secondary active:opacity-70"
              style={styles.continuousCorners}
              testID="ai-usage-show-more"
              onPress={() => setVisibleCount((count) => count + AI_USAGE_RANKING_PAGE_SIZE)}
            >
              <Text className="font-medium text-foreground text-sm">{t('aiUsage.showMore')}</Text>
              <ChevronDownIcon className="size-4 text-foreground" />
            </Pressable>
          </View>
        ) : null
      }
      ListHeaderComponent={listHeaderComponent}
      recycleItems
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      testID="ai-usage-ranking-list"
    />
  );
}

function AiUsageRankingRow({
  extraData,
  index,
  isLast,
  item,
}: {
  extraData: AiUsageRankingRowExtraData;
  index: number;
  isLast: boolean;
  item: AiUsageRankingItem;
}) {
  const { t } = useTranslation();
  const primaryLabel = getPrimaryLabel(item, t);
  const providerLabel = item.providerName || item.providerId;
  const progress = Math.max(0, Math.min(1, item.totalTokens / extraData.maximumTokens));
  const isFirst = index === 0;
  const roundsBottom = isLast && !extraData.hasMore;

  return (
    <View
      className={`bg-grouped-surface px-4${isFirst ? ' rounded-t-xl pt-4' : ''}${roundsBottom ? ' rounded-b-xl pb-4' : ''}`}
      style={isFirst || roundsBottom ? styles.continuousCorners : undefined}
    >
      <View
        className="relative flex-row items-center gap-3 py-2"
        testID={`ai-usage-ranking-row-${index}`}
      >
        {index > 0 ? (
          <View
            className="absolute top-0 right-0 left-11 border-border border-t"
            pointerEvents="none"
          />
        ) : null}
        <AiUsageRankingIcon item={item} label={primaryLabel} />
        <View className="min-w-0 flex-1 gap-1">
          <Text selectable className="font-semibold text-foreground text-base" numberOfLines={1}>
            {primaryLabel}
            {item.groupBy === 'model' && providerLabel ? (
              <Text className="font-normal text-muted-foreground text-sm">
                {` | ${providerLabel}`}
              </Text>
            ) : null}
          </Text>
          <View className="flex-row items-center gap-2">
            <View
              className="h-1 min-w-1 rounded-full bg-muted-foreground"
              style={{ width: `${progress * MAX_PROGRESS_WIDTH_PERCENT}%` }}
              testID={`ai-usage-ranking-progress-${index}`}
            />
            <Text
              selectable
              className="shrink-0 text-muted-foreground text-xs"
              numberOfLines={1}
              style={styles.tabularNumbers}
            >
              {t('aiUsage.tokensValue', {
                tokens: extraData.formatTokens(item.totalTokens),
              })}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function AiUsageRankingListSkeleton() {
  return (
    <View className="p-4" testID="ai-usage-ranking-list-loading">
      {Array.from({ length: AI_USAGE_RANKING_PAGE_SIZE }, (_, index) => (
        <View key={index} className="flex-row items-center gap-3 py-2">
          <View className="size-8 rounded-md bg-secondary" />
          <View className="flex-1 gap-1">
            <View className="h-6 w-2/3 rounded-sm bg-secondary" />
            <View className="h-4 w-full rounded-sm bg-secondary" />
          </View>
        </View>
      ))}
    </View>
  );
}

function getRankingItemKey(item: AiUsageRankingItem): string {
  return item.key;
}

function getPrimaryLabel(item: AiUsageRankingItem, t: (key: string) => string): string {
  if (item.isOther) {
    return item.groupBy === 'model' ? t('aiUsage.otherModels') : t('aiUsage.otherProviders');
  }
  if (item.groupBy === 'provider') {
    return item.providerName || item.providerId || t('aiUsage.unknownProvider');
  }
  return displayAiUsageModelId(item.modelId) || t('aiUsage.unknownModel');
}

function AiUsageRankingIcon({ item, label }: { item: AiUsageRankingItem; label: string }) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const iconSource = item.isOther
    ? undefined
    : item.groupBy === 'provider'
      ? resolveProviderIcon(item.providerId ?? '')
      : resolveIcon(item.modelId ?? '', item.providerId ?? '');
  const frameProps = {
    label,
    size: AI_USAGE_RANKING_AVATAR_SIZE,
    testID: `ai-usage-ranking-icon-${item.key}`,
  };

  if (iconSource) {
    return (
      <BrandAvatar {...frameProps}>
        <BrandAvatarIcon
          iconId={item.providerId ?? undefined}
          recyclingKey={item.key}
          source={iconSource[iconTheme]}
        />
      </BrandAvatar>
    );
  }

  if (item.isOther) {
    return (
      <BrandAvatar {...frameProps}>
        <EllipsisIcon className="size-4 text-muted-foreground" />
      </BrandAvatar>
    );
  }

  return <BrandAvatar {...frameProps} />;
}

const styles = StyleSheet.create({
  continuousCorners: {
    borderCurve: 'continuous',
  },
  tabularNumbers: {
    fontVariant: ['tabular-nums'],
  },
});
