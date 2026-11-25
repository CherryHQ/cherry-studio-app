import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import {
  Button,
  LockedGroupSlice,
  type MenuItem,
  ScrollInteractionBoundary,
  Sortable,
  useSortableScrollController,
} from '@cherrystudio/ui/components';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { useRouter } from 'expo-router';
import { type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useListBottomInset } from '@/frontend/components/Selection';
import { reorderLocally } from '@/frontend/data/utils/reorder';
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
import { filterProviderModelsByPurpose } from '../utils/providerModelPurpose';
import { ProviderModelRow, providerModelRowEstimatedHeights } from './ProviderModelRow';

export type ProviderModelListContentProps = {
  canReorder?: boolean;
  groupByPurpose: boolean;
  supportedModelIds?: ReadonlySet<string>;
  management?: ReturnType<typeof useProviderModelManagement>;
  ListEmptyComponent?: ReactElement;
  isEndpointSelectionDisabled?: boolean;
  /** Draws the list inside one locked group: an organization supplies these models. */
  locked?: boolean;
  models: readonly Model[];
  onEndpointPress?: (model: Model) => void;
  onReorderModels?: (newItems: readonly Model[]) => Promise<boolean>;
  provider: Provider | undefined;
  updatingModelId?: string;
};

type ModelSortablePosition = {
  groupId: string;
  groupIndex: number;
  groupSize: number;
};

type ModelSortableGroup = {
  groupId: string;
  itemIds: string[];
  models: Model[];
};

type ProviderModelListExtraData = {
  canReorder: boolean;
  supportedModelIds?: ReadonlySet<string>;
  management?: ReturnType<typeof useProviderModelManagement>;
  isEndpointSelectionDisabled: boolean;
  modelPositionById: ReadonlyMap<string, ModelSortablePosition>;
  onEndpointPress?: (model: Model) => void;
  onReorderGroup: (groupId: string, fromIndex: number, toIndex: number) => void;
  provider: Provider | undefined;
  updatingModelId?: string;
};

export function ProviderModelListContent({
  canReorder = false,
  groupByPurpose,
  management,
  supportedModelIds,
  isEndpointSelectionDisabled = false,
  ListEmptyComponent,
  locked = false,
  models,
  onEndpointPress,
  onReorderModels,
  provider,
  updatingModelId,
}: ProviderModelListContentProps) {
  const { t } = useTranslation();
  const bottomInset = useListBottomInset();
  const scroll = useSortableScrollController<LegendListRef>();
  const listItems = useMemo(
    () => buildProviderModelListItems(models, groupByPurpose),
    [groupByPurpose, models],
  );
  const { groupById, modelPositionById, sortableGroups } = useMemo(() => {
    const groups: ModelSortableGroup[] = [];
    const byId = new Map<string, Model[]>();
    const positions = new Map<string, ModelSortablePosition>();

    if (groupByPurpose) {
      for (const purpose of ['chat', 'painting'] as const) {
        const purposeModels = filterProviderModelsByPurpose(models, purpose);
        if (purposeModels.length === 0) continue;
        groups.push({
          groupId: purpose,
          itemIds: purposeModels.map((model) => model.id),
          models: purposeModels,
        });
      }
    } else if (models.length > 0) {
      groups.push({
        groupId: 'models',
        itemIds: models.map((model) => model.id),
        models: [...models],
      });
    }

    for (const group of groups) {
      byId.set(group.groupId, group.models);
      const groupSize = group.models.length;
      group.models.forEach((model, groupIndex) => {
        positions.set(model.id, { groupId: group.groupId, groupIndex, groupSize });
      });
    }

    return { groupById: byId, modelPositionById: positions, sortableGroups: groups };
  }, [groupByPurpose, models]);

  const handleReorderGroup = useCallback(
    (groupId: string, fromIndex: number, toIndex: number) => {
      if (!canReorder || !onReorderModels) return;
      const groupModels = groupById.get(groupId);
      if (!groupModels) return;
      void onReorderModels(reorderLocally(groupModels, fromIndex, toIndex));
    },
    [canReorder, groupById, onReorderModels],
  );

  const extraData = useMemo<ProviderModelListExtraData>(
    () => ({
      canReorder,
      management,
      supportedModelIds,
      isEndpointSelectionDisabled,
      modelPositionById,
      onEndpointPress,
      onReorderGroup: handleReorderGroup,
      provider,
      updatingModelId,
    }),
    [
      canReorder,
      supportedModelIds,
      management,
      isEndpointSelectionDisabled,
      modelPositionById,
      onEndpointPress,
      handleReorderGroup,
      provider,
      updatingModelId,
    ],
  );
  const renderListItem = useCallback(
    ({ extraData: itemExtraData, item }: LegendListRenderItemProps<ProviderModelListItem>) => {
      if (item.type === 'section') {
        return (
          <Sortable.Chrome>
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
          </Sortable.Chrome>
        );
      }

      const itemProvider = itemExtraData.provider;
      const rawEndpointButton =
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
      const endpointButton = rawEndpointButton ? (
        <Sortable.Exclusion>{rawEndpointButton}</Sortable.Exclusion>
      ) : null;

      if (itemExtraData.management) {
        const position = itemExtraData.modelPositionById.get(item.model.id) ?? {
          groupId: 'models',
          groupIndex: 0,
          groupSize: 1,
        };
        return (
          <ManagedModelRow
            canReorder={itemExtraData.canReorder}
            endpointButton={endpointButton}
            isDeleting={itemExtraData.management.isDeleting}
            isSelected={itemExtraData.management.selectedIds.has(item.model.id)}
            isSelecting={itemExtraData.management.isSelecting}
            model={item.model}
            onDelete={itemExtraData.management.requestDelete}
            onMoveToTop={() =>
              itemExtraData.onReorderGroup(position.groupId, position.groupIndex, 0)
            }
            onSelect={itemExtraData.management.beginSelection}
            onToggle={itemExtraData.management.toggleModel}
            position={position}
            provider={itemProvider}
            statusLabel={
              !item.model.isEnabled
                ? t('settings.provider.models.management.disabled')
                : itemExtraData.supportedModelIds &&
                    !itemExtraData.supportedModelIds.has(item.model.id)
                  ? t('settings.provider.models.management.unsupported')
                  : undefined
            }
          />
        );
      }
      return (
        <DetailModelRow model={item.model} provider={itemProvider}>
          {rawEndpointButton}
        </DetailModelRow>
      );
    },
    [t],
  );
  const lastIndex = listItems.length - 1;
  const renderItem = useCallback(
    (props: LegendListRenderItemProps<ProviderModelListItem>) =>
      locked ? (
        <View className="mx-4">
          <LockedGroupSlice isFirst={props.index === 0} isLast={props.index === lastIndex}>
            {renderListItem(props)}
          </LockedGroupSlice>
        </View>
      ) : (
        renderListItem(props)
      ),
    [lastIndex, locked, renderListItem],
  );

  return (
    <Sortable.Root scrollController={scroll.controller}>
      {({ isDragging }) => (
        <ScrollInteractionBoundary>
          {(scrollHandlers) => (
            <>
              {canReorder
                ? sortableGroups.map((group) => (
                    <Sortable.Group
                      estimatedItemHeight={providerModelRowEstimatedHeights.management}
                      groupId={group.groupId}
                      itemIds={group.itemIds}
                      key={group.groupId}
                      onReorder={({ fromIndex, groupId, toIndex }) =>
                        handleReorderGroup(groupId, fromIndex, toIndex)
                      }
                    />
                  ))
                : null}
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
                onScroll={scroll.onScroll}
                recycleItems
                ref={scroll.setRef}
                renderItem={renderItem}
                scrollEnabled={!isDragging}
                showsVerticalScrollIndicator={false}
                style={styles.list}
              />
            </>
          )}
        </ScrollInteractionBoundary>
      )}
    </Sortable.Root>
  );
}

/** A row without management actions still opens the model's details. */
function DetailModelRow({
  children,
  model,
  provider,
}: {
  children: ReactElement | null;
  model: Model;
  provider: Provider | undefined;
}) {
  const router = useRouter();
  return (
    <ProviderModelRow
      model={model}
      provider={provider}
      variant="management"
      onPress={() => openModelDetails(router, model)}
    >
      {children}
    </ProviderModelRow>
  );
}

function openModelDetails(router: ReturnType<typeof useRouter>, model: Model) {
  router.push({
    pathname: '/settings/provider/[providerId]/model',
    params: { providerId: model.providerId, modelId: model.id },
  });
}

function ManagedModelRow({
  canReorder,
  model,
  position,
  provider,
  isSelecting,
  isDeleting,
  isSelected,
  onMoveToTop,
  onSelect,
  onDelete,
  onToggle,
  statusLabel,
  endpointButton,
}: {
  canReorder: boolean;
  model: Model;
  position: ModelSortablePosition;
  provider: Provider | undefined;
  isSelecting: boolean;
  isDeleting: boolean;
  isSelected: boolean;
  onMoveToTop: () => void;
  onSelect: ReturnType<typeof useProviderModelManagement>['beginSelection'];
  onDelete: ReturnType<typeof useProviderModelManagement>['requestDelete'];
  onToggle: ReturnType<typeof useProviderModelManagement>['toggleModel'];
  statusLabel?: string;
  endpointButton: ReactElement | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const openModel = () => openModelDetails(router, model);
  const canMove = canReorder && !isDeleting && position.groupSize > 1;
  const items: readonly MenuItem[] = [
    {
      id: 'detail',
      label: t('settings.provider.models.management.details'),
      onPress: () => openModel(),
    },
    ...(canMove && position.groupIndex > 0
      ? [
          {
            id: 'move-to-top',
            label: t('common.moveToTop'),
            onPress: onMoveToTop,
          },
        ]
      : []),
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
        statusLabel={statusLabel}
        selection={{
          isDisabled: isDeleting,
          isSelected,
          onToggle: () => onToggle(model.id),
        }}
      />
    );
  }
  return (
    <Sortable.Item
      accessibilityLabels={{
        moveDown: t('common.moveDown', { name: model.name }),
        moveToTop: t('common.moveToTop'),
        moveUp: t('common.moveUp', { name: model.name }),
      }}
      disabled={isDeleting}
      estimatedHeight={providerModelRowEstimatedHeights.management}
      groupId={position.groupId}
      groupSize={position.groupSize}
      id={model.id}
      index={position.groupIndex}
      menuItems={isDeleting ? [] : items}
      movable={canMove}
    >
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
    </Sortable.Item>
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
