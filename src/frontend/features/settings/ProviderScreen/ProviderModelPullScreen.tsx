import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModelSearchControls } from '@/frontend/components/modelPicker';
import type { Model, UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderModelPurposeTabs } from './models/components/ProviderModelPurposeTabs';
import {
  ProviderModelRow,
  providerModelRowEstimatedHeight,
} from './models/components/ProviderModelRow';
import {
  buildProviderModelPullListItems,
  filterProviderModelPullPreview,
  type ProviderModelPullListItem,
  type ProviderModelPullPreview,
  type ProviderModelPullSectionKey,
} from './models/utils/providerModelPullPreview';
import {
  filterProviderModelsByPurpose,
  getEffectiveProviderModelPurpose,
  getProviderModelPurposeCounts,
  hasMultipleProviderModelPurposes,
  type ProviderModelPurpose,
} from './models/utils/providerModelPurpose';

type PullTranslator = ReturnType<typeof useTranslation>['t'];

type PullListExtraData = {
  displayedPreview: ProviderModelPullPreview;
  isApplying: boolean;
  onToggleAll: (ids: readonly UniqueModelId[]) => void;
  onToggleModel: (id: UniqueModelId) => void;
  provider: Provider | undefined;
  selectedIds: ReadonlySet<UniqueModelId>;
  t: PullTranslator;
};

export default function ProviderModelPullScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  if (!providerId) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <Redirect
      href={{
        params: {
          mode: 'sync',
          ...(providerName ? { providerName } : {}),
          providerId,
        },
        pathname: '/settings/provider/[providerId]/model-add',
      }}
    />
  );
}

export function ProviderModelPullPreviewContent({
  isApplying,
  preview,
  provider,
  selectedIds,
  toggleAll,
  toggleModel,
}: {
  isApplying: boolean;
  preview: ProviderModelPullPreview;
  provider: Provider | undefined;
  selectedIds: ReadonlySet<UniqueModelId>;
  toggleAll: (ids: readonly UniqueModelId[]) => void;
  toggleModel: (id: UniqueModelId) => void;
}) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [modelPurpose, setModelPurpose] = useState<ProviderModelPurpose>('all');
  const missingCount = preview.missing.length;
  const previewModels = useMemo(() => [...preview.added, ...preview.missing], [preview]);
  const modelPurposeCounts = useMemo(
    () => getProviderModelPurposeCounts(previewModels),
    [previewModels],
  );
  const effectiveModelPurpose = getEffectiveProviderModelPurpose(modelPurpose, modelPurposeCounts);
  const showsModelPurposeTabs = hasMultipleProviderModelPurposes(modelPurposeCounts);
  const searchedPreview = useMemo(
    () => filterProviderModelPullPreview(preview, deferredSearchText),
    [deferredSearchText, preview],
  );
  const displayedPreview = useMemo(
    () => ({
      added: filterProviderModelsByPurpose(searchedPreview.added, effectiveModelPurpose),
      missing: filterProviderModelsByPurpose(searchedPreview.missing, effectiveModelPurpose),
    }),
    [effectiveModelPurpose, searchedPreview],
  );
  const visibleSections = useMemo<ProviderModelPullSectionKey[]>(
    () => (missingCount > 0 ? ['added', 'missing'] : ['added']),
    [missingCount],
  );
  const listItems = useMemo(
    () => buildProviderModelPullListItems(displayedPreview, visibleSections),
    [displayedPreview, visibleSections],
  );
  const listExtraData = useMemo<PullListExtraData>(
    () => ({
      displayedPreview,
      isApplying,
      onToggleAll: toggleAll,
      onToggleModel: toggleModel,
      provider,
      selectedIds,
      t,
    }),
    [displayedPreview, isApplying, provider, selectedIds, t, toggleAll, toggleModel],
  );
  const isSearchEmpty = displayedPreview.added.length + displayedPreview.missing.length === 0;
  return (
    <LegendList
      alwaysBounceVertical={false}
      contentContainerStyle={styles.listContent}
      contentInsetAdjustmentBehavior="automatic"
      data={listItems}
      drawDistance={320}
      estimatedItemSize={providerModelRowEstimatedHeight}
      extraData={listExtraData}
      getItemType={getPullListItemType}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={pullListKeyExtractor}
      ListFooterComponent={
        isSearchEmpty ? (
          <View className="items-center justify-center px-4 py-10">
            <Text className="text-center text-base text-foreground">
              {t('settings.provider.models.search.empty')}
            </Text>
          </View>
        ) : null
      }
      ListHeaderComponent={
        <ModelSearchControls
          placeholder={t('modelPicker.searchPlaceholder')}
          searchText={searchText}
          setSearchText={setSearchText}
        >
          {showsModelPurposeTabs ? (
            <ProviderModelPurposeTabs onChange={setModelPurpose} value={effectiveModelPurpose} />
          ) : null}
        </ModelSearchControls>
      }
      maintainVisibleContentPosition={false}
      recycleItems
      renderItem={renderPullListItem}
      showsVerticalScrollIndicator={false}
      style={styles.list}
    />
  );
}

function pullListKeyExtractor(item: ProviderModelPullListItem) {
  return item.key;
}

function getPullListItemType(item: ProviderModelPullListItem) {
  // A section header is shorter than a model row, so the virtualizer sizes the
  // two separately.
  return item.type;
}

function renderPullListItem({
  extraData,
  item,
}: LegendListRenderItemProps<ProviderModelPullListItem>) {
  const listData = extraData as PullListExtraData;

  if (item.type === 'section') {
    const isAddedSection = item.section === 'added';
    const sectionModels = isAddedSection
      ? listData.displayedPreview.added
      : listData.displayedPreview.missing;
    const sectionIds = sectionModels.map((model) => model.id);
    // The two sections pull in opposite directions — one adds models, the other
    // drops them — so each keeps its own select-all beside the toolbar's.
    const isSectionSelected =
      sectionIds.length > 0 && sectionIds.every((id) => listData.selectedIds.has(id));

    return (
      <PullSectionHeader
        actionLabel={listData.t(
          isSectionSelected
            ? 'settings.provider.models.selection.deselectAll'
            : 'settings.provider.models.selection.selectAll',
        )}
        count={sectionModels.length}
        isFirstSection={item.isFirstSection}
        title={listData.t(
          isAddedSection
            ? 'settings.provider.models.pullAddedSection'
            : 'settings.provider.models.pullMissingSection',
        )}
        onActionPress={() => listData.onToggleAll(sectionIds)}
      />
    );
  }

  return (
    <PullModelRow
      isApplying={listData.isApplying}
      isSelected={listData.selectedIds.has(item.model.id)}
      model={item.model}
      provider={listData.provider}
      section={item.section}
      onToggleModel={listData.onToggleModel}
    />
  );
}

function PullSectionHeader({
  actionLabel,
  count,
  isFirstSection,
  onActionPress,
  title,
}: {
  actionLabel: string;
  count: number;
  isFirstSection: boolean;
  onActionPress: () => void;
  title: string;
}) {
  return (
    <View
      className={
        isFirstSection
          ? 'flex-row items-center gap-2 px-4 pb-2'
          : 'mt-3 flex-row items-center gap-2 px-4 pb-2'
      }
    >
      <Text className="font-medium text-foreground-tertiary text-sm">{title}</Text>
      <Text className="text-foreground-tertiary text-sm" style={styles.counter}>
        {count}
      </Text>
      <View className="flex-1" />
      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        className="shrink-0 justify-center px-1 active:opacity-60 disabled:opacity-40"
        disabled={count === 0}
        hitSlop={6}
        onPress={onActionPress}
      >
        <Text className="font-medium text-foreground text-sm">{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const PullModelRow = memo(function PullModelRow({
  isApplying,
  isSelected,
  model,
  onToggleModel,
  provider,
  section,
}: {
  isApplying: boolean;
  isSelected: boolean;
  model: Model;
  onToggleModel: (id: UniqueModelId) => void;
  provider: Provider | undefined;
  section: ProviderModelPullSectionKey;
}) {
  const handleToggle = useCallback(() => {
    onToggleModel(model.id);
  }, [model.id, onToggleModel]);

  return (
    <ProviderModelRow
      model={model}
      provider={provider}
      selection={{ isDisabled: isApplying, isSelected, onToggle: handleToggle }}
      // The provider no longer serves it, whether or not the row is ticked.
      tone={section === 'missing' ? 'struck' : 'default'}
    />
  );
});

const styles = StyleSheet.create({
  counter: {
    fontVariant: ['tabular-nums'],
  },
  list: {
    flex: 1,
  },
  // No horizontal padding: the model rows carry their own `px-4`, so an outer
  // inset would push their content twice as far in as the navigation chrome.
  listContent: {
    paddingBottom: 24,
  },
});
