import { useCallback, useMemo } from 'react';

import { useModels, usePins, useProviders } from '@/frontend/hooks/chat';

import {
  buildModelPickerGroups,
  getAvailableModelPickerFilterTags,
  getModelPickerModelItem,
  getPinnedModelIds,
  type ModelPickerModelItem,
  type ModelPickerTag,
} from '../utils/modelPickerData';

type UseModelPickerDataOptions = {
  searchText?: string;
  selectedTags?: readonly ModelPickerTag[];
  showPinnedModels?: boolean;
};

// Module-level so the default is one shared reference. An inline `= []` default
// allocates a new array on every call, which invalidated the `groups` memo below
// (the most expensive computation here) on every render for callers that don't
// filter by tag.
const EMPTY_TAGS: readonly ModelPickerTag[] = Object.freeze([]);

export function useModelPickerData({
  searchText = '',
  selectedTags = EMPTY_TAGS,
  showPinnedModels = true,
}: UseModelPickerDataOptions = {}) {
  const { isLoading: isModelsLoading, models } = useModels({ enabled: true });
  const { isLoading: isProvidersLoading, providers } = useProviders({ enabled: true });
  const pins = usePins('model');
  const pinnedModelIds = useMemo(() => getPinnedModelIds(pins.pins), [pins.pins]);
  const groups = useMemo(
    () =>
      buildModelPickerGroups({
        models,
        pinnedModelIds,
        providers,
        searchText,
        selectedTags,
        showPinnedModels,
      }),
    [models, pinnedModelIds, providers, searchText, selectedTags, showPinnedModels],
  );
  const availableTags = useMemo(
    () => getAvailableModelPickerFilterTags({ models, providers }),
    [models, providers],
  );
  const modelItems = useMemo<ModelPickerModelItem[]>(
    () => groups.flatMap((group) => group.items),
    [groups],
  );
  const getModelItem = useCallback(
    (modelId: string | null) =>
      getModelPickerModelItem(modelId, {
        models,
        pinnedModelIds,
        providers,
      }),
    [models, pinnedModelIds, providers],
  );

  // Memoized so consumers can key their own memos/effects on the returned object.
  // Every field here is itself reference-stable (memo, useCallback, react-query
  // `data`, or a primitive). The raw `usePins` object and a `queries` bag used to
  // be exposed too, but nothing consumed them and neither can be stabilized —
  // react-query hands back a freshly tracked proxy for query results on every
  // render — so keeping them would have defeated this memo.
  const {
    isLoading: isPinsLoading,
    isMutating: isPinsMutating,
    isRefreshing: isPinsRefreshing,
    togglePin,
  } = pins;

  return useMemo(
    () => ({
      availableTags,
      groups,
      isLoading: isModelsLoading || isProvidersLoading || isPinsLoading,
      isPinActionDisabled: isPinsLoading || isPinsRefreshing || isPinsMutating,
      modelItems,
      models,
      pinnedModelIds,
      providers,
      getModelItem,
      togglePin,
    }),
    [
      availableTags,
      getModelItem,
      groups,
      isModelsLoading,
      isPinsLoading,
      isPinsMutating,
      isPinsRefreshing,
      isProvidersLoading,
      modelItems,
      models,
      pinnedModelIds,
      providers,
      togglePin,
    ],
  );
}
