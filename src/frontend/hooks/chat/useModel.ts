import { useQuery } from '@/frontend/data';
import type { ListModelsQuery } from '@/shared/data/api/schemas/models';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

const EMPTY_MODELS: readonly Model[] = Object.freeze([]);

export function useModels(query: ListModelsQuery = {}) {
  const modelsQuery = useQuery('/models', {
    query,
  });

  return {
    models: modelsQuery.data ?? EMPTY_MODELS,
    isLoading: modelsQuery.isLoading,
    refetch: modelsQuery.refetch,
    modelsQuery,
  };
}

export function useModelById(uniqueModelId: UniqueModelId | null | undefined) {
  const modelKey = uniqueModelId ?? '';
  const modelQuery = useQuery('/models/:uniqueModelId*', {
    enabled: Boolean(modelKey),
    params: { uniqueModelId: modelKey as UniqueModelId },
  });

  return {
    model: modelQuery.data ?? undefined,
    isLoading: modelQuery.isLoading,
    error: modelQuery.error,
    refetch: modelQuery.refetch,
    modelQuery,
  };
}
