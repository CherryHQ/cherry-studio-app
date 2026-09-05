import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import {
  Button,
  ContextMenu,
  ContextMenuScrollBoundary,
  type MenuItem,
} from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useRouter } from 'expo-router';
import { type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useListBottomInset } from '@/frontend/components/Selection';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import type { useProviderModelManagement } from '../hooks/useProviderModelManagement';
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
  supportedModelIds?: ReadonlySet<string>;
  management?: ReturnType<typeof useProviderModelManagement>;
  ListEmptyComponent?: ReactElement;
  isEndpointSelectionDisabled?: boolean;
  models: Model[];
  onEndpointPress?: (model: Model) => void;
  provider: Provider | undefined;
  updatingModelId?: string;
};

type ProviderModelListExtraData = {
  supportedModelIds?: ReadonlySet<string>;
  management?: ReturnType<typeof useProviderModelManagement>;
  isEndpointSelectionDisabled: boolean;
  onEndpointPress?: (model: Model) => void;
  provider: Provider | undefined;
  updatingModelId?: string;
};

export function ProviderModelListContent({
  groupByPurpose,
  management,
  supportedModelIds,
  isEndpointSelectionDisabled = false,
  ListEmptyComponent,
  models,
  onEndpointPress,
  provider,
  updatingModelId,
}: ProviderModelListContentProps) {
  const { t } = useTranslation();
  const bottomInset = useListBottomInset();
  const listItems = useMemo(
    () => buildProviderModelListItems(models, groupByPurpose),
    [groupByPurpose, models],
  );
  const extraData = useMemo<ProviderModelListExtraData>(
    () => ({
      management,
      supportedModelIds,
      isEndpointSelectionDisabled,
      onEndpointPress,
      provider,
      updatingModelId,
    }),
    [
      supportedModelIds,
      management,
      isEndpointSelectionDisabled,
      onEndpointPress,
      provider,
      updatingModelId,
    ],
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

      if (itemExtraData.management) {
        return (
          <ManagedModelRow
            model={item.model}
            provider={itemProvider}
            isSelecting={itemExtraData.management.isSelecting}
            isDeleting={itemExtraData.management.isDeleting}
            isSelected={itemExtraData.management.selectedIds.has(item.model.id)}
            onSelect={itemExtraData.management.beginSelection}
            onDelete={itemExtraData.management.requestDelete}
            onToggle={itemExtraData.management.toggleModel}
            statusLabel={
              !item.model.isEnabled
                ? t('settings.provider.models.management.disabled')
                : itemExtraData.supportedModelIds &&
                    !itemExtraData.supportedModelIds.has(item.model.id)
                  ? t('settings.provider.models.management.unsupported')
                  : undefined
            }
            endpointButton={endpointButton}
          />
        );
      }
      return (
        <ProviderModelRow model={item.model} provider={itemProvider} variant="management">
          {endpointButton}
        </ProviderModelRow>
      );
    },
    [t],
  );

  return (
    <ContextMenuScrollBoundary>
      {(scrollHandlers) => (
        <LegendList
          {...scrollHandlers}
          automaticallyAdjustsScrollIndicatorInsets
          contentContainerStyle={[styles.contentContainer, { paddingBottom: bottomInset }]}
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
      )}
    </ContextMenuScrollBoundary>
  );
}

function ManagedModelRow({
  model,
  provider,
  isSelecting,
  isDeleting,
  isSelected,
  onSelect,
  onDelete,
  onToggle,
  statusLabel,
  endpointButton,
}: {
  model: Model;
  provider: Provider | undefined;
  isSelecting: boolean;
  isDeleting: boolean;
  isSelected: boolean;
  onSelect: ReturnType<typeof useProviderModelManagement>['beginSelection'];
  onDelete: ReturnType<typeof useProviderModelManagement>['requestDelete'];
  onToggle: ReturnType<typeof useProviderModelManagement>['toggleModel'];
  statusLabel?: string;
  endpointButton: ReactElement | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const openModel = (edit = false) =>
    router.push({
      pathname: edit
        ? '/settings/provider/[providerId]/model-edit'
        : '/settings/provider/[providerId]/model',
      params: { providerId: model.providerId, modelId: model.id },
    });
  const items: readonly MenuItem[] = [
    {
      id: 'detail',
      label: t('settings.provider.models.management.details'),
      onPress: () => openModel(),
    },
    {
      id: 'edit',
      label: t('settings.provider.models.management.edit'),
      onPress: () => openModel(true),
    },
    {
      id: 'select',
      label: t('settings.provider.models.management.select'),
      onPress: () => onSelect(model),
    },
    {
      id: 'delete',
      label: t('common.delete'),
      destructive: true,
      onPress: () => onDelete([model]),
    },
  ];
  if (isSelecting) {
    return (
      <ProviderModelRow
        model={model}
        provider={provider}
        variant="management"
        selection={{
          isDisabled: isDeleting,
          isSelected,
          onToggle: () => onToggle(model.id),
        }}
      />
    );
  }
  return (
    <ContextMenu items={isDeleting ? [] : items}>
      <ProviderModelRow
        model={model}
        provider={provider}
        variant="management"
        statusLabel={statusLabel}
        disabled={isDeleting}
        onPress={() => openModel()}
      >
        {endpointButton}
      </ProviderModelRow>
    </ContextMenu>
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
