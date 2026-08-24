import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { cn } from '@cherrystudio/ui/utils';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/avatar';

import type { ModelPickerModelItem } from '../utils/modelPickerData';
import {
  buildModelPickerFastScrollNavigation,
  MIN_MODEL_PICKER_FAST_SCROLL_MODEL_COUNT,
} from '../utils/modelPickerFastScroll';
import type { ModelPickerListItem } from '../utils/modelPickerListItems';
import { ModelPickerFastScroller } from './ModelPickerFastScroller';

const modelPickerEstimatedItemSize = 48;

type ModelPickerListProps = {
  emptyText?: string;
  isLoading?: boolean;
  /** Whether the picker is on screen; it scrolls to the selection once per showing. */
  isOpen?: boolean;
  listItems: readonly ModelPickerListItem[];
  loadingText?: string;
  onSelect: (item: ModelPickerModelItem) => void;
  selectedModelId: string | null;
};

type ModelPickerListExtraData = {
  selectedModelId: string | null;
};

/** Every selectable model on the device, grouped by provider in the shared picker sheet. */
export function ModelPickerList({
  emptyText,
  isLoading = false,
  isOpen = false,
  listItems,
  loadingText,
  onSelect,
  selectedModelId,
}: ModelPickerListProps) {
  const listRef = useRef<LegendListRef>(null);
  const navigationFrameRef = useRef<number | null>(null);
  const pendingNavigationIndexRef = useRef<number | null>(null);
  const hasScrolledToSelectedRef = useRef(false);
  const [activeAnchorKey, setActiveAnchorKey] = useState<string | null>(null);
  const fastScrollNavigation = useMemo(
    () => buildModelPickerFastScrollNavigation(listItems),
    [listItems],
  );
  const { anchorIndexByListIndex, anchors: fastScrollAnchors, modelCount } = fastScrollNavigation;
  const isFastScrollerVisible =
    modelCount >= MIN_MODEL_PICKER_FAST_SCROLL_MODEL_COUNT && fastScrollAnchors.length > 1;
  const storedActiveAnchorIndex = fastScrollAnchors.findIndex(
    (anchor) => anchor.key === activeAnchorKey,
  );
  const activeAnchorIndex = storedActiveAnchorIndex >= 0 ? storedActiveAnchorIndex : 0;
  const selectedRowIndex = useMemo(() => {
    if (!selectedModelId) {
      return -1;
    }

    return listItems.findIndex(
      (item) => item.type === 'model' && item.item.modelId === selectedModelId,
    );
  }, [listItems, selectedModelId]);
  // Scroll to the selected model once per open. Guarding on a ref (rather than
  // re-running whenever the list changes) keeps filtering or manual scrolling
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
  useEffect(
    () => () => {
      if (navigationFrameRef.current !== null) {
        cancelAnimationFrame(navigationFrameRef.current);
      }
    },
    [],
  );
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
  const handleFirstVisibleItemChanged = useCallback(
    ({ index }: { index: number }) => {
      const anchorIndex = listRef.current?.getState().isAtEnd
        ? anchorIndexByListIndex[anchorIndexByListIndex.length - 1]
        : anchorIndexByListIndex[index];
      const anchor = anchorIndex === undefined ? undefined : fastScrollAnchors[anchorIndex];
      if (anchor) {
        setActiveAnchorKey((current) => (current === anchor.key ? current : anchor.key));
      }
    },
    [anchorIndexByListIndex, fastScrollAnchors],
  );
  const handleFastScrollNavigate = useCallback(
    (anchorIndex: number) => {
      const anchor = fastScrollAnchors[anchorIndex];
      if (!anchor) {
        return;
      }

      setActiveAnchorKey(anchor.key);
      pendingNavigationIndexRef.current = anchor.listIndex;
      if (navigationFrameRef.current !== null) {
        return;
      }

      navigationFrameRef.current = requestAnimationFrame(() => {
        navigationFrameRef.current = null;
        const listIndex = pendingNavigationIndexRef.current;
        pendingNavigationIndexRef.current = null;
        if (listIndex !== null) {
          void listRef.current?.scrollToIndex({
            animated: false,
            index: listIndex,
            viewPosition: 0,
          });
        }
      });
    },
    [fastScrollAnchors],
  );
  if (listItems.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6 py-8">
        <Text className="text-center text-base text-muted-foreground">
          {isLoading ? loadingText : emptyText}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <LegendList
        ref={listRef}
        contentContainerStyle={[
          styles.listContentContainer,
          isFastScrollerVisible ? styles.listContentContainerWithFastScroller : undefined,
        ]}
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
        onFirstVisibleItemChanged={
          isFastScrollerVisible ? handleFirstVisibleItemChanged : undefined
        }
        recycleItems
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
      {isFastScrollerVisible ? (
        <ModelPickerFastScroller
          activeIndex={activeAnchorIndex}
          anchors={fastScrollAnchors}
          onNavigate={handleFastScrollNavigate}
        />
      ) : null}
    </View>
  );
}

function ModelPickerGroupHeader({ isFirstGroup, title }: { isFirstGroup: boolean; title: string }) {
  return (
    <View className={cn('px-6', isFirstGroup ? 'mt-2' : 'mt-4')}>
      <Text className="text-base text-muted-foreground">{title}</Text>
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
  return (
    <Pressable
      accessibilityLabel={item.model.name}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className="min-h-12 flex-row items-center gap-3 px-6 active:opacity-60"
      onPress={handleSelect}
    >
      <ModelAvatar model={item.model} provider={item.provider} size={32} />
      <View className="min-w-0 flex-1">
        <Text className="text-base text-foreground" numberOfLines={2}>
          {item.model.name}
        </Text>
      </View>
      {isSelected ? <CheckIcon className="size-5 shrink-0 text-success" /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContentContainer: {
    gap: 4,
    paddingBottom: 24,
  },
  listContentContainerWithFastScroller: {
    paddingRight: 32,
  },
});
