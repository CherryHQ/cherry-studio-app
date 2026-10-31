import { useCallback, useMemo } from 'react';

import { useModels, useProviders } from '@/frontend/hooks/chat';
import { useCloud } from '@/frontend/hooks/useCloud';
import {
  CLOUD_PROVIDER_ID,
  cloudModelUnavailable,
  type CloudModelUse,
} from '@/shared/contracts/cloud';

import {
  buildModelPickerGroups,
  getModelPickerModelItem,
  type ModelPickerModelItem,
} from '../utils/modelPickerData';
import type { ModelTypeFilter } from '../utils/modelTypeFilter';

type UseModelPickerDataOptions = {
  modelType: ModelTypeFilter;
  providerId?: string;
  searchText?: string;
  cloudUse?: CloudModelUse;
};

export function useModelPickerData({
  modelType,
  providerId,
  searchText = '',
  cloudUse = 'agent',
}: UseModelPickerDataOptions) {
  const { state: cloud } = useCloud();
  const { isLoading: isModelsLoading, models } = useModels({
    enabled: true,
    isSystemSupported: true,
    providerId,
  });
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
    () =>
      buildModelPickerGroups({ modelType, models, providers, searchText })
        .map((group) => {
          if (group.provider.id !== CLOUD_PROVIDER_ID) return group;
          return {
            ...group,
            items: group.items
              .filter((item) => cloud.models.some((model) => model.id === item.model.modelId))
              .map((item) => {
                const entitlements =
                  cloud.account?.entitlements.filter(
                    (entry) =>
                      entry.status === 'active' && entry.model_ids.includes(item.model.modelId),
                  ) ?? [];
                return {
                  ...item,
                  cloudUnavailable: cloudModelUnavailable(cloud, item.model.modelId, cloudUse),
                  isCloudFree:
                    entitlements.length > 0 && entitlements.every((entry) => entry.is_free),
                };
              }),
          };
        })
        .filter((group) => group.items.length > 0),
    [modelType, models, providers, searchText, cloud, cloudUse],
  );
  const modelItems = useMemo<ModelPickerModelItem[]>(
    () => groups.flatMap((group) => group.items),
    [groups],
  );
  const getModelItem = useCallback(
    (modelId: string | null) => getModelPickerModelItem(modelId, { modelType, models, providers }),
    [modelType, models, providers],
  );

  // Memoized so consumers can key their own memos/effects on the returned object.
  // Every field here is itself reference-stable (memo, useCallback, react-query
  // `data`, or a primitive). A `queries` bag used to be exposed too, but nothing
  // consumed it and it cannot be stabilized — react-query hands back a freshly
  // tracked proxy for query results on every render — so keeping it would have
  // defeated this memo.
  return useMemo(
    () => ({
      groups,
      isLoading: isModelsLoading || isProvidersLoading,
      modelItems,
      models,
      providers,
      getModelItem,
    }),
    [getModelItem, groups, isModelsLoading, isProvidersLoading, modelItems, models, providers],
  );
}
