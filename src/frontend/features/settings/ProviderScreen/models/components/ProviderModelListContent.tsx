import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';

import type { Model, UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderModelRow, providerModelRowEstimatedHeight } from './ProviderModelRow';

/**
 * Given while the list is selecting. `selectedIds` changing is what re-renders
 * the rows, which is why it travels through `extraData` rather than a closure.
 */
export type ProviderModelListSelection = {
  onToggleModel: (id: UniqueModelId) => void;
  selectedIds: ReadonlySet<UniqueModelId>;
};

export type ProviderModelListFocusRequest = {
  modelId: UniqueModelId;
};

export type ProviderModelListContentProps = {
  focusRequest?: ProviderModelListFocusRequest;
  isDefaultModel: (model: Model) => boolean;
  ListEmptyComponent?: ReactElement;
  ListHeaderComponent?: ReactElement;
  models: Model[];
  onScrollBeginDrag?: () => void;
  provider: Provider | undefined;
  selection?: ProviderModelListSelection;
};

type ProviderModelListExtraData = {
  focusedModelId?: UniqueModelId;
  isDefaultModel: (model: Model) => boolean;
  provider: Provider | undefined;
  selection: ProviderModelListSelection | undefined;
};

/**
 * Removing is the selection's job, so a row carries no control of its own — it
 * is a label until the screen starts selecting, and a checkbox after.
 */
export function ProviderModelListContent({
  focusRequest,
  isDefaultModel,
  ListEmptyComponent,
  ListHeaderComponent,
  models,
  onScrollBeginDrag,
  provider,
  selection,
}: ProviderModelListContentProps) {
  const listRef = useRef<LegendListRef>(null);
  useEffect(() => {
    if (!focusRequest) {
      return;
    }

    const index = models.findIndex((model) => model.id === focusRequest.modelId);
    if (index < 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.35 });
    });

    return () => cancelAnimationFrame(frame);
  }, [focusRequest, models]);
  const extraData = useMemo<ProviderModelListExtraData>(
    () => ({
      focusedModelId: focusRequest?.modelId,
      isDefaultModel,
      provider,
      selection,
    }),
    [focusRequest, isDefaultModel, provider, selection],
  );
  const renderItem = useCallback(
    ({ extraData: itemExtraData, item }: LegendListRenderItemProps<Model>) => (
      <ModelRow
        canRemove={!itemExtraData.isDefaultModel(item)}
        isFocused={item.id === itemExtraData.focusedModelId}
        isSelected={itemExtraData.selection?.selectedIds.has(item.id) ?? false}
        model={item}
        provider={itemExtraData.provider}
        onToggleSelected={itemExtraData.selection?.onToggleModel}
      />
    ),
    [],
  );
  const keyExtractor = useCallback((item: Model) => item.id, []);

  return (
    <LegendList
      ref={listRef}
      automaticallyAdjustsScrollIndicatorInsets
      contentContainerStyle={styles.contentContainer}
      contentInsetAdjustmentBehavior="automatic"
      data={models}
      estimatedItemSize={providerModelRowEstimatedHeight}
      extraData={extraData}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={keyExtractor}
      ListEmptyComponent={ListEmptyComponent}
      ListHeaderComponent={ListHeaderComponent}
      maintainVisibleContentPosition={false}
      onScrollBeginDrag={onScrollBeginDrag}
      recycleItems
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      style={styles.list}
    />
  );
}

const ModelRow = memo(function ModelRow({
  canRemove,
  isFocused,
  isSelected,
  model,
  onToggleSelected,
  provider,
}: {
  canRemove: boolean;
  isFocused: boolean;
  isSelected: boolean;
  model: Model;
  /** Given only while selecting; its absence is what leaves the row a plain label. */
  onToggleSelected?: (id: UniqueModelId) => void;
  provider: Provider | undefined;
}) {
  const handleToggleSelected = useCallback(() => {
    onToggleSelected?.(model.id);
  }, [model.id, onToggleSelected]);

  return (
    <ProviderModelRow
      className={isFocused ? 'bg-foreground/5' : undefined}
      model={model}
      provider={provider}
      selection={
        onToggleSelected
          ? { isDisabled: !canRemove, isSelected, onToggle: handleToggleSelected }
          : undefined
      }
    />
  );
});

const styles = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 96,
  },
  list: {
    flex: 1,
  },
});
