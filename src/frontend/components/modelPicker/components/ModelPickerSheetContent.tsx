import { CheckIcon } from '@cherrystudio/app-icons';
import { cn } from '@cherrystudio/ui/utils';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ModelPickerGroup, ModelPickerModelItem } from '../utils/modelPickerData';
import type { ModelPickerListItem } from '../utils/modelPickerListItems';
import { ModelPickerIcon } from './ModelPickerIcon';

const modelPickerEstimatedItemSize = 48;

type ModelPickerSheetContentProps = {
  emptyText?: string;
  hasMoreItems?: boolean;
  isLoading?: boolean;
  isOpen?: boolean;
  isSearching: boolean;
  listItems: readonly ModelPickerListItem[];
  loadingText?: string;
  onEndReached?: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  pinnedModelIds: readonly string[];
  selectedModelId: string | null;
};

type ModelPickerSheetContentExtraData = {
  pinnedModelIdSet: ReadonlySet<string>;
  selectedModelId: string | null;
};

export function ModelPickerSheetContent({
  emptyText,
  hasMoreItems = false,
  isLoading = false,
  isOpen = false,
  listItems,
  loadingText,
  onEndReached,
  onSelect,
  pinnedModelIds,
  selectedModelId,
}: ModelPickerSheetContentProps) {
  const listRef = useRef<LegendListRef>(null);
  const hasScrolledToSelectedRef = useRef(false);
  const selectedRowIndex = useMemo(() => {
    if (!selectedModelId) {
      return -1;
    }

    return listItems.findIndex(
      (item) => item.type === 'model' && item.item.modelId === selectedModelId,
    );
  }, [listItems, selectedModelId]);
  // Scroll to the selected model once per open. Guarding on a ref (rather than
  // re-running whenever the list grows) keeps lazy-loading or manual scrolling
  // from yanking the user back to the selected row.
  useEffect(() => {
    if (!isOpen) {
      hasScrolledToSelectedRef.current = false;
      return;
    }

    if (hasScrolledToSelectedRef.current || selectedRowIndex < 0) {
      return;
    }

    hasScrolledToSelectedRef.current = true;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        animated: false,
        index: selectedRowIndex,
        viewPosition: 0.35,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, selectedRowIndex]);
  const pinnedModelIdSet = useMemo(() => new Set(pinnedModelIds), [pinnedModelIds]);
  const listExtraData = useMemo<ModelPickerSheetContentExtraData>(
    () => ({
      pinnedModelIdSet,
      selectedModelId,
    }),
    [pinnedModelIdSet, selectedModelId],
  );
  const renderItem = useCallback(
    ({ extraData, item }: LegendListRenderItemProps<ModelPickerListItem>) => {
      if (item.type === 'groupHeader') {
        return (
          <ModelPickerGroupHeader
            count={item.count}
            groupKind={item.groupKind}
            isFirstGroup={item.isFirstGroup}
            title={item.title}
          />
        );
      }

      return (
        <ModelPickerRow
          isPinned={extraData.pinnedModelIdSet.has(item.item.modelId)}
          isSelected={item.item.modelId === extraData.selectedModelId}
          item={item.item}
          onSelect={onSelect}
        />
      );
    },
    [onSelect],
  );
  const keyExtractor = useCallback((item: ModelPickerListItem) => item.key, []);
  const getItemType = useCallback((item: ModelPickerListItem) => item.type, []);
  const handleEndReached = useCallback(() => {
    if (!hasMoreItems) {
      return;
    }

    onEndReached?.();
  }, [hasMoreItems, onEndReached]);

  if (listItems.length === 0) {
    return (
      <View className="px-4 pb-5 pt-3">
        <View className="min-h-12 items-center justify-center rounded-xl bg-secondary px-4 py-4">
          <Text className="text-base text-foreground">{isLoading ? loadingText : emptyText}</Text>
        </View>
      </View>
    );
  }

  return (
    <LegendList
      ref={listRef}
      contentContainerStyle={styles.listContentContainer}
      data={listItems}
      drawDistance={320}
      estimatedItemSize={modelPickerEstimatedItemSize}
      extraData={listExtraData}
      getItemType={getItemType}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={keyExtractor}
      maintainVisibleContentPosition={false}
      nestedScrollEnabled
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.15}
      recycleItems
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      style={styles.list}
    />
  );
}

function ModelPickerGroupHeader({
  count,
  groupKind,
  isFirstGroup,
  title,
}: {
  count: number;
  groupKind: ModelPickerGroup['groupKind'];
  isFirstGroup: boolean;
  title: string;
}) {
  const { t } = useTranslation();

  return (
    <View className={cn('flex-row items-center gap-2 pb-1', !isFirstGroup && 'mt-3')}>
      <Text className="text-foreground text-lg">{groupKind === 'pinned' ? t(title) : title}</Text>
      {groupKind === 'pinned' ? <Text className="text-foreground text-lg">{count}</Text> : null}
    </View>
  );
}

const ModelPickerRow = memo(function ModelPickerRow({
  isPinned,
  isSelected,
  item,
  onSelect,
}: {
  isPinned: boolean;
  isSelected: boolean;
  item: ModelPickerModelItem;
  onSelect: (item: ModelPickerModelItem) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);

  return (
    <Pressable
      accessibilityLabel={item.model.name}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className="flex-row items-center gap-3 py-2 active:opacity-60"
      onPress={handleSelect}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <ModelPickerIcon model={item.model} provider={item.provider} size={24} />
        <Text className="min-w-0 shrink text-base text-foreground" numberOfLines={1}>
          {item.model.name}
        </Text>
        {isPinned ? (
          <Text className="shrink text-base text-foreground" numberOfLines={1}>
            | {item.provider.name}
          </Text>
        ) : null}
      </View>
      {isSelected ? <CheckIcon className="size-5 text-primary" /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContentContainer: {
    paddingBottom: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
