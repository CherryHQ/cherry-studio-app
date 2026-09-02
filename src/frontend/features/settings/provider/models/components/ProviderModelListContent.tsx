import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  buildProviderModelListItems,
  type ProviderModelListItem,
} from '../utils/providerModelListItems';
import { ProviderModelRow, providerModelRowEstimatedHeights } from './ProviderModelRow';

export type ProviderModelListContentProps = {
  groupByPurpose: boolean;
  ListEmptyComponent?: ReactElement;
  models: Model[];
  provider: Provider | undefined;
};

type ProviderModelListExtraData = {
  provider: Provider | undefined;
};

export function ProviderModelListContent({
  groupByPurpose,
  ListEmptyComponent,
  models,
  provider,
}: ProviderModelListContentProps) {
  const { t } = useTranslation();
  const listItems = useMemo(
    () => buildProviderModelListItems(models, groupByPurpose),
    [groupByPurpose, models],
  );
  const extraData = useMemo<ProviderModelListExtraData>(() => ({ provider }), [provider]);
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
        <ProviderModelRow
          model={item.model}
          provider={itemExtraData.provider}
          variant="management"
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
      estimatedItemSize={providerModelRowEstimatedHeights.management}
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
