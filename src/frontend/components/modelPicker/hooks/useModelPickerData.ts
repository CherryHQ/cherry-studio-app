import { useCallback, useMemo } from 'react';

import { useModels, useProviders } from '@/frontend/hooks/chat';

import {
  buildModelPickerGroups,
  getAvailableModelPickerFilterTags,
  getModelPickerModelItem,
  type ModelPickerModelItem,
  type ModelPickerTag,
} from '../utils/modelPickerData';

type UseModelPickerDataOptions = {
  providerId?: string;
  searchText?: string;
  selectedTags?: readonly ModelPickerTag[];
};

// Module-level so the default is one shared reference. An inline `= []` default
// allocates a new array on every call, which invalidated the `groups` memo below
// (the most expensive computation here) on every render for callers that don't
// filter by tag.
const EMPTY_TAGS: readonly ModelPickerTag[] = Object.freeze([]);

export function useModelPickerData({
  providerId,
  searchText = '',
  selectedTags = EMPTY_TAGS,
}: UseModelPickerDataOptions = {}) {
  const { isLoading: isModelsLoading, models } = useModels({ enabled: true, providerId });
  const { isLoading: isProvidersLoading, providers: enabledProviders } = useProviders({
    enabled: true,
  });
  const providers = useMemo(
    () =>
      providerId
        ? enabledProviders.filter((provider) => provider.id === providerId)
        : enabledProviders,
    [enabledProviders, providerId],
  );
  const groups = useMemo(
    () => buildModelPickerGroups({ models, providers, searchText, selectedTags }),
    [models, providers, searchText, selectedTags],
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
    (modelId: string | null) => getModelPickerModelItem(modelId, { models, providers }),
    [models, providers],
  );

  // Memoized so consumers can key their own memos/effects on the returned object.
  // Every field here is itself reference-stable (memo, useCallback, react-query
  // `data`, or a primitive). A `queries` bag used to be exposed too, but nothing
  // consumed it and it cannot be stabilized — react-query hands back a freshly
  // tracked proxy for query results on every render — so keeping it would have
  // defeated this memo.
  return useMemo(
    () => ({
      availableTags,
      groups,
      isLoading: isModelsLoading || isProvidersLoading,
      modelItems,
      models,
      providers,
      getModelItem,
    }),
    [
      availableTags,
      getModelItem,
      groups,
      isModelsLoading,
      isProvidersLoading,
      modelItems,
      models,
      providers,
    ],
  );
}
