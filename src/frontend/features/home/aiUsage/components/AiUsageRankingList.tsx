import { resolveIcon, resolveProviderIcon } from '@cherrystudio/ui/icons';
import { ChevronDownIcon, EllipsisIcon } from 'lucide-uniwind/png';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';

import type { AiUsageRankingItem } from '../types';
import { displayAiUsageModelId } from '../utils/aiUsageDetail';
import { createAiUsageTokenFormatter } from '../utils/formatAiUsageTokens';

const PAGE_SIZE = 7;
const MAX_PROGRESS_WIDTH_PERCENT = 68;

type AiUsageRankingListProps = {
  items: readonly AiUsageRankingItem[];
  locale: string;
};

export function AiUsageRankingList({ items, locale }: AiUsageRankingListProps) {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const formatTokens = useMemo(() => createAiUsageTokenFormatter(locale), [locale]);
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
              className={index < visibleItems.length - 1 ? 'border-border border-b' : undefined}
              testID={`ai-usage-ranking-row-${index}`}
            >
              <View className="flex-row items-center gap-3 py-3">
                <AiUsageRankingIcon item={item} label={primaryLabel} />
                <View className="min-w-0 flex-1 gap-2">
                  <Text
                    selectable
                    className="font-medium text-default-foreground text-sm"
                    numberOfLines={1}
                  >
                    {primaryLabel}
                    {item.groupBy === 'model' && providerLabel ? (
                      <Text className="font-normal text-muted-foreground">
                        {` | ${providerLabel}`}
                      </Text>
                    ) : null}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <View
                      className="h-1 min-w-1 rounded-full bg-primary"
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
    <View className="gap-1" testID="ai-usage-ranking-list-loading">
      {Array.from({ length: PAGE_SIZE }, (_, index) => (
        <View key={index} className="flex-row items-center gap-3 py-3">
          <View className="size-8 rounded-full bg-surface-secondary" />
          <View className="flex-1 gap-2">
            <View className="h-4 w-2/3 rounded-sm bg-surface-secondary" />
            <View className="h-1 w-full rounded-full bg-surface-secondary" />
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

  if (iconSource) {
    return (
      <View className="size-8 shrink-0 items-center justify-center overflow-hidden">
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          recyclingKey={item.key}
          source={iconSource[iconTheme]}
          style={styles.rankingIcon}
        />
      </View>
    );
  }

  return (
    <View className="size-8 shrink-0 items-center justify-center rounded-full bg-surface-secondary">
      {item.isOther ? (
        <EllipsisIcon className="size-4 text-muted-foreground" strokeWidth={2} />
      ) : (
        <Text className="font-medium text-muted-foreground text-xs">
          {(label || '?').charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rankingIcon: {
    height: 28,
    width: 28,
  },
  tabularNumbers: {
    fontVariant: ['tabular-nums'],
  },
});
