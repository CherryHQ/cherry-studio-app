import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { Button } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { getProviderModelEndpointLabelKey } from '../utils/providerModelAdd';
import {
  getProviderModelEndpointState,
  shouldShowProviderModelEndpointPicker,
} from '../utils/providerModelEndpoint';
import {
  buildProviderModelListItems,
  type ProviderModelListItem,
} from '../utils/providerModelListItems';
import { ProviderModelRow, providerModelRowEstimatedHeights } from './ProviderModelRow';

export type ProviderModelListContentProps = {
  groupByPurpose: boolean;
  ListEmptyComponent?: ReactElement;
  isEndpointSelectionDisabled?: boolean;
  models: Model[];
  onEndpointPress?: (model: Model) => void;
  provider: Provider | undefined;
  updatingModelId?: string;
};

type ProviderModelListExtraData = {
  isEndpointSelectionDisabled: boolean;
  onEndpointPress?: (model: Model) => void;
  provider: Provider | undefined;
  updatingModelId?: string;
};

export function ProviderModelListContent({
  groupByPurpose,
  isEndpointSelectionDisabled = false,
  ListEmptyComponent,
  models,
  onEndpointPress,
  provider,
  updatingModelId,
}: ProviderModelListContentProps) {
  const { t } = useTranslation();
  const listItems = useMemo(
    () => buildProviderModelListItems(models, groupByPurpose),
    [groupByPurpose, models],
  );
  const extraData = useMemo<ProviderModelListExtraData>(
    () => ({
      isEndpointSelectionDisabled,
      onEndpointPress,
      provider,
      updatingModelId,
    }),
    [isEndpointSelectionDisabled, onEndpointPress, provider, updatingModelId],
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

      const itemProvider = itemExtraData.provider;
      const endpointButton =
        itemProvider &&
        itemExtraData.onEndpointPress &&
        shouldShowProviderModelEndpointPicker({ model: item.model, provider: itemProvider }) ? (
          <ProviderModelEndpointButton
            disabled={
              itemExtraData.isEndpointSelectionDisabled || Boolean(itemExtraData.updatingModelId)
            }
            model={item.model}
            onPress={itemExtraData.onEndpointPress}
            provider={itemProvider}
          />
        ) : null;

      return (
        <ProviderModelRow model={item.model} provider={itemProvider} variant="management">
          {endpointButton}
        </ProviderModelRow>
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

function ProviderModelEndpointButton({
  disabled,
  model,
  onPress,
  provider,
}: {
  disabled: boolean;
  model: Model;
  onPress: (model: Model) => void;
  provider: Provider;
}) {
  const { t } = useTranslation();
  const endpointState = getProviderModelEndpointState(provider, model);
  const endpointLabel =
    (endpointState.kind === 'default' || endpointState.kind === 'explicit') &&
    endpointState.endpointType
      ? t(getProviderModelEndpointLabelKey(endpointState.endpointType))
      : undefined;
  const label =
    endpointState.kind === 'default'
      ? t('settings.provider.models.endpoint.defaultLabel', { endpoint: endpointLabel })
      : endpointState.kind === 'explicit'
        ? endpointLabel
        : t(
            endpointState.kind === 'unsupported'
              ? 'settings.provider.models.endpoint.unsupported'
              : 'settings.provider.models.endpoint.unavailable',
          );
  const handlePress = useCallback(() => onPress(model), [model, onPress]);

  return (
    <Button
      accessibilityLabel={t('settings.provider.models.endpoint.changeAccessibility', {
        model: model.name,
      })}
      disabled={disabled}
      onPress={handlePress}
      size="inline"
      variant="ghost"
    >
      <Button.Label numberOfLines={1}>{label}</Button.Label>
      <ChevronDownIcon className="size-4 text-muted-foreground" />
    </Button>
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
