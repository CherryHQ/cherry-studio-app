import { useQuery } from '@tanstack/react-query';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

const EMPTY_MODELS: readonly Model[] = Object.freeze([]);

export function useModels(
  query: { capability?: string; enabled?: boolean; providerId?: string } = {},
) {
  const models = useBackendModule('models');
  const modelsQuery = useQuery({
    queryFn: () => models.list(query),
    queryKey: queryKeys.models.list(query),
  });

  return {
    models: modelsQuery.data ?? EMPTY_MODELS,
    isLoading: modelsQuery.isLoading,
    refetch: modelsQuery.refetch,
    modelsQuery,
  };
}

export function useModelById(uniqueModelId: UniqueModelId | null | undefined) {
  const models = useBackendModule('models');
  const modelKey = uniqueModelId ?? '';
  const modelQuery = useQuery({
    enabled: Boolean(modelKey),
    queryFn: () => {
      if (!uniqueModelId) {
        throw new Error('Cannot load a model without an id.');
      }

      return models.get(uniqueModelId);
    },
    queryKey: queryKeys.models.detail(modelKey),
  });

  return {
    model: modelQuery.data ?? undefined,
    isLoading: modelQuery.isLoading,
    error: modelQuery.error,
    refetch: modelQuery.refetch,
    modelQuery,
  };
}
