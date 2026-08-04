import { resolveIcon, resolveProviderIcon } from '@cherrystudio/ui/icons';
import { ChevronDownIcon, EllipsisIcon } from 'lucide-uniwind/png';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BrandAvatar, BrandAvatarIcon } from '@/frontend/components/BrandAvatar';

import type { AiUsageRankingItem } from '../types';
import { displayAiUsageModelId } from '../utils/aiUsageDetail';
import { createAiUsageTokenFormatter } from '../utils/formatAiUsageTokens';

const PAGE_SIZE = 7;
const MAX_PROGRESS_WIDTH_PERCENT = 68;
const AI_USAGE_RANKING_AVATAR_SIZE = 32;

type AiUsageRankingListProps = {
  items: readonly AiUsageRankingItem[];
  locale: string;
  /** Collapses back to the first page when it changes, without remounting the rows. */
  resetKey: string;
};

export function AiUsageRankingList({ items, locale, resetKey }: AiUsageRankingListProps) {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [renderedResetKey, setRenderedResetKey] = useState(resetKey);
  const formatTokens = useMemo(() => createAiUsageTokenFormatter(locale), [locale]);

  if (renderedResetKey !== resetKey) {
    setRenderedResetKey(resetKey);
    setVisibleCount(PAGE_SIZE);
  }

  const visibleItems = items.slice(0, visibleCount);
  const maximumTokens = Math.max(1, ...items.map((item) => item.totalTokens));

  return (
    <View>
      <View testID="ai-usage-ranking-list">
        {visibleItems.map((item, index) => {
          const primaryLabel = getPrimaryLabel(item, t);
          const providerLabel = item.providerName || item.providerId;
          const progress = Math.max(0, Math.min(1, item.totalTokens / maximumTokens));

          return (
            <View
              key={item.key}
              className="relative flex-row items-center gap-3 py-2"
              testID={`ai-usage-ranking-row-${index}`}
            >
              {/* Drawn above the row and inset past the icon, matching the assistant list. */}
              {index > 0 ? (
                <View
                  className="absolute top-0 right-0 left-11 border-border border-t"
                  pointerEvents="none"
                />
              ) : null}
              <AiUsageRankingIcon item={item} label={primaryLabel} />
              <View className="min-w-0 flex-1 gap-1">
                <Text
                  selectable
                  className="font-semibold text-default-foreground text-base"
                  numberOfLines={1}
                >
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
                    {t('aiUsage.tokensValue', { tokens: formatTokens(item.totalTokens) })}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {visibleCount < items.length ? (
        <View className="items-center pt-3">
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-lg px-3 py-2 active:bg-surface-secondary active:opacity-70"
            testID="ai-usage-show-more"
            onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            <Text className="font-medium text-primary text-sm">{t('aiUsage.showMore')}</Text>
            <ChevronDownIcon className="size-4 text-primary" strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function AiUsageRankingListSkeleton() {
  return (
    <View testID="ai-usage-ranking-list-loading">
      {Array.from({ length: PAGE_SIZE }, (_, index) => (
        // Mirrors the loaded row box so the section keeps its height when data lands.
        <View key={index} className="flex-row items-center gap-3 py-2">
          <View className="size-8 rounded-md bg-surface-secondary" />
          <View className="flex-1 gap-1">
            <View className="h-6 w-2/3 rounded-sm bg-surface-secondary" />
            <View className="h-4 w-full rounded-sm bg-surface-secondary" />
          </View>
        </View>
      ))}
    </View>
  );
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

  // The aggregate row stands for many brands, so it gets no generated color.
  if (item.isOther) {
    return (
      <BrandAvatar {...frameProps}>
        <EllipsisIcon className="size-4 text-muted-foreground" strokeWidth={2} />
      </BrandAvatar>
    );
  }

  return <BrandAvatar {...frameProps} />;
}

const styles = StyleSheet.create({
  tabularNumbers: {
    fontVariant: ['tabular-nums'],
  },
});
