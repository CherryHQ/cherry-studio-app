import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/frontend/components/headers';
import {
  buildModelPickerListItems,
  MODEL_SETTING_KIND_TITLE_KEYS,
  MODEL_SETTING_KINDS,
  type ModelPickerGroup,
  ModelPickerList,
  type ModelPickerModelItem,
  type ModelSettingKind,
  getNextModelSelection,
  useModelPickerData,
  useModelSettingSelections,
} from '@/frontend/components/modelPicker';

import { ProviderModelSearchControls } from './ProviderScreen/models/components/ProviderModelSearchControls';
import { ProviderModelTypeFilterBar } from './ProviderScreen/models/components/ProviderModelTypeFilterBar';
import {
  getProviderModelTypeCounts,
  matchesProviderModelTypeFilter,
  type ProviderModelTypeFilter,
} from './ProviderScreen/models/utils/providerModelTypeFilter';

/**
 * Which model answers for one of the three settings — the default, the fast one
 * and the translator. The kind travels in the route rather than in a prop, so
 * the screen reads the setting it is editing straight off the URL.
 */
export default function ModelSettingSelectScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();

  if (!isModelSettingKind(kind)) {
    return <Redirect href="/settings/model" />;
  }

  return <ModelSettingPicker kind={kind} />;
}

function ModelSettingPicker({ kind }: { kind: ModelSettingKind }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { onSelectionChange, selections } = useModelSettingSelections();
  const selectedModelId = selections[kind];
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [typeFilter, setTypeFilter] = useState<ProviderModelTypeFilter>('all');
  const { groups, isLoading, pinnedModelIds } = useModelPickerData({
    searchText: deferredSearchText,
  });
  // Counted over what the search left behind but before the type filter, so a
  // tab's number says how many models picking it would show.
  const typeCounts = useMemo(
    () =>
      getProviderModelTypeCounts(groups.flatMap((group) => group.items.map((item) => item.model))),
    [groups],
  );
  const displayedGroups = useMemo(
    () => filterModelPickerGroupsByType(groups, typeFilter),
    [groups, typeFilter],
  );
  // No lazy window: the sheet grows its list in batches because it opens over
  // whatever you were doing, but a pushed screen has a whole transition to
  // build in and the list recycles its rows.
  const listItems = useMemo(() => buildModelPickerListItems(displayedGroups), [displayedGroups]);
  const handleSelect = useCallback(
    (item: ModelPickerModelItem) => {
      // Picking the model already set clears the setting — the only way back to
      // "none" now that the row is a tick-free highlight.
      onSelectionChange(kind, getNextModelSelection(selectedModelId, item.modelId));
      router.back();
    },
    [kind, onSelectionChange, router, selectedModelId],
  );

  return (
    <>
      <BackHeader title={t(MODEL_SETTING_KIND_TITLE_KEYS[kind])} />
      {/* Pinned above the list rather than scrolling away with it: this is every
          model on the device in one column, and a filter you have to scroll back
          up to reach is one you stop reaching for. The platform controls own
          whether search sits in the navigation bar or in this content row. */}
      <ProviderModelSearchControls searchText={searchText} setSearchText={setSearchText}>
        <ProviderModelTypeFilterBar
          counts={typeCounts}
          selectedFilter={typeFilter}
          onSelect={setTypeFilter}
        />
      </ProviderModelSearchControls>
      <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
        <ModelPickerList
          emptyText={t('settings.provider.models.search.empty')}
          isLoading={isLoading}
          isOpen
          listItems={listItems}
          loadingText={t('settings.provider.models.loading')}
          onSelect={handleSelect}
          pinnedModelIds={pinnedModelIds}
          selectedModelId={selectedModelId}
        />
      </View>
    </>
  );
}

/** Drops the models a type tab excludes, and any group left with none of them. */
function filterModelPickerGroupsByType(
  groups: readonly ModelPickerGroup[],
  filter: ProviderModelTypeFilter,
): ModelPickerGroup[] {
  if (filter === 'all') {
    return [...groups];
  }

  return groups.flatMap((group) => {
    const items = group.items.filter((item) => matchesProviderModelTypeFilter(item.model, filter));

    return items.length > 0 ? [{ ...group, items }] : [];
  });
}

function isModelSettingKind(kind: string | undefined): kind is ModelSettingKind {
  return MODEL_SETTING_KINDS.some((candidate) => candidate === kind);
}
