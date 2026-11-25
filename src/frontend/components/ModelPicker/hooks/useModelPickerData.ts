import { useCallback, useMemo } from 'react';

import { useModels, useProviders } from '@/frontend/hooks/chat';
import { useCloud } from '@/frontend/hooks/useCloud';
import {
  CLOUD_PROVIDER_ID,
  cloudModelUnavailable,
  isCloudModelListed,
  type CloudModelUse,
} from '@/shared/contracts/cloud';
import { isEnterpriseProfile } from '@/shared/data/activeProfile';

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
  const {
    isLoading: isModelsLoading,
    models,
    modelsQuery,
    refetch: refetchModels,
  } = useModels({
    enabled: true,
    isSystemSupported: true,
    providerId,
  });
  const {
    isLoading: isProvidersLoading,
    providers: enabledProviders,
    providersQuery,
    refetch: refetchProviders,
  } = useProviders({ enabled: true });
  const error = modelsQuery.error ?? providersQuery.error;
  const providers = useMemo(
    () =>
      providerId
        ? enabledProviders.filter((provider) => provider.id === providerId)
        : enabledProviders,
    [enabledProviders, providerId],
  );
  const isCloudIncluded =
    !isEnterpriseProfile() &&
    (!providerId || providerId === CLOUD_PROVIDER_ID) &&
    providers.some((provider) => provider.id === CLOUD_PROVIDER_ID);
  const cloudSettledError = cloud.guestCatalog === 'error' || cloud.phase === 'error';
  const hasListedCloudModels = cloud.models.some((model) => isCloudModelListed(cloud, model.id));
  const hasProjectedCloudModels = models.some((model) => model.providerId === CLOUD_PROVIDER_ID);
  // Cloud publishes its catalog before the invalidated /models query refetches.
  const isCloudCatalogPending =
    isCloudIncluded &&
    !cloudSettledError &&
    (cloud.phase === 'loading' ||
      (cloud.phase === 'signed_out' && cloud.guestCatalog !== 'ready') ||
      (hasListedCloudModels && !hasProjectedCloudModels));
  const hasLoadedCatalog =
    !error &&
    modelsQuery.data !== undefined &&
    providersQuery.data !== undefined &&
    !isCloudCatalogPending;
  const isLoading = isModelsLoading || isProvidersLoading || (!error && isCloudCatalogPending);
  const groups = useMemo(
    () =>
      buildModelPickerGroups({ modelType, models, providers, searchText })
        .map((group) => {
          if (group.provider.id !== CLOUD_PROVIDER_ID) return group;
          return {
            ...group,
            items: group.items.flatMap((item) => {
              const model = cloud.models.find((entry) => entry.id === item.model.modelId);
              if (!model) return [];
              return [
                {
                  ...item,
                  cloudUnavailable: cloudModelUnavailable(cloud, model.id, cloudUse),
                  isCloudFree: model.is_free,
                },
              ];
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
  const refresh = useCallback(
    () => Promise.all([refetchModels(), refetchProviders()]),
    [refetchModels, refetchProviders],
  );

  // Memoized so consumers can key their own memos/effects on the returned object.
  // Every field here is itself reference-stable (memo, useCallback, react-query
  // `data`, or a primitive). A `queries` bag used to be exposed too, but nothing
  // consumed it and it cannot be stabilized — react-query hands back a freshly
  // tracked proxy for query results on every render — so keeping it would have
  // defeated this memo.
  return useMemo(
    () => ({
      cloudState: cloud,
      error,
      groups,
      hasLoadedCatalog,
      isLoading,
      modelItems,
      models,
      providers,
      getModelItem,
      refresh,
    }),
    [
      cloud,
      error,
      getModelItem,
      groups,
      hasLoadedCatalog,
      isLoading,
      modelItems,
      models,
      providers,
      refresh,
    ],
  );
}
