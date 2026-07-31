import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { ChevronRightIcon, MinusIcon } from 'lucide-uniwind/png';
import { memo, type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Model, UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { SettingsGroupedSurface } from '../../../components/SettingsGroupedSurface';

import { getModelGroupLabel, type ProviderModelGroup } from '../utils/providerModelGroups';
import { ProviderModelRow, providerModelRowHeight } from './ProviderModelRow';

const groupHeaderHeight = 48;
const separatorHeight = 1;

/**
 * Where a row sits inside the single grouped card the list draws. Stamped onto
 * the data rather than read off `renderItem`'s `index`, which a recycled row
 * keeps from its previous position when the list shrinks — that is enough to
 * round the wrong corners and resurrect a separator above the first row.
 */
type ProviderModelRowPlacement = {
  isFirst: boolean;
  isLast: boolean;
};

type ProviderModelListEntry =
  | {
      group: ProviderModelGroup;
      type: 'group';
    }
  | {
      model: Model;
      type: 'model';
    };

type ProviderModelListItem = ProviderModelListEntry & ProviderModelRowPlacement;

type ProviderModelAccordionExtraData = {
  expandedGroupNames: Set<string>;
  isDefaultModel: (model: Model) => boolean;
  onRemoveModel: (model: Model) => void;
  provider: Provider | undefined;
  removingIds: ReadonlySet<UniqueModelId>;
};

export function ProviderModelAccordion({
  displayedExpandedValues,
  groups,
  isDefaultModel,
  ListEmptyComponent,
  ListHeaderComponent,
  onExpandedValuesChange,
  onRemoveModel,
  onScrollBeginDrag,
  provider,
  removingIds,
}: {
  displayedExpandedValues: string[];
  groups: ProviderModelGroup[];
  isDefaultModel: (model: Model) => boolean;
  ListEmptyComponent?: ReactElement;
  ListHeaderComponent?: ReactElement;
  onExpandedValuesChange: (values: string[]) => void;
  onRemoveModel: (model: Model) => void;
  onScrollBeginDrag?: () => void;
  provider: Provider | undefined;
  removingIds: ReadonlySet<UniqueModelId>;
}) {
  const { t } = useTranslation();
  const expandedGroupNames = useMemo(
    () => new Set(displayedExpandedValues),
    [displayedExpandedValues],
  );
  const listItems = useMemo(
    () => buildProviderModelListItems(groups, expandedGroupNames),
    [expandedGroupNames, groups],
  );
  const extraData = useMemo<ProviderModelAccordionExtraData>(
    () => ({
      expandedGroupNames,
      isDefaultModel,
      onRemoveModel,
      provider,
      removingIds,
    }),
    [expandedGroupNames, isDefaultModel, onRemoveModel, provider, removingIds],
  );

  const handleToggleGroup = useCallback(
    (groupName: string) => {
      const nextValues = expandedGroupNames.has(groupName)
        ? displayedExpandedValues.filter((value) => value !== groupName)
        : [...displayedExpandedValues, groupName];
      onExpandedValuesChange(nextValues);
    },
    [displayedExpandedValues, expandedGroupNames, onExpandedValuesChange],
  );
  const renderItem = useCallback(
    ({ extraData: itemExtraData, item }: LegendListRenderItemProps<ProviderModelListItem>) => {
      if (item.type === 'group') {
        const isExpanded = itemExtraData.expandedGroupNames.has(item.group.groupName);
        return (
          <ModelGroupHeader
            count={item.group.models.length}
            groupName={item.group.groupName}
            isExpanded={isExpanded}
            isFirst={item.isFirst}
            isLast={item.isLast}
            label={getModelGroupLabel(item.group.groupName, t)}
            onToggle={handleToggleGroup}
          />
        );
      }

      return (
        <ModelRow
          canRemove={!itemExtraData.isDefaultModel(item.model)}
          isFirst={item.isFirst}
          isLast={item.isLast}
          isRemoving={itemExtraData.removingIds.has(item.model.id)}
          model={item.model}
          provider={itemExtraData.provider}
          onRemove={itemExtraData.onRemoveModel}
        />
      );
    },
    [handleToggleGroup, t],
  );
  const keyExtractor = useCallback((item: ProviderModelListItem) => {
    return item.type === 'group' ? `group:${item.group.groupName}` : `model:${item.model.id}`;
  }, []);
  const getItemType = useCallback((item: ProviderModelListItem) => item.type, []);
  const getFixedItemSize = useCallback((item: ProviderModelListItem) => {
    const rowHeight = item.type === 'group' ? groupHeaderHeight : providerModelRowHeight;
    return item.isFirst ? rowHeight : rowHeight + separatorHeight;
  }, []);

  return (
    <LegendList
      automaticallyAdjustsScrollIndicatorInsets
      contentContainerStyle={styles.contentContainer}
      contentInsetAdjustmentBehavior="automatic"
      data={listItems}
      estimatedItemSize={providerModelRowHeight}
      extraData={extraData}
      getFixedItemSize={getFixedItemSize}
      getItemType={getItemType}
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

function buildProviderModelListItems(
  groups: ProviderModelGroup[],
  expandedGroupNames: Set<string>,
): ProviderModelListItem[] {
  const rows: ProviderModelListEntry[] = [];

  for (const group of groups) {
    rows.push({ group, type: 'group' });

    if (expandedGroupNames.has(group.groupName)) {
      rows.push(...group.models.map((model) => ({ model, type: 'model' as const })));
    }
  }

  return rows.map((row, index) => ({
    ...row,
    isFirst: index === 0,
    isLast: index === rows.length - 1,
  }));
}

const ModelGroupHeader = memo(function ModelGroupHeader({
  count,
  groupName,
  isExpanded,
  isFirst,
  isLast,
  label,
  onToggle,
}: {
  count: number;
  groupName: string;
  isExpanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  label: string;
  onToggle: (groupName: string) => void;
}) {
  const handlePress = useCallback(() => {
    onToggle(groupName);
  }, [groupName, onToggle]);

  return (
    <SettingsGroupedSurface className="mx-4" isFirst={isFirst} isLast={isLast}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        className="flex-row items-center gap-2 px-4 active:opacity-60"
        onPress={handlePress}
        style={styles.groupHeader}
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="font-medium text-default-foreground text-sm" numberOfLines={1}>
            {label}
          </Text>
          <Text className="text-default-foreground text-sm">{count}</Text>
        </View>
        <View className={isExpanded ? 'rotate-90' : undefined}>
          <ChevronRightIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </View>
      </Pressable>
    </SettingsGroupedSurface>
  );
});

const ModelRow = memo(function ModelRow({
  canRemove,
  isFirst,
  isLast,
  isRemoving,
  model,
  onRemove,
  provider,
}: {
  canRemove: boolean;
  isFirst: boolean;
  isLast: boolean;
  isRemoving: boolean;
  model: Model;
  onRemove: (model: Model) => void;
  provider: Provider | undefined;
}) {
  const { t } = useTranslation();
  const handleRemove = useCallback(() => {
    onRemove(model);
  }, [model, onRemove]);

  return (
    <ProviderModelRow
      isFirst={isFirst}
      isLast={isLast}
      model={model}
      provider={provider}
      surfaceClassName="mx-4"
    >
      {/* The pull screen's `-`, doing the same thing from the other side: one
          tap, no dialog, and the pull itself is the way back. */}
      <Pressable
        accessibilityLabel={t('settings.provider.models.remove')}
        accessibilityRole="button"
        accessibilityState={{ busy: isRemoving, disabled: !canRemove || isRemoving }}
        className="size-7 shrink-0 items-center justify-center rounded-lg active:opacity-60 disabled:opacity-40"
        disabled={!canRemove || isRemoving}
        hitSlop={6}
        onPress={handleRemove}
      >
        <MinusIcon className="size-4 text-danger" strokeWidth={2} />
      </Pressable>
    </ProviderModelRow>
  );
});

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 96,
  },
  groupHeader: {
    height: groupHeaderHeight,
  },
  list: {
    flex: 1,
  },
});
