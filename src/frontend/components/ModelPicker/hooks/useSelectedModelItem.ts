import { useMemo } from 'react';

import { useModels, useProviders } from '@/frontend/hooks/chat';
import { useCloud } from '@/frontend/hooks/useCloud';
import { CLOUD_PROVIDER_ID, isCloudModelListed } from '@/shared/contracts/cloud';
import { isEnterpriseProfile } from '@/shared/data/activeProfile';
import { type UniqueModelId, UniqueModelIdSchema } from '@/shared/data/types/model';

import { getModelPickerModelItem, type ModelPickerModelItem } from '../utils/modelPickerData';
import type { ModelTypeFilter } from '../utils/modelTypeFilter';

type UseSelectedModelItemOptions = {
  modelId: UniqueModelId | string | null | undefined;
  modelType?: ModelTypeFilter;
  enabled?: boolean;
};

/**
 * Lightweight single-model lookup for first-paint chat surfaces.
 * Queries only the active `user_model` row instead of loading and grouping the entire catalog.
 */
export function useSelectedModelItem({
  modelId,
  modelType = 'all',
  enabled = true,
}: UseSelectedModelItemOptions): {
  error: Error | undefined;
  hasResolved: boolean;
  isLoading: boolean;
  item: ModelPickerModelItem | undefined;
} {
  const { state: cloud } = useCloud();
  const hasValidModelId =
    typeof modelId === 'string' && UniqueModelIdSchema.safeParse(modelId).success;
  const active = enabled && hasValidModelId;
  const queryId = active ? (modelId as UniqueModelId) : undefined;
  const {
    isLoading: isModelsLoading,
    models,
    modelsQuery,
  } = useModels(
    {
      enabled: true,
      id: queryId,
      isSystemSupported: true,
    },
    { enabled: active },
  );
  const {
    isLoading: isProvidersLoading,
    providers,
    providersQuery,
  } = useProviders({ enabled: true }, { enabled: active });
  const error = modelsQuery.error ?? providersQuery.error;
  const isCloudModelSelected = Boolean(
    active &&
    !isEnterpriseProfile() &&
    queryId?.startsWith(`${CLOUD_PROVIDER_ID}::`) &&
    providers.some((provider) => provider.id === CLOUD_PROVIDER_ID),
  );
  const cloudSettledError = cloud.guestCatalog === 'error' || cloud.phase === 'error';
  const hasListedCloudModels = cloud.models.some((model) => isCloudModelListed(cloud, model.id));
  const hasProjectedCloudModels = models.some((model) => model.providerId === CLOUD_PROVIDER_ID);
  const isCloudCatalogPending =
    isCloudModelSelected &&
    !cloudSettledError &&
    (cloud.phase === 'loading' ||
      (cloud.phase === 'signed_out' && cloud.guestCatalog !== 'ready') ||
      (hasListedCloudModels && !hasProjectedCloudModels));
  const hasResolved =
    (enabled && Boolean(modelId) && !hasValidModelId) ||
    (active &&
      !error &&
      modelsQuery.data !== undefined &&
      providersQuery.data !== undefined &&
      !isCloudCatalogPending);
  const isLoading =
    active && (isModelsLoading || isProvidersLoading || (!error && isCloudCatalogPending));
  const item = useMemo(
    () =>
      active
        ? getModelPickerModelItem(queryId ?? null, { modelType, models, providers })
        : undefined,
    [active, modelType, models, providers, queryId],
  );

  return useMemo(
    () => ({
      error,
      hasResolved,
      isLoading,
      item,
    }),
    [error, hasResolved, isLoading, item],
  );
}
