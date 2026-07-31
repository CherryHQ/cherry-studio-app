import { useQuery } from '@/frontend/data';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

const EMPTY_MODELS: readonly Model[] = Object.freeze([]);

export function useModels(
  query: { capability?: string; enabled?: boolean; providerId?: string } = {},
) {
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
  const modelQuery = useQuery('/models/:id', {
    enabled: Boolean(modelKey),
    params: { id: modelKey as UniqueModelId },
  });

  return {
    model: modelQuery.data ?? undefined,
    isLoading: modelQuery.isLoading,
    error: modelQuery.error,
    refetch: modelQuery.refetch,
    modelQuery,
  };
}
