import { Button } from '@cherrystudio/ui/components';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { MinusIcon } from 'lucide-uniwind/png';
import { memo, type ReactElement, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { ProviderModelRow, providerModelRowEstimatedHeight } from './ProviderModelRow';

type ProviderModelListItem = {
  itemKey: string;
  isFirst: boolean;
  isLast: boolean;
  model: Model;
  previousItemKey?: string;
};

type ProviderModelListExtraData = {
  isDefaultModel: (model: Model) => boolean;
  onRemoveModel: (model: Model) => void;
  pressedItemKey?: string;
  provider: Provider | undefined;
  removingIds: ReadonlySet<UniqueModelId>;
};

export function ProviderModelListContent({
  isDefaultModel,
  ListEmptyComponent,
  ListHeaderComponent,
  models,
  onRemoveModel,
  onScrollBeginDrag,
  provider,
  removingIds,
}: {
  isDefaultModel: (model: Model) => boolean;
  ListEmptyComponent?: ReactElement;
  ListHeaderComponent?: ReactElement;
  models: Model[];
  onRemoveModel: (model: Model) => void;
  onScrollBeginDrag?: () => void;
  provider: Provider | undefined;
  removingIds: ReadonlySet<UniqueModelId>;
}) {
  const listItems = useMemo(() => buildProviderModelListItems(models), [models]);
  const [pressedItemKey, setPressedItemKey] = useState<string>();
  const handleItemPressedChange = useCallback((itemKey: string, isPressed: boolean) => {
    setPressedItemKey((currentKey) =>
      isPressed ? itemKey : currentKey === itemKey ? undefined : currentKey,
    );
  }, []);
  const extraData = useMemo<ProviderModelListExtraData>(
    () => ({
      isDefaultModel,
      onRemoveModel,
      pressedItemKey,
      provider,
      removingIds,
    }),
    [isDefaultModel, onRemoveModel, pressedItemKey, provider, removingIds],
  );
  const renderItem = useCallback(
    ({ extraData: itemExtraData, item }: LegendListRenderItemProps<ProviderModelListItem>) => (
      <ModelRow
        canRemove={!itemExtraData.isDefaultModel(item.model)}
        hideSeparator={
          itemExtraData.pressedItemKey === item.itemKey ||
          itemExtraData.pressedItemKey === item.previousItemKey
        }
        itemKey={item.itemKey}
        isFirst={item.isFirst}
        isLast={item.isLast}
        isRemoving={itemExtraData.removingIds.has(item.model.id)}
        model={item.model}
        provider={itemExtraData.provider}
        onRemove={itemExtraData.onRemoveModel}
        onPressedChange={handleItemPressedChange}
      />
    ),
    [handleItemPressedChange],
  );
  const keyExtractor = useCallback((item: ProviderModelListItem) => item.itemKey, []);

  return (
    <LegendList
      automaticallyAdjustsScrollIndicatorInsets
      contentContainerStyle={styles.contentContainer}
      contentInsetAdjustmentBehavior="automatic"
      data={listItems}
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

function buildProviderModelListItems(models: Model[]): ProviderModelListItem[] {
  return models.map((model, index) => ({
    itemKey: `model:${model.id}`,
    isFirst: index === 0,
    isLast: index === models.length - 1,
    model,
    previousItemKey: index > 0 ? `model:${models[index - 1].id}` : undefined,
  }));
}

const ModelRow = memo(function ModelRow({
  canRemove,
  hideSeparator,
  itemKey,
  isFirst,
  isLast,
  isRemoving,
  model,
  onRemove,
  onPressedChange,
  provider,
}: {
  canRemove: boolean;
  hideSeparator: boolean;
  itemKey: string;
  isFirst: boolean;
  isLast: boolean;
  isRemoving: boolean;
  model: Model;
  onRemove: (model: Model) => void;
  onPressedChange: (itemKey: string, isPressed: boolean) => void;
  provider: Provider | undefined;
}) {
  const { t } = useTranslation();
  const handleRemove = useCallback(() => {
    onRemove(model);
  }, [model, onRemove]);

  return (
    <ProviderModelRow
      hideSeparator={hideSeparator}
      isFirst={isFirst}
      isLast={isLast}
      model={model}
      provider={provider}
      surfaceClassName="mx-4"
    >
      <Button
        accessibilityLabel={t('settings.provider.models.remove')}
        accessibilityState={{ busy: isRemoving }}
        disabled={!canRemove || isRemoving}
        hitSlop={6}
        icon={<MinusIcon className="text-destructive" strokeWidth={2} />}
        onPress={handleRemove}
        onPressIn={() => onPressedChange(itemKey, true)}
        onPressOut={() => onPressedChange(itemKey, false)}
        size="sm"
        variant="ghost"
      />
    </ProviderModelRow>
  );
});

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 96,
  },
  list: {
    flex: 1,
  },
});
