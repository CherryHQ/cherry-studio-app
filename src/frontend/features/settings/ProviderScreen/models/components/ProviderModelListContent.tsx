import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { memo, type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Model, UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  buildProviderModelListItems,
  type ProviderModelListItem,
} from '../utils/providerModelListItems';
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
  groupByPurpose: boolean;
  isDefaultModel: (model: Model) => boolean;
  ListEmptyComponent?: ReactElement;
  models: Model[];
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
  groupByPurpose,
  isDefaultModel,
  ListEmptyComponent,
  models,
  provider,
  selection,
}: ProviderModelListContentProps) {
  const { t } = useTranslation();
  const listItems = useMemo(
    () => buildProviderModelListItems(models, groupByPurpose),
    [groupByPurpose, models],
  );
  const extraData = useMemo<ProviderModelListExtraData>(
    () => ({
      isDefaultModel,
      provider,
      selection,
    }),
    [isDefaultModel, provider, selection],
  );
  const renderItem = useCallback(
    ({ extraData: itemExtraData, item }: LegendListRenderItemProps<ProviderModelListItem>) => {
      if (item.type === 'section') {
        return (
          <View
            className={
              item.isFirstSection
                ? 'flex-row items-center justify-between px-4 pt-3 pb-2'
                : 'flex-row items-center justify-between px-4 pt-5 pb-2'
            }
          >
            <Text className="font-medium text-foreground-tertiary text-sm">
              {t(
                item.purpose === 'chat'
                  ? 'settings.provider.models.section.chat'
                  : 'settings.provider.models.section.painting',
              )}
            </Text>
            <Text className="text-foreground-tertiary text-sm" style={styles.counter}>
              {item.count}
            </Text>
          </View>
        );
      }

      return (
        <ModelRow
          canRemove={!itemExtraData.isDefaultModel(item.model)}
          isSelected={itemExtraData.selection?.selectedIds.has(item.model.id) ?? false}
          model={item.model}
          provider={itemExtraData.provider}
          onToggleSelected={itemExtraData.selection?.onToggleModel}
        />
      );
    },
    [t],
  );

  return (
    <LegendList
      automaticallyAdjustsScrollIndicatorInsets
      contentContainerStyle={styles.contentContainer}
      contentInsetAdjustmentBehavior="automatic"
      data={listItems}
      estimatedItemSize={providerModelRowEstimatedHeight}
      extraData={extraData}
      getItemType={getProviderModelListItemType}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={providerModelListKeyExtractor}
      ListEmptyComponent={ListEmptyComponent}
      maintainVisibleContentPosition={false}
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

function providerModelListKeyExtractor(item: ProviderModelListItem) {
  return item.key;
}

function getProviderModelListItemType(item: ProviderModelListItem) {
  return item.type;
}

const styles = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 96,
  },
  counter: {
    fontVariant: ['tabular-nums'],
  },
  list: {
    flex: 1,
  },
});
