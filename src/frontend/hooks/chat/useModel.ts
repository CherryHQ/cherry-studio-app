import { queryKeys } from '@/frontend/data';
import { useDataQuery } from '@/frontend/data/hooks';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

const EMPTY_MODELS: readonly Model[] = Object.freeze([]);

export function useModels(
  query: { capability?: string; enabled?: boolean; providerId?: string } = {},
) {
  const modelsQuery = useDataQuery({
    queryFn: (services) => services.model.list(query),
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
  const modelKey = uniqueModelId ?? '';
  const modelQuery = useDataQuery({
    enabled: Boolean(modelKey),
    queryFn: (services) => services.model.getById(modelKey),
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
