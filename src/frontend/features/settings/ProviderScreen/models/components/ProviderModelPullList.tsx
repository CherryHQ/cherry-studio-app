import { SearchField, Section } from '@cherrystudio/ui/components';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { memo, type ReactNode, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  buildProviderModelPullListItems,
  filterProviderModelPullPreview,
  type ProviderModelPullListItem,
  type ProviderModelPullPreview,
  type ProviderModelPullSectionKey,
} from '../utils/providerModelPullPreview';
import {
  filterModelsByProviderModelType,
  getProviderModelTypeCounts,
  type ProviderModelTypeFilter,
} from '../utils/providerModelTypeFilter';
import { ProviderModelRow, providerModelRowEstimatedHeight } from './ProviderModelRow';
import { ProviderModelSearchControls } from './ProviderModelSearchControls/ProviderModelSearchControls';
import { ProviderModelTypeFilterBar } from './ProviderModelTypeFilterBar';

type PullTranslator = ReturnType<typeof useTranslation>['t'];

type ProviderModelPullListExtraData = {
  displayedPreview: ProviderModelPullPreview;
  isDisabled: boolean;
  isSelected: (section: ProviderModelPullSectionKey, id: UniqueModelId) => boolean;
  onToggleAll: (section: ProviderModelPullSectionKey, ids: readonly UniqueModelId[]) => void;
  onToggleModel: (section: ProviderModelPullSectionKey, id: UniqueModelId) => void;
  provider: Provider | undefined;
  t: PullTranslator;
};

export type ProviderModelPullListRenderState = {
  displayedIds: readonly UniqueModelId[];
};

/**
 * The model-catalog interaction shared by the settings pull screen and the
 * provider configuration approval sheet. Its selection is section-aware so
 * callers can either keep one combined set or separate additions and removals.
 */
export function ProviderModelPullList({
  contentBottomInset = 96,
  footerContent,
  headerContent,
  isDisabled,
  isSelected,
  onToggleAll,
  onToggleModel,
  preview,
  provider,
  renderAccessory,
  searchFieldPlacement = 'automatic',
}: {
  contentBottomInset?: number;
  footerContent?: ReactNode;
  headerContent?: ReactNode;
  isDisabled: boolean;
  isSelected: (section: ProviderModelPullSectionKey, id: UniqueModelId) => boolean;
  onToggleAll: (section: ProviderModelPullSectionKey, ids: readonly UniqueModelId[]) => void;
  onToggleModel: (section: ProviderModelPullSectionKey, id: UniqueModelId) => void;
  preview: ProviderModelPullPreview;
  provider: Provider | undefined;
  renderAccessory?: (state: ProviderModelPullListRenderState) => ReactNode;
  searchFieldPlacement?: 'automatic' | 'inline';
}) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [typeFilter, setTypeFilter] = useState<ProviderModelTypeFilter>('all');
  const searchedPreview = useMemo(
    () => filterProviderModelPullPreview(preview, deferredSearchText),
    [deferredSearchText, preview],
  );
  const displayedPreview = useMemo(
    () => ({
      added: filterModelsByProviderModelType(searchedPreview.added, typeFilter),
      missing: filterModelsByProviderModelType(searchedPreview.missing, typeFilter),
    }),
    [searchedPreview, typeFilter],
  );
  const typeCounts = useMemo(
    () => getProviderModelTypeCounts([...searchedPreview.added, ...searchedPreview.missing]),
    [searchedPreview],
  );
  const listItems = useMemo(
    () => buildProviderModelPullListItems(displayedPreview, ['added', 'missing']),
    [displayedPreview],
  );
  const listExtraData = useMemo<ProviderModelPullListExtraData>(
    () => ({
      displayedPreview,
      isDisabled,
      isSelected,
      onToggleAll,
      onToggleModel,
      provider,
      t,
    }),
    [displayedPreview, isDisabled, isSelected, onToggleAll, onToggleModel, provider, t],
  );
  const displayedIds = useMemo(
    () => [...displayedPreview.added, ...displayedPreview.missing].map((model) => model.id),
    [displayedPreview],
  );
  const listContentStyle = useMemo(
    () => ({ paddingBottom: contentBottomInset }),
    [contentBottomInset],
  );
  const filterBar = (
    <ProviderModelTypeFilterBar
      counts={typeCounts}
      selectedFilter={typeFilter}
      onSelect={setTypeFilter}
    />
  );

  return (
    <>
      <LegendList
        alwaysBounceVertical={false}
        contentContainerStyle={listContentStyle}
        contentInsetAdjustmentBehavior="automatic"
        data={listItems}
        drawDistance={320}
        estimatedItemSize={providerModelRowEstimatedHeight}
        extraData={listExtraData}
        getItemType={getPullListItemType}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={pullListKeyExtractor}
        ListEmptyComponent={
          <View className="items-center justify-center px-4 py-10">
            <Text className="text-center text-base text-foreground">
              {t('settings.provider.models.search.empty')}
            </Text>
          </View>
        }
        ListFooterComponent={
          footerContent ? <View className="px-4">{footerContent}</View> : undefined
        }
        ListHeaderComponent={
          searchFieldPlacement === 'inline' ? (
            <View className="gap-3 px-4 py-3">
              {headerContent}
              <SearchField
                accessibilityLabel={t('navigation.search')}
                clearAccessibilityLabel={t('common.clear')}
                onChangeText={setSearchText}
                onClear={() => setSearchText('')}
                placeholder={t('navigation.search')}
                value={searchText}
              />
              {filterBar}
            </View>
          ) : (
            <ProviderModelSearchControls searchText={searchText} setSearchText={setSearchText}>
              {headerContent}
              {filterBar}
            </ProviderModelSearchControls>
          )
        }
        maintainVisibleContentPosition={false}
        recycleItems
        renderItem={renderPullListItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
      {renderAccessory?.({ displayedIds })}
    </>
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
  const listData = extraData as ProviderModelPullListExtraData;

  if (item.type === 'section') {
    const isAddedSection = item.section === 'added';
    const sectionModels = isAddedSection
      ? listData.displayedPreview.added
      : listData.displayedPreview.missing;
    const sectionIds = sectionModels.map((model) => model.id);
    const isSectionSelected =
      sectionIds.length > 0 && sectionIds.every((id) => listData.isSelected(item.section, id));

    return (
      <PullSectionHeader
        actionLabel={listData.t(
          isSectionSelected
            ? 'settings.provider.models.selection.deselectAll'
            : 'settings.provider.models.selection.selectAll',
        )}
        count={sectionModels.length}
        isDisabled={listData.isDisabled}
        isFirstSection={item.isFirstSection}
        title={listData.t(
          isAddedSection
            ? 'settings.provider.models.pullAddedSection'
            : 'settings.provider.models.pullMissingSection',
        )}
        onActionPress={() => listData.onToggleAll(item.section, sectionIds)}
      />
    );
  }

  return (
    <PullModelRow
      isDisabled={listData.isDisabled}
      isSelected={listData.isSelected(item.section, item.model.id)}
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
  isDisabled,
  isFirstSection,
  onActionPress,
  title,
}: {
  actionLabel: string;
  count: number;
  isDisabled: boolean;
  isFirstSection: boolean;
  onActionPress: () => void;
  title: string;
}) {
  return (
    <Section.Header
      className={isFirstSection ? 'px-4 pb-2' : 'mt-3 px-4 pb-2'}
      title={`${title} (${count})`}
    >
      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        className="shrink-0 justify-center px-1 active:opacity-60 disabled:opacity-40"
        disabled={isDisabled || count === 0}
        hitSlop={6}
        onPress={onActionPress}
      >
        <Text className="font-medium text-foreground text-sm">{actionLabel}</Text>
      </Pressable>
    </Section.Header>
  );
}

const PullModelRow = memo(function PullModelRow({
  isDisabled,
  isSelected,
  model,
  onToggleModel,
  provider,
  section,
}: {
  isDisabled: boolean;
  isSelected: boolean;
  model: Model;
  onToggleModel: (section: ProviderModelPullSectionKey, id: UniqueModelId) => void;
  provider: Provider | undefined;
  section: ProviderModelPullSectionKey;
}) {
  const handleToggle = useCallback(() => {
    onToggleModel(section, model.id);
  }, [model.id, onToggleModel, section]);

  return (
    <ProviderModelRow
      model={model}
      provider={provider}
      selection={{ isDisabled, isSelected, onToggle: handleToggle }}
      tone={section === 'missing' ? 'struck' : 'default'}
    />
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
});
