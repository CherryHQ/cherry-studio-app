import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { memo, type ReactElement, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getModelPickerTags,
  ModelPickerIcon,
  type ModelPickerModelItem,
  ModelPickerTagChip,
} from '@/components/modelPicker';
import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';
import { SettingsGroupedSurface } from '../../../components/SettingsGroupedSurface';

import { getModelGroupLabel, type ProviderModelGroup } from '../utils/providerModelGroups';

const groupHeaderHeight = 48;
const modelRowHeight = 56;
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

type ProviderModelRow =
  | {
      group: ProviderModelGroup;
      type: 'group';
    }
  | {
      model: Model;
      type: 'model';
    };

type ProviderModelListItem = ProviderModelRow & ProviderModelRowPlacement;

type ProviderModelAccordionExtraData = {
  expandedGroupNames: Set<string>;
  provider: Provider | undefined;
};

export function ProviderModelAccordion({
  displayedExpandedValues,
  groups,
  ListEmptyComponent,
  ListHeaderComponent,
  onExpandedValuesChange,
  onScrollBeginDrag,
  provider,
}: {
  displayedExpandedValues: string[];
  groups: ProviderModelGroup[];
  ListEmptyComponent?: ReactElement;
  ListHeaderComponent?: ReactElement;
  onExpandedValuesChange: (values: string[]) => void;
  onScrollBeginDrag?: () => void;
  provider: Provider | undefined;
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
      provider,
    }),
    [expandedGroupNames, provider],
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
          isFirst={item.isFirst}
          isLast={item.isLast}
          model={item.model}
          provider={itemExtraData.provider}
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
    const rowHeight = item.type === 'group' ? groupHeaderHeight : modelRowHeight;
    return item.isFirst ? rowHeight : rowHeight + separatorHeight;
  }, []);

  return (
    <LegendList
      automaticallyAdjustsScrollIndicatorInsets
      contentContainerStyle={styles.contentContainer}
      contentInsetAdjustmentBehavior="automatic"
      data={listItems}
      estimatedItemSize={modelRowHeight}
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
  const rows: ProviderModelRow[] = [];

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
  isFirst,
  isLast,
  model,
  provider,
}: {
  isFirst: boolean;
  isLast: boolean;
  model: Model;
  provider: Provider | undefined;
}) {
  const tags = useMemo(() => getModelPickerTags(model), [model]);
  const modelPickerItem = useMemo<ModelPickerModelItem | null>(() => {
    if (!provider) {
      return null;
    }

    return {
      isPinned: false,
      key: `${model.id}:provider-list`,
      model,
      modelId: model.id,
      modelIdentifier: model.modelId,
      provider,
      showIdentifier: model.modelId !== model.name,
    };
  }, [model, provider]);

  return (
    <SettingsGroupedSurface className="mx-4" isFirst={isFirst} isLast={isLast}>
      <Pressable
        accessibilityLabel={model.name}
        accessibilityRole="button"
        className="flex-row items-center gap-3 px-4 py-2 active:opacity-60"
        style={styles.row}
      >
        {modelPickerItem ? (
          <ModelPickerIcon item={modelPickerItem} />
        ) : (
          <ModelFallbackIcon model={model} />
        )}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="min-w-0 shrink text-base text-foreground" numberOfLines={1}>
            {model.name}
          </Text>
          <Text className="min-w-0 shrink text-default-foreground text-xs" numberOfLines={1}>
            {model.modelId}
          </Text>
        </View>
        {tags.length > 0 ? (
          <View className="min-h-5 max-w-28 shrink-0 flex-row items-center justify-end gap-1 overflow-hidden">
            {tags.slice(0, 4).map((tag) => (
              <ModelPickerTagChip key={`${model.id}:${tag}`} tag={tag} />
            ))}
          </View>
        ) : null}
      </Pressable>
    </SettingsGroupedSurface>
  );
});

function ModelFallbackIcon({ model }: { model: Model }) {
  const initial = model.name.trim().charAt(0).toUpperCase() || 'M';

  return (
    <View className="size-8 items-center justify-center rounded-full">
      <Text className="font-medium text-default-foreground text-xs">{initial}</Text>
    </View>
  );
}

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
  row: {
    height: modelRowHeight,
  },
});
