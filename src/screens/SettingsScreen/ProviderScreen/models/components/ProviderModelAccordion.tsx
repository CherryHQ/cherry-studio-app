import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { cn } from 'heroui-native/utils';
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

import { getModelGroupLabel, type ProviderModelGroup } from '../utils/providerModelGroups';

const groupHeaderHeight = 48;
const modelRowHeight = 56;

type ProviderModelListItem =
  | {
      group: ProviderModelGroup;
      type: 'group';
    }
  | {
      model: Model;
      type: 'model';
    };

type ProviderModelAccordionExtraData = {
  expandedGroupNames: Set<string>;
  provider: Provider | undefined;
};

export function ProviderModelAccordion({
  displayedExpandedValues,
  emptyTitle,
  groups,
  ListHeaderComponent,
  onExpandedValuesChange,
  onScrollBeginDrag,
  provider,
}: {
  displayedExpandedValues: string[];
  emptyTitle?: string;
  groups: ProviderModelGroup[];
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
    ({
      data,
      extraData: itemExtraData,
      index,
      item,
    }: LegendListRenderItemProps<ProviderModelListItem>) => {
      const surfaceRadiusClassName = getSurfaceRadiusClassName(index, data.length);

      if (item.type === 'group') {
        const isExpanded = itemExtraData.expandedGroupNames.has(item.group.groupName);
        return (
          <ModelGroupHeader
            count={item.group.models.length}
            groupName={item.group.groupName}
            isExpanded={isExpanded}
            label={getModelGroupLabel(item.group.groupName, t)}
            surfaceRadiusClassName={surfaceRadiusClassName}
            onToggle={handleToggleGroup}
          />
        );
      }

      return (
        <ModelRow
          model={item.model}
          provider={itemExtraData.provider}
          surfaceRadiusClassName={surfaceRadiusClassName}
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
    return item.type === 'group' ? groupHeaderHeight : modelRowHeight;
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
      ListEmptyComponent={<ProviderModelEmptyState title={emptyTitle} />}
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
  const items: ProviderModelListItem[] = [];

  for (const group of groups) {
    items.push({ group, type: 'group' });

    if (expandedGroupNames.has(group.groupName)) {
      items.push(...group.models.map((model) => ({ model, type: 'model' as const })));
    }
  }

  return items;
}

const ModelGroupHeader = memo(function ModelGroupHeader({
  count,
  groupName,
  isExpanded,
  label,
  onToggle,
  surfaceRadiusClassName,
}: {
  count: number;
  groupName: string;
  isExpanded: boolean;
  label: string;
  onToggle: (groupName: string) => void;
  surfaceRadiusClassName: string;
}) {
  const handlePress = useCallback(() => {
    onToggle(groupName);
  }, [groupName, onToggle]);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      className={cn(
        'mx-4 flex-row items-center gap-2 bg-settings-grouped-surface px-3 active:opacity-60',
        surfaceRadiusClassName,
      )}
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
  );
});

const ModelRow = memo(function ModelRow({
  model,
  provider,
  surfaceRadiusClassName,
}: {
  model: Model;
  provider: Provider | undefined;
  surfaceRadiusClassName: string;
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
    <Pressable
      accessibilityLabel={model.name}
      accessibilityRole="button"
      className={cn(
        'mx-4 flex-row items-center gap-3 bg-settings-grouped-surface px-3 py-2 active:opacity-60',
        surfaceRadiusClassName,
      )}
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
  );
});

function ProviderModelEmptyState({ title }: { title: string | undefined }) {
  if (!title) {
    return null;
  }

  return (
    <View className="mx-4 min-h-12 justify-center rounded-2xl bg-settings-grouped-surface px-4 py-4">
      <Text className="text-base text-default-foreground">{title}</Text>
    </View>
  );
}

function ModelFallbackIcon({ model }: { model: Model }) {
  const initial = model.name.trim().charAt(0).toUpperCase() || 'M';

  return (
    <View className="size-8 items-center justify-center rounded-full">
      <Text className="font-medium text-default-foreground text-xs">{initial}</Text>
    </View>
  );
}

function getSurfaceRadiusClassName(index: number, total: number): string {
  if (total <= 1) {
    return 'rounded-xl';
  }

  if (index === 0) {
    return 'rounded-t-xl';
  }

  if (index === total - 1) {
    return 'rounded-b-xl';
  }

  return '';
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 24,
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
