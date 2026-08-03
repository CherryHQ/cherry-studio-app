import { resolveIcon } from '@cherrystudio/ui/icons';
import { ChevronDownIcon, EllipsisIcon } from 'lucide-uniwind/png';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';

import type { AiUsageModelUsage } from '../types';
import { displayAiUsageModelId } from '../utils/aiUsageDetail';
import { createAiUsageTokenFormatter } from '../utils/formatAiUsageTokens';

const PAGE_SIZE = 7;
const MAX_PROGRESS_WIDTH_PERCENT = 68;

type AiUsageModelListProps = {
  items: readonly AiUsageModelUsage[];
  locale: string;
};

export function AiUsageModelList({ items, locale }: AiUsageModelListProps) {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const formatTokens = useMemo(() => createAiUsageTokenFormatter(locale), [locale]);
  const visibleItems = items.slice(0, visibleCount);
  const maximumTokens = Math.max(1, ...items.map((item) => item.totalTokens));

  return (
    <View>
      <View testID="ai-usage-model-list">
        {visibleItems.map((item, index) => {
          const modelLabel = item.isOther
            ? t('aiUsage.otherModels')
            : displayAiUsageModelId(item.modelId) || t('aiUsage.unknownModel');
          const providerLabel = item.providerName || item.providerId;
          const progress = Math.max(0, Math.min(1, item.totalTokens / maximumTokens));

          return (
            <View
              key={item.key}
              className={index < visibleItems.length - 1 ? 'border-border border-b' : undefined}
              testID={`ai-usage-model-row-${index}`}
            >
              <View className="flex-row items-center gap-3 py-3">
                <AiUsageModelIcon item={item} label={modelLabel} />
                <View className="min-w-0 flex-1 gap-2">
                  <Text
                    selectable
                    className="font-medium text-default-foreground text-sm"
                    numberOfLines={1}
                  >
                    {modelLabel}
                    {providerLabel ? (
                      <Text className="font-normal text-muted-foreground">
                        {` | ${providerLabel}`}
                      </Text>
                    ) : null}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <View
                      className="h-1 min-w-1 rounded-full bg-primary"
                      style={{ width: `${progress * MAX_PROGRESS_WIDTH_PERCENT}%` }}
                      testID={`ai-usage-model-progress-${index}`}
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

export function AiUsageModelListSkeleton() {
  return (
    <View className="gap-1" testID="ai-usage-model-list-loading">
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

function AiUsageModelIcon({ item, label }: { item: AiUsageModelUsage; label: string }) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const iconSource =
    !item.isOther && item.modelId ? resolveIcon(item.modelId, item.providerId ?? '') : undefined;

  if (iconSource) {
    return (
      <View className="size-8 shrink-0 items-center justify-center overflow-hidden">
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          recyclingKey={item.key}
          source={iconSource[iconTheme]}
          style={styles.modelIcon}
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
          {(label || item.providerId || '?').charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modelIcon: {
    height: 28,
    width: 28,
  },
  tabularNumbers: {
    fontVariant: ['tabular-nums'],
  },
});
