import { Button, SelectionIndicator } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/Avatar';
import { CLOUD_UNAVAILABLE_KEYS } from '@/frontend/hooks/useCloud';

import {
  getModelPickerBadges,
  type ModelPickerBadge as ModelPickerBadgeValue,
} from '../utils/modelPickerBadges';
import type { ModelPickerModelItem } from '../utils/modelPickerData';
import {
  buildModelPickerFastScrollNavigation,
  MIN_MODEL_PICKER_FAST_SCROLL_MODEL_COUNT,
} from '../utils/modelPickerFastScroll';
import type { ModelPickerListItem } from '../utils/modelPickerListItems';
import { ModelPickerBadge } from './ModelPickerBadge';
import { ModelPickerFastScroller } from './ModelPickerFastScroller';

const modelPickerEstimatedItemSize = 60;
type ModelPickerDensity = 'default' | 'compact';

type ModelPickerListProps = {
  disabled?: boolean;
  /** The containing surface can own the gutter when embedding the list. */
  contentInset?: 'default' | 'none';
  density?: ModelPickerDensity;
  emptyAction?: { label: string; onPress: () => void; variant?: 'secondary' | 'text' };
  emptyText?: string;
  isLoading?: boolean;
  /** Whether the picker is on screen; it scrolls to the selection once per showing. */
  isOpen?: boolean;
  listItems: readonly ModelPickerListItem[];
  loadingText?: string;
  onSelect: (item: ModelPickerModelItem) => void;
  selectedModelId: string | null;
  /** Present in multi-select mode: every chosen model shows a selection mark. */
  selectedModelIds?: readonly string[];
  /** Unchosen rows are disabled once this many models are chosen. */
  maxSelectedCount?: number;
  showBadges?: boolean;
};

type ModelPickerListExtraData = {
  disabled: boolean;
  contentInset: 'default' | 'none';
  density: ModelPickerDensity;
  selectedModelId: string | null;
  selectedModelIds?: readonly string[];
  isFull: boolean;
};

/** Provider-grouped model rows shared by the picker sheet and inline setup. */
export function ModelPickerList({
  disabled = false,
  contentInset = 'default',
  density = 'default',
  emptyAction,
  emptyText,
  isLoading = false,
  isOpen = false,
  listItems,
  loadingText,
  onSelect,
  selectedModelId,
  selectedModelIds,
  maxSelectedCount = Infinity,
  showBadges = false,
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
    () => ({
      disabled,
      contentInset,
      density,
      selectedModelId,
      selectedModelIds,
      isFull: (selectedModelIds?.length ?? 0) >= maxSelectedCount,
    }),
    [contentInset, density, disabled, maxSelectedCount, selectedModelId, selectedModelIds],
  );
  const renderItem = useCallback(
    ({ extraData, item }: LegendListRenderItemProps<ModelPickerListItem>) => {
      if (item.type === 'groupHeader') {
        return (
          <ModelPickerGroupHeader
            contentInset={extraData.contentInset}
            isFirstGroup={item.isFirstGroup}
            title={item.title}
          />
        );
      }

      const isSelected = extraData.selectedModelIds
        ? extraData.selectedModelIds.includes(item.item.modelId)
        : item.item.modelId === extraData.selectedModelId;
      return (
        <ModelPickerRow
          contentInset={extraData.contentInset}
          density={extraData.density}
          isDisabled={
            extraData.disabled ||
            Boolean(item.item.cloudUnavailable) ||
            (Boolean(extraData.selectedModelIds) && extraData.isFull && !isSelected)
          }
          isSelected={isSelected}
          item={item.item}
          multiple={Boolean(extraData.selectedModelIds)}
          onSelect={onSelect}
          showBadges={showBadges}
        />
      );
    },
    [onSelect, showBadges],
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
      <View
        className={cn(
          'flex-1 items-center justify-center gap-2 py-8',
          contentInset === 'default' && 'px-6',
        )}
      >
        <Text className="text-center text-sm text-muted-foreground">
          {isLoading ? loadingText : emptyText}
        </Text>
        {!isLoading && emptyAction ? (
          <Button
            disabled={disabled}
            onPress={emptyAction.onPress}
            size="sm"
            variant={emptyAction.variant ?? 'secondary'}
          >
            {emptyAction.label}
          </Button>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.list} testID="model-picker-list">
      <LegendList
        ref={listRef}
        contentContainerStyle={styles.listContentContainer}
        data={listItems}
        drawDistance={320}
        estimatedItemSize={density === 'compact' ? 44 : modelPickerEstimatedItemSize}
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

function ModelPickerGroupHeader({
  contentInset,
  isFirstGroup,
  title,
}: {
  contentInset: 'default' | 'none';
  isFirstGroup: boolean;
  title: string;
}) {
  return (
    <View
      className={cn('pb-1', contentInset === 'default' && 'px-5', isFirstGroup ? 'pt-1' : 'pt-3')}
    >
      <Text className="font-medium text-muted-foreground text-xs">{title}</Text>
    </View>
  );
}

const ModelPickerRow = memo(function ModelPickerRow({
  contentInset,
  density,
  isDisabled,
  isSelected,
  item,
  multiple,
  onSelect,
  showBadges,
}: {
  contentInset: 'default' | 'none';
  density: ModelPickerDensity;
  isDisabled: boolean;
  isSelected: boolean;
  item: ModelPickerModelItem;
  multiple: boolean;
  onSelect: (item: ModelPickerModelItem) => void;
  showBadges: boolean;
}) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);
  const badges = showBadges ? getModelPickerBadges(item.model, item.isCloudFree) : [];
  const unavailable = item.cloudUnavailable
    ? t(CLOUD_UNAVAILABLE_KEYS[item.cloudUnavailable])
    : undefined;
  const accessibilityLabel = [
    item.model.name,
    ...(unavailable ? [unavailable] : []),
    ...badges.map((badge) => t(modelPickerBadgeLabelKeys[badge])),
  ].join(', ');
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={multiple ? 'checkbox' : 'button'}
      accessibilityState={
        multiple
          ? { checked: isSelected, disabled: isDisabled }
          : { selected: isSelected, disabled: isDisabled }
      }
      className={cn(
        'flex-row items-center gap-3 active:bg-secondary-active dark:active:bg-secondary-active/50',
        density === 'compact' ? 'min-h-11 py-2' : 'min-h-14 py-2.5',
        contentInset === 'default' && 'px-5',
        isSelected && 'bg-secondary dark:bg-secondary/40',
        isDisabled && 'opacity-40',
      )}
      disabled={isDisabled}
      onPress={handleSelect}
    >
      <View
        className={cn(
          'h-6 justify-center',
          density === 'compact' ? 'w-6' : 'w-7',
          badges.length > 0 && 'self-start',
        )}
      >
        <ModelAvatar
          artwork={density === 'compact' ? 'brand' : 'model'}
          model={item.model}
          provider={item.provider}
          size={density === 'compact' ? 24 : 28}
        />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            'text-foreground',
            density === 'compact' ? 'text-sm' : 'text-base',
            isSelected ? 'font-semibold' : 'font-medium',
          )}
          ellipsizeMode="middle"
          numberOfLines={1}
        >
          {item.model.name}
        </Text>
        {unavailable ? <Text className="text-xs text-muted-foreground">{unavailable}</Text> : null}
        {badges.length > 0 ? (
          <View className="h-4 flex-row items-center gap-1">
            {badges.map((badge) => (
              <ModelPickerBadge badge={badge} key={`${item.model.id}:${badge}`} variant="icon" />
            ))}
          </View>
        ) : null}
      </View>
      <View
        className={cn(
          'size-6 shrink-0 items-center justify-center',
          badges.length > 0 && 'self-start',
        )}
      >
        {multiple ? (
          <SelectionIndicator className="size-5" selected={isSelected} />
        ) : isSelected ? (
          <SelectionIndicator className="size-5" selected />
        ) : null}
      </View>
    </Pressable>
  );
});

const modelPickerBadgeLabelKeys = {
  free: 'models.capability.free',
  vision: 'models.capability.imageRecognition',
} as const satisfies Record<ModelPickerBadgeValue, string>;

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContentContainer: {
    paddingBottom: 24,
  },
});
