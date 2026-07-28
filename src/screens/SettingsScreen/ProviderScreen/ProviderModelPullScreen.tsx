import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Accordion } from 'heroui-native/accordion';
import { Spinner } from 'heroui-native/spinner';
import { cn } from 'heroui-native/utils';
import { MinusIcon, PlusIcon } from 'lucide-uniwind/png';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  type ProviderModelPullApplyChange,
  useProviderModelPullApply,
} from './models/hooks/useProviderModelPullApply';
import {
  buildProviderModelPullListItems,
  filterProviderModelPullPreview,
  type ProviderModelPullListItem,
  type ProviderModelPullPreview,
  type ProviderModelPullRowPosition,
  type ProviderModelPullSectionKey,
} from './models/utils/providerModelPullPreview';
import { consumeProviderModelPullPreview } from './models/utils/providerModelPullPreviewStore';

type PullTranslator = ReturnType<typeof useTranslation>['t'];

type PullListExtraData = {
  appliedIds: ReadonlySet<UniqueModelId>;
  displayedAddedCount: number;
  displayedMissingCount: number;
  displayedPreview: ProviderModelPullPreview;
  expandedSections: readonly ProviderModelPullSectionKey[];
  onSectionExpandedChange: (section: ProviderModelPullSectionKey, isExpanded: boolean) => void;
  onToggleModel: (model: Model, section: ProviderModelPullSectionKey) => void;
  onToggleSection: (models: readonly Model[], section: ProviderModelPullSectionKey) => void;
  pendingIds: ReadonlySet<UniqueModelId>;
  provider: Provider | undefined;
  t: PullTranslator;
};

// One line of text against a 32pt avatar, plus the row's vertical padding.
const pullModelEstimatedRowHeight = 48;
// Past this the capability strip starts squeezing the model name off the row.
const pullModelMaxTags = 4;

export default function ProviderModelPullScreen() {
  const { providerId, providerName, returnToConfiguration } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
    returnToConfiguration?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const [initialPreview] = useState(() =>
    providerId ? consumeProviderModelPullPreview(providerId) : null,
  );
  const loadStartedRef = useRef(Boolean(initialPreview));
  const { provider, providerQuery } = useProviderDetailSettings(providerId ?? '');
  const { applyModelChange, isPreviewLoading, loadPullPreview, preview } = useProviderModelPull({
    initialPreview,
    provider,
    providerId: providerId ?? '',
  });
  const leavePullScreen = useCallback(() => {
    if (providerId && returnToConfiguration === 'true') {
      router.replace({
        params: {
          ...(providerName ? { providerName } : {}),
          providerId,
        },
        pathname: '/settings/provider/[providerId]',
      });
      return;
    }

    router.back();
  }, [providerId, providerName, returnToConfiguration, router]);

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
        leavePullScreen();
      }
    });

    return () => {
      isActive = false;
    };
  }, [leavePullScreen, loadPullPreview, provider, providerId]);

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader title={t('settings.provider.models.pullPreviewTitle')} />
      {preview ? (
        <ProviderModelPullPreviewPage
          applyModelChange={applyModelChange}
          preview={preview}
          provider={provider}
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
  applyModelChange,
  preview,
  provider,
}: {
  applyModelChange: ProviderModelPullApplyChange;
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
  const { appliedIds, pendingIds, toggleModel, toggleSection } = useProviderModelPullApply({
    applyModelChange,
    preview,
  });
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
      appliedIds,
      displayedAddedCount,
      displayedMissingCount,
      displayedPreview,
      expandedSections,
      onSectionExpandedChange: handleSectionExpandedChange,
      onToggleModel: toggleModel,
      onToggleSection: toggleSection,
      pendingIds,
      provider,
      t,
    }),
    [
      appliedIds,
      displayedAddedCount,
      displayedMissingCount,
      displayedPreview,
      expandedSections,
      handleSectionExpandedChange,
      pendingIds,
      provider,
      t,
      toggleModel,
      toggleSection,
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
    </View>
  );
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
    const sectionModels = isAddedSection
      ? listData.displayedPreview.added
      : listData.displayedPreview.missing;
    const isEverythingApplied =
      sectionModels.length > 0 && sectionModels.every((model) => listData.appliedIds.has(model.id));

    return (
      <PullSectionHeader
        actionLabel={listData.t(
          isEverythingApplied
            ? isAddedSection
              ? 'settings.provider.models.pullRemoveAll'
              : 'settings.provider.models.pullRestoreAll'
            : isAddedSection
              ? 'settings.provider.models.pullAddAll'
              : 'settings.provider.models.pullRemoveAll',
        )}
        count={count}
        isExpanded={listData.expandedSections.includes(item.section)}
        isFirstSection={item.isFirstSection}
        section={item.section}
        title={listData.t(
          isAddedSection
            ? 'settings.provider.models.pullAddedSection'
            : 'settings.provider.models.pullMissingSection',
        )}
        onActionPress={() => listData.onToggleSection(sectionModels, item.section)}
        onExpandedChange={listData.onSectionExpandedChange}
      />
    );
  }

  return (
    <PullModelRow
      isApplied={listData.appliedIds.has(item.model.id)}
      isPending={listData.pendingIds.has(item.model.id)}
      model={item.model}
      position={item.position}
      provider={listData.provider}
      section={item.section}
      onToggleModel={listData.onToggleModel}
    />
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
  isExpanded,
  isFirstSection,
  onActionPress,
  onExpandedChange,
  section,
  title,
}: {
  actionLabel: string;
  count: number;
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
            disabled={count === 0}
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
  isApplied,
  isPending,
  model,
  onToggleModel,
  position,
  provider,
  section,
}: {
  isApplied: boolean;
  isPending: boolean;
  model: Model;
  onToggleModel: (model: Model, section: ProviderModelPullSectionKey) => void;
  position: ProviderModelPullRowPosition;
  provider: Provider | undefined;
  section: ProviderModelPullSectionKey;
}) {
  const isMissing = section === 'missing';
  const tags = useMemo(() => getPullModelTags(model), [model]);
  const handleToggle = useCallback(() => {
    onToggleModel(model, section);
  }, [model, onToggleModel, section]);
  // `added` rows start out absent and gain a model; `missing` rows start out
  // present and lose one. Either way "applied" means the tap already landed.
  const showsMinus = isMissing ? !isApplied : isApplied;
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
      accessibilityRole="button"
      accessibilityState={{ busy: isPending, disabled: isPending }}
      className={cn(
        'flex-row items-center gap-3 px-3 py-2 active:opacity-60 disabled:opacity-40',
        // Desktop tints the whole row once the model is in the provider.
        isApplied && !isMissing ? 'bg-success/10' : 'bg-settings-grouped-surface',
        (position === 'first' || position === 'only') && 'rounded-t-xl',
        (position === 'last' || position === 'only') && 'rounded-b-xl',
      )}
      disabled={isPending}
      onPress={handleToggle}
    >
      {modelPickerItem ? (
        <ModelPickerIcon item={modelPickerItem} />
      ) : (
        <PullModelFallbackIcon model={model} />
      )}
      <Text
        className={cn(
          'min-w-0 flex-1 text-sm',
          isMissing && !isApplied ? 'text-default-foreground line-through' : 'text-foreground',
        )}
        numberOfLines={1}
      >
        {model.name}
      </Text>
      {tags.length > 0 ? (
        <View className="shrink-0 flex-row items-center gap-1">
          {tags.slice(0, pullModelMaxTags).map((tag) => (
            <ModelPickerTagChip key={`${model.id}:${tag}`} tag={tag} />
          ))}
        </View>
      ) : null}
      <View className="size-7 shrink-0 items-center justify-center rounded-lg">
        {showsMinus ? (
          <MinusIcon className="size-4 text-danger" strokeWidth={2} />
        ) : (
          <PlusIcon className="size-4 text-primary" strokeWidth={2} />
        )}
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
