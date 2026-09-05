import { Button } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import {
  readProviderSetupReturnTo,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';
import { ModelSearchControls, useModelSettingSelections } from '@/frontend/components/ModelPicker';
import type { Model, UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderModelPurposeTabs } from '../../models/components/ProviderModelPurposeTabs';
import {
  ProviderModelRow,
  providerModelRowEstimatedHeights,
} from '../../models/components/ProviderModelRow';
import {
  buildProviderModelPullListItems,
  filterProviderModelPullPreview,
  type ProviderModelPullListItem,
  type ProviderModelPullPreview,
  type ProviderModelPullSectionKey,
} from '../../models/utils/providerModelPullPreview';
import {
  filterProviderModelsByPurpose,
  getEffectiveProviderModelPurpose,
  getProviderModelPurposeCounts,
  hasMultipleProviderModelPurposes,
  type ProviderModelPurpose,
} from '../../models/utils/providerModelPurpose';

type PullSectionMap<T> = Record<ProviderModelPullSectionKey, T>;

type PullListExtraData = {
  protectedIds: ReadonlySet<string>;
  isApplying: boolean;
  onToggleAll: (ids: readonly UniqueModelId[]) => void;
  onToggleModel: (id: UniqueModelId) => void;
  provider: Provider | undefined;
  sectionCounts: PullSectionMap<number>;
  sectionIds: PullSectionMap<readonly UniqueModelId[]>;
  sectionSelectedAll: PullSectionMap<boolean>;
  selectedIds: ReadonlySet<UniqueModelId>;
};

export default function ProviderModelPullScreen() {
  const {
    providerId,
    providerName,
    returnTo: rawReturnTo,
  } = useLocalSearchParams<
    ProviderSetupRouteParamsInput & {
      providerId?: string;
      providerName?: string;
    }
  >();
  const returnTo = readProviderSetupReturnTo(rawReturnTo);
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
          ...(returnTo ? { returnTo } : {}),
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
  const { selections } = useModelSettingSelections();
  const protectedIds = useMemo(
    () => new Set(Object.values(selections).filter((id): id is UniqueModelId => id !== null)),
    [selections],
  );
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
  // Held here rather than rebuilt inside the section header: `extraData` turns
  // over on every tick, so a header that mapped its whole section per render
  // paid that walk once per tap, per section, for as long as the list was open.
  const sectionIds = useMemo<PullSectionMap<readonly UniqueModelId[]>>(
    () => ({
      added: displayedPreview.added.map((model) => model.id),
      missing: displayedPreview.missing
        .filter((model) => !protectedIds.has(model.id))
        .map((model) => model.id),
    }),
    [displayedPreview, protectedIds],
  );
  const sectionSelectedAll = useMemo<PullSectionMap<boolean>>(
    () => ({
      added: isEverySelected(sectionIds.added, selectedIds),
      missing: isEverySelected(sectionIds.missing, selectedIds),
    }),
    [sectionIds, selectedIds],
  );
  const listExtraData = useMemo<PullListExtraData>(
    () => ({
      protectedIds,
      isApplying,
      onToggleAll: toggleAll,
      onToggleModel: toggleModel,
      provider,
      sectionCounts: {
        added: displayedPreview.added.length,
        missing: displayedPreview.missing.length,
      },
      sectionIds,
      sectionSelectedAll,
      selectedIds,
    }),
    [
      displayedPreview,
      isApplying,
      protectedIds,
      provider,
      sectionIds,
      sectionSelectedAll,
      selectedIds,
      toggleAll,
      toggleModel,
    ],
  );
  const isSearchEmpty = displayedPreview.added.length + displayedPreview.missing.length === 0;
  return (
    <LegendList
      alwaysBounceVertical={false}
      contentContainerStyle={styles.listContent}
      contentInsetAdjustmentBehavior="automatic"
      data={listItems}
      drawDistance={320}
      estimatedItemSize={providerModelRowEstimatedHeights.synchronization}
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
          onChangeText={setSearchText}
          placeholder={t('modelPicker.searchPlaceholder')}
          value={searchText}
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
    return (
      <PullSectionHeader
        count={listData.sectionCounts[item.section]}
        ids={listData.sectionIds[item.section]}
        isFirstSection={item.isFirstSection}
        isSelected={listData.sectionSelectedAll[item.section]}
        onToggleAll={listData.onToggleAll}
        section={item.section}
      />
    );
  }

  return (
    <PullModelRow
      isApplying={listData.isApplying}
      isProtected={item.section === 'missing' && listData.protectedIds.has(item.model.id)}
      isSelected={listData.selectedIds.has(item.model.id)}
      model={item.model}
      provider={listData.provider}
      section={item.section}
      onToggleModel={listData.onToggleModel}
    />
  );
}

function isEverySelected(
  ids: readonly UniqueModelId[],
  selectedIds: ReadonlySet<UniqueModelId>,
): boolean {
  return ids.length > 0 && ids.every((id) => selectedIds.has(id));
}

/**
 * Memoized on the section's own state, so ticking one row leaves both headers
 * alone unless that tick was the one that completed or broke a section.
 *
 * The two sections pull in opposite directions — one adds models, the other
 * drops them — so each owns its own select-all while the toolbar reports only
 * the total selection and commit action.
 */
const PullSectionHeader = memo(function PullSectionHeader({
  count,
  ids,
  isFirstSection,
  isSelected,
  onToggleAll,
  section,
}: {
  count: number;
  ids: readonly UniqueModelId[];
  isFirstSection: boolean;
  isSelected: boolean;
  onToggleAll: (ids: readonly UniqueModelId[]) => void;
  section: ProviderModelPullSectionKey;
}) {
  const { t } = useTranslation();
  const handleActionPress = useCallback(() => onToggleAll(ids), [ids, onToggleAll]);
  const actionLabel = t(
    isSelected
      ? 'settings.provider.models.selection.deselectAll'
      : 'settings.provider.models.selection.selectAll',
  );

  return (
    <View
      className={
        isFirstSection
          ? 'flex-row items-center gap-2 px-4 pb-2'
          : 'mt-3 flex-row items-center gap-2 px-4 pb-2'
      }
    >
      <Text className="font-medium text-foreground-tertiary text-sm">
        {t(
          section === 'added'
            ? 'settings.provider.models.pullAddedSection'
            : 'settings.provider.models.pullMissingSection',
        )}
      </Text>
      <Text className="text-foreground-tertiary text-sm" style={styles.counter}>
        {count}
      </Text>
      <View className="flex-1" />
      <View className="shrink-0">
        <Button
          accessibilityLabel={actionLabel}
          disabled={ids.length === 0}
          size="xs"
          variant="ghost"
          onPress={handleActionPress}
        >
          <Button.Label>{actionLabel}</Button.Label>
        </Button>
      </View>
    </View>
  );
});

const PullModelRow = memo(function PullModelRow({
  isApplying,
  isProtected,
  isSelected,
  model,
  onToggleModel,
  provider,
  section,
}: {
  isApplying: boolean;
  isProtected: boolean;
  isSelected: boolean;
  model: Model;
  onToggleModel: (id: UniqueModelId) => void;
  provider: Provider | undefined;
  section: ProviderModelPullSectionKey;
}) {
  const { t } = useTranslation();
  const handleToggle = useCallback(() => {
    onToggleModel(model.id);
  }, [model.id, onToggleModel]);

  return (
    <ProviderModelRow
      model={model}
      provider={provider}
      selection={{
        isDisabled: isApplying || isProtected,
        isSelected: isSelected && !isProtected,
        onToggle: handleToggle,
      }}
      // Absence from this response is only a proposed removal, not proof of retirement.
      tone={section === 'missing' && !isProtected ? 'struck' : 'default'}
      variant="synchronization"
    >
      {isProtected ? (
        <Text className="text-foreground-tertiary text-xs">
          {t('settings.provider.models.management.defaultProtected')}
        </Text>
      ) : null}
    </ProviderModelRow>
  );
});

const styles = StyleSheet.create({
  counter: {
    fontVariant: ['tabular-nums'],
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
});
