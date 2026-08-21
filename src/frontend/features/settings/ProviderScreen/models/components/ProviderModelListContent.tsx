import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { memo, type ReactElement, useCallback, useMemo } from 'react';
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

export type ProviderModelListContentProps = {
  isDefaultModel: (model: Model) => boolean;
  ListEmptyComponent?: ReactElement;
  ListHeaderComponent?: ReactElement;
  models: Model[];
  onScrollBeginDrag?: () => void;
  provider: Provider | undefined;
  selection?: ProviderModelListSelection;
};

type ProviderModelListExtraData = {
  isDefaultModel: (model: Model) => boolean;
  provider: Provider | undefined;
  selection: ProviderModelListSelection | undefined;
};

/**
 * Removing is the selection's job, so a row carries no control of its own — it
 * is a label until the screen starts selecting, and a checkbox after.
 */
export function ProviderModelListContent({
  isDefaultModel,
  ListEmptyComponent,
  ListHeaderComponent,
  models,
  onScrollBeginDrag,
  provider,
  selection,
}: ProviderModelListContentProps) {
  const extraData = useMemo<ProviderModelListExtraData>(
    () => ({
      isDefaultModel,
      provider,
      selection,
    }),
    [isDefaultModel, provider, selection],
  );
  const renderItem = useCallback(
    ({ extraData: itemExtraData, item }: LegendListRenderItemProps<Model>) => (
      <ModelRow
        canRemove={!itemExtraData.isDefaultModel(item)}
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
  isSelected,
  model,
  onToggleSelected,
  provider,
}: {
  canRemove: boolean;
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
