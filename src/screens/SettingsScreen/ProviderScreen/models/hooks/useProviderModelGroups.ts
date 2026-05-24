import { useEffect, useMemo, useState } from 'react';

import type { Model } from '@/data/types/model';

import {
  filterModelsByKeywords,
  groupModels,
  type ProviderModelGroup,
} from '../utils/providerModelGroups';

const DEFAULT_EXPANDED_GROUP_COUNT = 3;

export function useProviderModelGroups({
  models,
  searchText,
}: {
  models: Model[];
  searchText: string;
}) {
  const isSearching = searchText.trim().length > 0;
  const groups = useMemo<ProviderModelGroup[]>(
    () => groupModels(filterModelsByKeywords(searchText, models)),
    [models, searchText],
  );
  const defaultExpandedValues = useMemo(
    () => groups.slice(0, DEFAULT_EXPANDED_GROUP_COUNT).map((group) => group.groupName),
    [groups],
  );
  const [expandedValues, setExpandedValues] = useState<string[]>(defaultExpandedValues);
  const displayedExpandedValues = isSearching
    ? groups.map((group) => group.groupName)
    : expandedValues.filter((value) => groups.some((group) => group.groupName === value));

  useEffect(() => {
    if (isSearching) {
      return;
    }

    setExpandedValues(defaultExpandedValues);
  }, [defaultExpandedValues, isSearching]);

  return {
    displayedExpandedValues,
    groups,
    isSearching,
    setExpandedValues,
  };
}
