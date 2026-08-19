import { cn } from '@cherrystudio/ui/utils';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/avatar';

import { getModelPickerRowTags, type ModelPickerModelItem } from '../utils/modelPickerData';
import type { ModelPickerListItem } from '../utils/modelPickerListItems';
import { ModelPickerTagChip } from './ModelPickerTagChip';

/** `py-2` around the tallest thing in a row, which is the 26 avatar. */
const modelPickerEstimatedItemSize = 42;

type ModelPickerListProps = {
  emptyText?: string;
  hasMoreItems?: boolean;
  isLoading?: boolean;
  /** Whether the picker is on screen; it scrolls to the selection once per showing. */
  isOpen?: boolean;
  listItems: readonly ModelPickerListItem[];
  loadingText?: string;
  onEndReached?: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  selectedModelId: string | null;
};

type ModelPickerListExtraData = {
  selectedModelId: string | null;
};

/**
 * Every model on the device, grouped by provider. Drawn for both surfaces that
 * pick one — the sheet the composer opens and the pushed screen the model
 * settings use — so the two cannot drift apart.
 */
export function ModelPickerList({
  emptyText,
  hasMoreItems = false,
  isLoading = false,
  isOpen = false,
  listItems,
  loadingText,
  onEndReached,
  onSelect,
  selectedModelId,
}: ModelPickerListProps) {
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
  const listExtraData = useMemo<ModelPickerListExtraData>(
    () => ({ selectedModelId }),
    [selectedModelId],
  );
  const renderItem = useCallback(
    ({ extraData, item }: LegendListRenderItemProps<ModelPickerListItem>) => {
      if (item.type === 'groupHeader') {
        return <ModelPickerGroupHeader isFirstGroup={item.isFirstGroup} title={item.title} />;
      }

      return (
        <ModelPickerRow
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

function ModelPickerGroupHeader({ isFirstGroup, title }: { isFirstGroup: boolean; title: string }) {
  return (
    <View className={cn('flex-row items-center gap-2 px-2 pb-1', !isFirstGroup && 'mt-3')}>
      <Text className="text-foreground text-lg">{title}</Text>
    </View>
  );
}

const ModelPickerRow = memo(function ModelPickerRow({
  isSelected,
  item,
  onSelect,
}: {
  isSelected: boolean;
  item: ModelPickerModelItem;
  onSelect: (item: ModelPickerModelItem) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);
  const tags = getModelPickerRowTags(item.model);

  return (
    <Pressable
      accessibilityLabel={item.model.name}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={cn(
        // `px-2` against the list's own 8, so the fill runs to within 8 of the
        // sheet edge while the text keeps the 16 the group headings are set to.
        // The fill is the only mark of the selection — it reads at a glance
        // down a long list in a way a tick at the far end of the row does not.
        'flex-row items-center gap-3 rounded-xl px-2 py-2 active:opacity-60',
        isSelected && 'bg-secondary',
      )}
      onPress={handleSelect}
    >
      <ModelAvatar model={item.model} provider={item.provider} />
      {/* The one part of the row that gives, so the capabilities keep their
          natural width and a long model id ellipsizes instead. */}
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Text className="min-w-0 shrink text-base text-foreground" numberOfLines={1}>
          {item.model.name}
        </Text>
      </View>
      {tags.length > 0 ? (
        <View className="flex-row items-center gap-1">
          {tags.map((tag) => (
            <ModelPickerTagChip key={`${item.modelId}:${tag}`} tag={tag} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  // 8 rather than the 16 everything here lines up on: the rows and the group
  // headings carry the other 8 themselves, which is what leaves the selected
  // row's fill room to sit outside its own text.
  listContentContainer: {
    paddingBottom: 20,
    paddingHorizontal: 8,
    paddingTop: 12,
  },
});
