import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Model, UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderModelRow, providerModelRowEstimatedHeight } from './ProviderModelRow';

type ProviderModelSelectListExtraData = {
  onSelect: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedModelId: UniqueModelId | null;
};

/**
 * One of a provider's own models, drawn the way the provider's model tab draws
 * them. A generic label-and-tick option list stood here before, which made the
 * same models look like two different things two taps apart.
 */
export function ProviderModelSelectList({
  emptyText,
  models,
  onSelect,
  provider,
  selectedModelId,
}: {
  emptyText: string;
  models: readonly Model[];
  onSelect: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedModelId: UniqueModelId | null;
}) {
  const listRef = useRef<LegendListRef>(null);
  const hasScrolledToSelectedRef = useRef(false);
  const selectedRowIndex = models.findIndex((model) => model.id === selectedModelId);
  // A provider can serve hundreds of models, so the one already chosen is
  // usually far below the fold — a highlight nobody scrolls to is no answer to
  // "which is set". Guarded on a ref so typing in the search box, which reorders
  // the list under it, doesn't yank the list back.
  useEffect(() => {
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
  }, [selectedRowIndex]);
  const listExtraData = useMemo<ProviderModelSelectListExtraData>(
    () => ({ onSelect, provider, selectedModelId }),
    [onSelect, provider, selectedModelId],
  );
  const renderItem = useCallback(
    ({ extraData, item }: LegendListRenderItemProps<Model>) => (
      <ProviderModelSelectRow
        isSelected={item.id === extraData.selectedModelId}
        model={item}
        provider={extraData.provider}
        onSelect={extraData.onSelect}
      />
    ),
    [],
  );
  const keyExtractor = useCallback((item: Model) => item.id, []);

  if (models.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-center text-base text-foreground">{emptyText}</Text>
      </View>
    );
  }

  return (
    <LegendList
      ref={listRef}
      contentContainerStyle={styles.listContent}
      contentInsetAdjustmentBehavior="automatic"
      data={models}
      estimatedItemSize={providerModelRowEstimatedHeight}
      extraData={listExtraData}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={keyExtractor}
      maintainVisibleContentPosition={false}
      recycleItems
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      style={styles.list}
    />
  );
}

const ProviderModelSelectRow = memo(function ProviderModelSelectRow({
  isSelected,
  model,
  onSelect,
  provider,
}: {
  isSelected: boolean;
  model: Model;
  onSelect: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
}) {
  const handlePress = useCallback(() => {
    onSelect(model.id);
  }, [model.id, onSelect]);

  return (
    <Pressable
      accessibilityLabel={model.name}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      className="active:opacity-60"
      onPress={handlePress}
    >
      {/* The fill is the whole mark of the selection, as in the model picker. */}
      <ProviderModelRow
        className={isSelected ? 'rounded-xl bg-secondary' : undefined}
        model={model}
        provider={provider}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  list: { flex: 1 },
  // 8 rather than the 16 the screen's other content sits on: the rows carry
  // their own, which is what leaves the selected row's fill room outside its
  // text.
  listContent: { paddingBottom: 20, paddingHorizontal: 8, paddingTop: 8 },
});
