import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Accordion } from 'heroui-native/accordion';
import { Button } from 'heroui-native/button';
import { Checkbox } from 'heroui-native/checkbox';
import { Spinner } from 'heroui-native/spinner';
import { cn } from 'heroui-native/utils';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/headers';
import {
  filterModelsByModelPickerTags,
  getAvailableModelPickerFilterTagsForModels,
  getModelPickerTags,
  ModelPickerIcon,
  type ModelPickerModelItem,
  type ModelPickerTag,
  ModelPickerTagChip,
} from '@/components/modelPicker';
import type { Model, UniqueModelId } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';
import { useProviderDetailSettings } from './detail';
import { ProviderModelSearchField } from './models/components/ProviderModelSearchField';
import { useProviderModelPull } from './models/hooks/useProviderModelPull';
import {
  buildProviderModelPullApplyPayload,
  buildProviderModelPullListItems,
  createDefaultProviderModelPullSelection,
  filterProviderModelPullPreview,
  type ProviderModelPullListItem,
  type ProviderModelPullPreview,
  type ProviderModelPullRowPosition,
  type ProviderModelPullSectionKey,
  type ProviderModelPullSelection,
} from './models/utils/providerModelPullPreview';
import { consumeProviderModelPullPreview } from './models/utils/providerModelPullPreviewStore';

type ProviderModelPullSelectionOverride = ProviderModelPullSelection & {
  previewKey: string;
};

type PullTranslator = ReturnType<typeof useTranslation>['t'];

type PullListExtraData = {
  allDisplayedAddedSelected: boolean;
  allDisplayedMissingSelected: boolean;
  displayedAddedCount: number;
  displayedMissingCount: number;
  expandedSections: readonly ProviderModelPullSectionKey[];
  isApplying: boolean;
  onSectionExpandedChange: (section: ProviderModelPullSectionKey, isExpanded: boolean) => void;
  onToggleAddedModel: (modelId: UniqueModelId) => void;
  onToggleAllAdded: () => void;
  onToggleAllMissing: () => void;
  onToggleMissingModel: (modelId: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedAddedIds: Set<UniqueModelId>;
  selectedMissingIds: Set<UniqueModelId>;
  t: PullTranslator;
};

const pullModelEstimatedRowHeight = 58;

export default function ProviderModelPullScreen() {
  const { providerId } = useLocalSearchParams<{ providerId?: string; providerName?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const [initialPreview] = useState(() =>
    providerId ? consumeProviderModelPullPreview(providerId) : null,
  );
  const loadStartedRef = useRef(Boolean(initialPreview));
  const { provider, providerQuery } = useProviderDetailSettings(providerId ?? '');
  const { applyPullPreview, isApplying, isPreviewLoading, loadPullPreview, preview } =
    useProviderModelPull({
      initialPreview,
      provider,
      providerId: providerId ?? '',
    });

  useEffect(() => {
    if (!provider || !providerId || loadStartedRef.current) {
      return;
    }

    let isActive = true;
    loadStartedRef.current = true;
    void loadPullPreview().then((result) => {
      if (!isActive) {
        return;
      }

      if (result !== 'ready') {
        router.back();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadPullPreview, provider, providerId, router]);

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader title={t('settings.provider.models.pullPreviewTitle')} />
      {preview ? (
        <ProviderModelPullPreviewPage
          isApplying={isApplying}
          preview={preview}
          provider={provider}
          onApply={async (payload) => {
            const didApply = await applyPullPreview(payload);
            if (didApply) {
              router.back();
            }
          }}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-3 px-4">
          <Spinner />
          <Text className="text-base text-default-foreground">
            {isPreviewLoading || providerQuery.isPending
              ? t('settings.provider.models.loading')
              : t('settings.provider.models.pull')}
          </Text>
        </View>
      )}
    </>
  );
}

function ProviderModelPullPreviewPage({
  isApplying,
  onApply,
  preview,
  provider,
}: {
  isApplying: boolean;
  onApply: (
    payload: NonNullable<ReturnType<typeof buildProviderModelPullApplyPayload>>,
  ) => Promise<void> | void;
  preview: ProviderModelPullPreview;
  provider: Provider | undefined;
}) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [expandedSections, setExpandedSections] = useState<ProviderModelPullSectionKey[]>([
    'added',
    'missing',
  ]);
  const [applyingSection, setApplyingSection] = useState<ProviderModelPullSectionKey | null>(null);
  const [selectedFilterTags, setSelectedFilterTags] = useState<ModelPickerTag[]>([]);
  const missingCount = preview.missing.length;
  const searchedPreview = useMemo(
    () => filterProviderModelPullPreview(preview, deferredSearchText),
    [deferredSearchText, preview],
  );
  const displayedPreview = useMemo(
    () => ({
      added: filterModelsByModelPickerTags(searchedPreview.added, selectedFilterTags),
      missing: filterModelsByModelPickerTags(searchedPreview.missing, selectedFilterTags),
    }),
    [searchedPreview, selectedFilterTags],
  );
  const availableFilterTags = useMemo(
    () => getAvailableModelPickerFilterTagsForModels([...preview.added, ...preview.missing]),
    [preview],
  );
  const {
    selectedAddedIds,
    selectedMissingIds,
    toggleAddedSelection,
    toggleAllAdded,
    toggleAllMissing,
    toggleMissingSelection,
  } = useProviderModelPullSelection({ displayedPreview, preview });
  const displayedAddedCount = displayedPreview.added.length;
  const displayedMissingCount = displayedPreview.missing.length;
  const visibleSections = useMemo<ProviderModelPullSectionKey[]>(
    () => (missingCount > 0 ? ['added', 'missing'] : ['added']),
    [missingCount],
  );
  const listItems = useMemo(
    () => buildProviderModelPullListItems(displayedPreview, expandedSections, visibleSections),
    [displayedPreview, expandedSections, visibleSections],
  );
  const applySection = useCallback(
    async (section: ProviderModelPullSectionKey) => {
      const isAddedSection = section === 'added';
      const payload = buildProviderModelPullApplyPayload(preview, {
        addedIds: isAddedSection ? selectedAddedIds : new Set<UniqueModelId>(),
        missingIds: isAddedSection ? new Set<UniqueModelId>() : selectedMissingIds,
      });
      if (!payload) {
        return;
      }

      setApplyingSection(section);
      await Promise.resolve(onApply(payload)).finally(() => setApplyingSection(null));
    },
    [onApply, preview, selectedAddedIds, selectedMissingIds],
  );
  const handleAddModels = useCallback(() => {
    void applySection('added');
  }, [applySection]);
  const handleCleanMissingModels = useCallback(() => {
    void applySection('missing');
  }, [applySection]);
  const handleSectionExpandedChange = useCallback(
    (section: ProviderModelPullSectionKey, isExpanded: boolean) => {
      setExpandedSections((current) => {
        if (isExpanded) {
          return current.includes(section) ? current : [...current, section];
        }

        return current.filter((item) => item !== section);
      });
    },
    [],
  );
  const toggleFilterTag = useCallback((tag: ModelPickerTag) => {
    setSelectedFilterTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  }, []);
  const listExtraData = useMemo<PullListExtraData>(
    () => ({
      allDisplayedAddedSelected: areAllModelsSelected(displayedPreview.added, selectedAddedIds),
      allDisplayedMissingSelected: areAllModelsSelected(
        displayedPreview.missing,
        selectedMissingIds,
      ),
      displayedAddedCount,
      displayedMissingCount,
      expandedSections,
      isApplying,
      onSectionExpandedChange: handleSectionExpandedChange,
      onToggleAddedModel: toggleAddedSelection,
      onToggleAllAdded: toggleAllAdded,
      onToggleAllMissing: toggleAllMissing,
      onToggleMissingModel: toggleMissingSelection,
      provider,
      selectedAddedIds,
      selectedMissingIds,
      t,
    }),
    [
      displayedAddedCount,
      displayedMissingCount,
      displayedPreview,
      expandedSections,
      handleSectionExpandedChange,
      isApplying,
      provider,
      selectedAddedIds,
      selectedMissingIds,
      t,
      toggleAddedSelection,
      toggleAllAdded,
      toggleAllMissing,
      toggleMissingSelection,
    ],
  );
  const isSearchEmpty = displayedAddedCount + displayedMissingCount === 0;

  return (
    <View className="flex-1">
      <LegendList
        alwaysBounceVertical={false}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        data={listItems}
        drawDistance={320}
        estimatedItemSize={pullModelEstimatedRowHeight}
        extraData={listExtraData}
        getItemType={getPullListItemType}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={pullListKeyExtractor}
        ListFooterComponent={
          isSearchEmpty ? (
            <PullSearchEmptyState title={t('settings.provider.models.search.empty')} />
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-3 pb-3">
            <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
            {availableFilterTags.length > 0 ? (
              <ProviderModelPullFilterBar
                availableTags={availableFilterTags}
                selectedTags={selectedFilterTags}
                onToggleTag={toggleFilterTag}
              />
            ) : null}
          </View>
        }
        maintainVisibleContentPosition={false}
        recycleItems
        renderItem={renderPullListItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />

      <PullApplyFooter
        applyingSection={applyingSection}
        isApplying={isApplying}
        missingCount={missingCount}
        selectedAddedCount={selectedAddedIds.size}
        selectedMissingCount={selectedMissingIds.size}
        onAddModels={handleAddModels}
        onCleanMissingModels={handleCleanMissingModels}
      />
    </View>
  );
}

function useProviderModelPullSelection({
  displayedPreview,
  preview,
}: {
  displayedPreview: ProviderModelPullPreview;
  preview: ProviderModelPullPreview;
}) {
  const [selectionOverride, setSelectionOverride] =
    useState<ProviderModelPullSelectionOverride | null>(null);
  const previewKey = useMemo(() => getPreviewKey(preview), [preview]);
  const defaultSelection = useMemo(
    () => createDefaultProviderModelPullSelection(preview),
    [preview],
  );
  const selection =
    selectionOverride?.previewKey === previewKey ? selectionOverride : defaultSelection;

  const toggleAddedSelection = useCallback(
    (modelId: UniqueModelId) => {
      setSelectionOverride((current) => {
        const baseSelection = getSelectionForUpdate(current, previewKey, defaultSelection);
        return {
          ...baseSelection,
          addedIds: toggleSetItem(baseSelection.addedIds, modelId),
        };
      });
    },
    [defaultSelection, previewKey],
  );
  const toggleMissingSelection = useCallback(
    (modelId: UniqueModelId) => {
      setSelectionOverride((current) => {
        const baseSelection = getSelectionForUpdate(current, previewKey, defaultSelection);
        return {
          ...baseSelection,
          missingIds: toggleSetItem(baseSelection.missingIds, modelId),
        };
      });
    },
    [defaultSelection, previewKey],
  );
  const toggleAllAdded = useCallback(() => {
    setSelectionOverride((current) => {
      const baseSelection = getSelectionForUpdate(current, previewKey, defaultSelection);
      return {
        ...baseSelection,
        addedIds: toggleModelsSelection(baseSelection.addedIds, displayedPreview.added),
      };
    });
  }, [defaultSelection, displayedPreview.added, previewKey]);
  const toggleAllMissing = useCallback(() => {
    setSelectionOverride((current) => {
      const baseSelection = getSelectionForUpdate(current, previewKey, defaultSelection);
      return {
        ...baseSelection,
        missingIds: toggleModelsSelection(baseSelection.missingIds, displayedPreview.missing),
      };
    });
  }, [defaultSelection, displayedPreview.missing, previewKey]);

  return {
    selectedAddedIds: selection.addedIds,
    selectedMissingIds: selection.missingIds,
    toggleAddedSelection,
    toggleAllAdded,
    toggleAllMissing,
    toggleMissingSelection,
  };
}

function pullListKeyExtractor(item: ProviderModelPullListItem) {
  return item.key;
}

function getPullListItemType(item: ProviderModelPullListItem) {
  return item.type;
}

function renderPullListItem({
  extraData,
  item,
}: LegendListRenderItemProps<ProviderModelPullListItem>) {
  const listData = extraData as PullListExtraData;

  if (item.type === 'section') {
    const isAddedSection = item.section === 'added';
    const count = isAddedSection ? listData.displayedAddedCount : listData.displayedMissingCount;
    const isAllSectionSelected = isAddedSection
      ? listData.allDisplayedAddedSelected
      : listData.allDisplayedMissingSelected;

    return (
      <PullSectionHeader
        actionLabel={listData.t(
          isAllSectionSelected
            ? 'settings.provider.models.pullDeselectAll'
            : 'settings.provider.models.pullSelectAll',
        )}
        count={count}
        isApplying={listData.isApplying}
        isExpanded={listData.expandedSections.includes(item.section)}
        isFirstSection={item.isFirstSection}
        section={item.section}
        title={listData.t(
          isAddedSection
            ? 'settings.provider.models.pullAddedSection'
            : 'settings.provider.models.pullMissingSection',
        )}
        onActionPress={isAddedSection ? listData.onToggleAllAdded : listData.onToggleAllMissing}
        onExpandedChange={listData.onSectionExpandedChange}
      />
    );
  }

  const isAddedSection = item.section === 'added';
  const selectedIds = isAddedSection ? listData.selectedAddedIds : listData.selectedMissingIds;

  return (
    <PullModelRow
      isDisabled={listData.isApplying}
      isSelected={selectedIds.has(item.model.id)}
      model={item.model}
      position={item.position}
      provider={listData.provider}
      section={item.section}
      onToggleModel={isAddedSection ? listData.onToggleAddedModel : listData.onToggleMissingModel}
    />
  );
}

function PullApplyFooter({
  applyingSection,
  isApplying,
  missingCount,
  onAddModels,
  onCleanMissingModels,
  selectedAddedCount,
  selectedMissingCount,
}: {
  applyingSection: ProviderModelPullSectionKey | null;
  isApplying: boolean;
  missingCount: number;
  onAddModels: () => void;
  onCleanMissingModels: () => void;
  selectedAddedCount: number;
  selectedMissingCount: number;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row gap-2 border-border border-t px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      {missingCount > 0 ? (
        <Button
          className="h-10 min-h-0 flex-1 rounded-xl"
          isDisabled={isApplying || selectedMissingCount === 0}
          variant="danger-soft"
          onPress={onCleanMissingModels}
        >
          <View className="min-w-0 flex-row items-center justify-center gap-2">
            {applyingSection === 'missing' ? <Spinner size="sm" /> : null}
            <Text className="font-medium text-danger text-sm" numberOfLines={1}>
              {t('settings.provider.models.pullCleanMissing', {
                count: selectedMissingCount,
              })}
            </Text>
          </View>
        </Button>
      ) : null}
      <Button
        className="h-10 min-h-0 flex-1 rounded-xl"
        isDisabled={isApplying || selectedAddedCount === 0}
        variant="primary"
        onPress={onAddModels}
      >
        <View className="min-w-0 flex-row items-center justify-center gap-2">
          {applyingSection === 'added' ? <Spinner size="sm" /> : null}
          <Text className="font-medium text-sm text-white" numberOfLines={1}>
            {t('settings.provider.models.pullAddSelected', { count: selectedAddedCount })}
          </Text>
        </View>
      </Button>
    </View>
  );
}

type PullFilterBarExtraData = {
  onToggleTag: (tag: ModelPickerTag) => void;
  selectedTags: ReadonlySet<ModelPickerTag>;
};

function filterTagKeyExtractor(tag: ModelPickerTag) {
  return tag;
}

function renderPullFilterTag({ extraData, item }: LegendListRenderItemProps<ModelPickerTag>) {
  const { onToggleTag, selectedTags } = extraData as PullFilterBarExtraData;

  return (
    <ModelPickerTagChip
      isActive={selectedTags.has(item)}
      showLabel
      size="md"
      tag={item}
      onPress={() => onToggleTag(item)}
    />
  );
}

function PullFilterTagSeparator() {
  return <View className="w-2" />;
}

function ProviderModelPullFilterBar({
  availableTags,
  onToggleTag,
  selectedTags,
}: {
  availableTags: readonly ModelPickerTag[];
  onToggleTag: (tag: ModelPickerTag) => void;
  selectedTags: readonly ModelPickerTag[];
}) {
  const selectedTagSet = useMemo(() => new Set(selectedTags), [selectedTags]);
  const extraData = useMemo<PullFilterBarExtraData>(
    () => ({ onToggleTag, selectedTags: selectedTagSet }),
    [onToggleTag, selectedTagSet],
  );

  return (
    <LegendList
      data={availableTags}
      extraData={extraData}
      horizontal
      ItemSeparatorComponent={PullFilterTagSeparator}
      keyboardShouldPersistTaps="handled"
      keyExtractor={filterTagKeyExtractor}
      recycleItems
      renderItem={renderPullFilterTag}
      showsHorizontalScrollIndicator={false}
      style={styles.filterBar}
    />
  );
}

function PullSearchEmptyState({ title }: { title: string }) {
  return (
    <View className="items-center justify-center px-4 py-10">
      <Text className="text-center text-base text-default-foreground">{title}</Text>
    </View>
  );
}

function PullSectionHeader({
  actionLabel,
  count,
  isApplying,
  isExpanded,
  isFirstSection,
  onActionPress,
  onExpandedChange,
  section,
  title,
}: {
  actionLabel: string;
  count: number;
  isApplying: boolean;
  isExpanded: boolean;
  isFirstSection: boolean;
  onActionPress: () => void;
  onExpandedChange: (section: ProviderModelPullSectionKey, isExpanded: boolean) => void;
  section: ProviderModelPullSectionKey;
  title: string;
}) {
  return (
    <Accordion
      animation={false}
      className={cn('w-full', !isFirstSection && 'pt-3')}
      hideSeparator
      isCollapsible
      isDisabled={isApplying}
      selectionMode="single"
      value={isExpanded ? section : undefined}
      onValueChange={(value: string | undefined) => onExpandedChange(section, value === section)}
    >
      <Accordion.Item value={section}>
        <View className="relative min-h-11 w-full">
          <Accordion.Trigger className="min-h-11 w-full px-1 py-2 pr-32">
            <View className="min-w-0 flex-1">
              <Text className="font-medium text-default-foreground text-sm" numberOfLines={1}>
                {title} ({count})
              </Text>
            </View>
            <Accordion.Indicator className="absolute right-1" iconProps={{ size: 18 }} />
          </Accordion.Trigger>
          <Pressable
            accessibilityLabel={actionLabel}
            accessibilityRole="button"
            className="absolute top-0 right-9 bottom-0 z-10 justify-center px-1 active:opacity-60 disabled:opacity-40"
            disabled={isApplying || count === 0}
            hitSlop={6}
            onPress={onActionPress}
          >
            <Text className="font-medium text-accent text-sm">{actionLabel}</Text>
          </Pressable>
        </View>
      </Accordion.Item>
    </Accordion>
  );
}

const PullModelRow = memo(function PullModelRow({
  isDisabled,
  isSelected,
  model,
  onToggleModel,
  position,
  provider,
  section,
}: {
  isDisabled: boolean;
  isSelected: boolean;
  model: Model;
  onToggleModel: (modelId: UniqueModelId) => void;
  position: ProviderModelPullRowPosition;
  provider: Provider | undefined;
  section: ProviderModelPullSectionKey;
}) {
  const isMissing = section === 'missing';
  const tags = useMemo(() => getPullModelTags(model), [model]);
  const handleToggle = useCallback(() => {
    onToggleModel(model.id);
  }, [model.id, onToggleModel]);
  const modelPickerItem = useMemo<ModelPickerModelItem | null>(() => {
    if (!provider) {
      return null;
    }

    return {
      isPinned: false,
      key: `${model.id}:pull`,
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
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      className={cn(
        'flex-row items-center gap-3 bg-settings-grouped-surface px-3 py-2 active:opacity-60 disabled:opacity-40',
        (position === 'first' || position === 'only') && 'rounded-t-xl',
        (position === 'last' || position === 'only') && 'rounded-b-xl',
      )}
      disabled={isDisabled}
      onPress={handleToggle}
    >
      {modelPickerItem ? (
        <ModelPickerIcon item={modelPickerItem} />
      ) : (
        <PullModelFallbackIcon model={model} />
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            'min-w-0 shrink text-base',
            isMissing ? 'text-default-foreground line-through' : 'text-foreground',
          )}
          numberOfLines={1}
        >
          {model.name}
        </Text>
        <Text
          className={cn(
            'min-w-0 shrink text-default-foreground text-xs',
            isMissing ? 'line-through' : null,
          )}
          numberOfLines={1}
        >
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
      <View className="size-8 items-center justify-center">
        <Checkbox
          isDisabled={isDisabled}
          isSelected={isSelected}
          variant="secondary"
          onPress={(event) => event.stopPropagation()}
          onSelectedChange={handleToggle}
        />
      </View>
    </Pressable>
  );
});

function PullModelFallbackIcon({ model }: { model: Model }) {
  const initial = model.name.trim().charAt(0).toUpperCase() || 'M';

  return (
    <View className="size-8 items-center justify-center rounded-full">
      <Text className="font-medium text-default-foreground text-xs">{initial}</Text>
    </View>
  );
}

function getPullModelTags(model: Model): ModelPickerTag[] {
  const tags = getModelPickerTags(model);
  return isFreePullModel(model) && !tags.includes('free') ? [...tags, 'free'] : tags;
}

function isFreePullModel(model: Model) {
  return [model.id, model.modelId, model.name, model.presetModelId]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes('free');
}

function toggleSetItem<TItem>(items: Set<TItem>, item: TItem): Set<TItem> {
  const next = new Set(items);
  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}

function areAllModelsSelected(
  models: readonly Model[],
  selectedIds: ReadonlySet<UniqueModelId>,
): boolean {
  return models.length > 0 && models.every((model) => selectedIds.has(model.id));
}

function toggleModelsSelection(
  selectedIds: Set<UniqueModelId>,
  models: readonly Model[],
): Set<UniqueModelId> {
  const next = new Set(selectedIds);
  const shouldDeselect = areAllModelsSelected(models, selectedIds);

  for (const model of models) {
    if (shouldDeselect) {
      next.delete(model.id);
    } else {
      next.add(model.id);
    }
  }

  return next;
}

function getPreviewKey(preview: ProviderModelPullPreview): string {
  return [
    ...preview.added.map((model) => `added:${model.id}`),
    ...preview.missing.map((model) => `missing:${model.id}`),
  ].join('|');
}

function getSelectionForUpdate(
  current: ProviderModelPullSelectionOverride | null,
  previewKey: string,
  fallback: ProviderModelPullSelection,
): ProviderModelPullSelectionOverride {
  if (current?.previewKey === previewKey) {
    return current;
  }

  return {
    ...fallback,
    previewKey,
  };
}

const styles = StyleSheet.create({
  filterBar: {
    height: 32,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
});
