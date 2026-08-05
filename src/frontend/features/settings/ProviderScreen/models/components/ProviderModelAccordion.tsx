import { Button, Section } from '@cherrystudio/ui/components';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { ChevronRightIcon, MinusIcon } from 'lucide-uniwind/png';
import { memo, type ReactElement, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SettingsGroupedSurface } from '../../../components/SettingsGroupedSurface';
import { getModelGroupLabel, type ProviderModelGroup } from '../utils/providerModelGroups';
import { ProviderModelRow, providerModelRowEstimatedHeight } from './ProviderModelRow';

/**
 * Where a row sits inside the single grouped card the list draws. Stamped onto
 * the data rather than read off `renderItem`'s `index`, which a recycled row
 * keeps from its previous position when the list shrinks — that is enough to
 * round the wrong corners and resurrect a separator above the first row.
 */
type ProviderModelRowPlacement = {
  itemKey: string;
  isFirst: boolean;
  isLast: boolean;
  previousItemKey?: string;
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
  pressedItemKey?: string;
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
  const [pressedItemKey, setPressedItemKey] = useState<string>();
  const handleItemPressedChange = useCallback((itemKey: string, isPressed: boolean) => {
    setPressedItemKey((currentKey) =>
      isPressed ? itemKey : currentKey === itemKey ? undefined : currentKey,
    );
  }, []);
  const extraData = useMemo<ProviderModelAccordionExtraData>(
    () => ({
      expandedGroupNames,
      isDefaultModel,
      onRemoveModel,
      pressedItemKey,
      provider,
      removingIds,
    }),
    [expandedGroupNames, isDefaultModel, onRemoveModel, pressedItemKey, provider, removingIds],
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
        const hideSeparator =
          itemExtraData.pressedItemKey === item.itemKey ||
          itemExtraData.pressedItemKey === item.previousItemKey;
        return (
          <ModelGroupHeader
            count={item.group.models.length}
            groupName={item.group.groupName}
            hideSeparator={hideSeparator}
            itemKey={item.itemKey}
            isExpanded={isExpanded}
            isFirst={item.isFirst}
            isLast={item.isLast}
            label={getModelGroupLabel(item.group.groupName, t)}
            onToggle={handleToggleGroup}
            onPressedChange={handleItemPressedChange}
          />
        );
      }

      return (
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
      );
    },
    [handleItemPressedChange, handleToggleGroup, t],
  );
  const keyExtractor = useCallback((item: ProviderModelListItem) => item.itemKey, []);
  const getItemType = useCallback((item: ProviderModelListItem) => item.type, []);
  return (
    <LegendList
      automaticallyAdjustsScrollIndicatorInsets
      contentContainerStyle={styles.contentContainer}
      contentInsetAdjustmentBehavior="automatic"
      data={listItems}
      estimatedItemSize={providerModelRowEstimatedHeight}
      extraData={extraData}
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
    itemKey: getProviderModelListEntryKey(row),
    isFirst: index === 0,
    isLast: index === rows.length - 1,
    previousItemKey: index > 0 ? getProviderModelListEntryKey(rows[index - 1]) : undefined,
  }));
}

function getProviderModelListEntryKey(entry: ProviderModelListEntry): string {
  return entry.type === 'group' ? `group:${entry.group.groupName}` : `model:${entry.model.id}`;
}

const ModelGroupHeader = memo(function ModelGroupHeader({
  count,
  groupName,
  hideSeparator,
  itemKey,
  isExpanded,
  isFirst,
  isLast,
  label,
  onToggle,
  onPressedChange,
}: {
  count: number;
  groupName: string;
  hideSeparator: boolean;
  itemKey: string;
  isExpanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  label: string;
  onToggle: (groupName: string) => void;
  onPressedChange: (itemKey: string, isPressed: boolean) => void;
}) {
  const handlePress = useCallback(() => {
    onToggle(groupName);
  }, [groupName, onToggle]);

  return (
    <SettingsGroupedSurface
      className="mx-4"
      hideSeparator={hideSeparator}
      isFirst={isFirst}
      isLast={isLast}
    >
      <Section.Item
        accessibilityLabel={label}
        accessibilityState={{ expanded: isExpanded }}
        label={`${label}  ${count}`}
        onPress={handlePress}
        onPressIn={() => onPressedChange(itemKey, true)}
        onPressOut={() => onPressedChange(itemKey, false)}
        showChevron={false}
        trailing={
          <View className={isExpanded ? 'rotate-90' : undefined}>
            <ChevronRightIcon className="size-5 text-muted-foreground" strokeWidth={2} />
          </View>
        }
      />
    </SettingsGroupedSurface>
  );
});

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
        icon={<MinusIcon className="text-danger" strokeWidth={2} />}
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
