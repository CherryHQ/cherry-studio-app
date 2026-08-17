import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/frontend/components/headers';

import { useModelPickerData } from '../hooks/useModelPickerData';
import type { ModelPickerGroup, ModelPickerModelItem } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import {
  getModelTypeCounts,
  matchesModelTypeFilter,
  type ModelTypeFilter,
} from '../utils/modelTypeFilter';
import { ModelPickerList } from './ModelPickerList';
import { ModelSearchControls } from './ModelSearchControls/ModelSearchControls';
import { ModelTypeFilterBar } from './ModelTypeFilterBar';

/**
 * Picking one model as a whole screen rather than as a sheet: this is a search
 * through every model on the device, which wants the full height and a back
 * button. Owned here rather than by either caller because the model settings
 * and the assistant editor push the same screen, and the two must not drift.
 *
 * The caller owns what the choice means — the settings write a preference, the
 * assistant editor carries it back into an unsaved form — so this screen only
 * reports the selection and never leaves itself.
 */
export function ModelPickerScreen({
  onSelect,
  selectedModelId,
  title,
}: {
  onSelect: (item: ModelPickerModelItem) => void;
  selectedModelId: string | null;
  title: string;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [typeFilter, setTypeFilter] = useState<ModelTypeFilter>('all');
  const { groups, isLoading, pinnedModelIds } = useModelPickerData({
    searchText: deferredSearchText,
  });
  // Counted over what the search left behind but before the type filter, so a
  // tab's number says how many models picking it would show.
  const typeCounts = useMemo(
    () => getModelTypeCounts(groups.flatMap((group) => group.items.map((item) => item.model))),
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

  return (
    <>
      <BackHeader title={title} />
      {/* Pinned above the list rather than scrolling away with it: this is every
          model on the device in one column, and a filter you have to scroll back
          up to reach is one you stop reaching for. The platform controls own
          whether search sits in the navigation bar or in this content row. */}
      <ModelSearchControls searchText={searchText} setSearchText={setSearchText}>
        <ModelTypeFilterBar
          counts={typeCounts}
          selectedFilter={typeFilter}
          onSelect={setTypeFilter}
        />
      </ModelSearchControls>
      <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
        <ModelPickerList
          emptyText={t('settings.provider.models.search.empty')}
          isLoading={isLoading}
          isOpen
          listItems={listItems}
          loadingText={t('settings.provider.models.loading')}
          onSelect={onSelect}
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
  filter: ModelTypeFilter,
): ModelPickerGroup[] {
  if (filter === 'all') {
    return [...groups];
  }

  return groups.flatMap((group) => {
    const items = group.items.filter((item) => matchesModelTypeFilter(item.model, filter));

    return items.length > 0 ? [{ ...group, items }] : [];
  });
}
