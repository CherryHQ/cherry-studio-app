import { queryKeys } from '@/data/api';
import { useDataQuery } from '@/hooks/data';
import type { Provider } from '@/shared/domain/provider';

const EMPTY_PROVIDERS: readonly Provider[] = Object.freeze([]);

export function useProviders(query: { enabled?: boolean } = {}) {
  const providersQuery = useDataQuery({
    queryFn: (services) => services.provider.list(query),
    queryKey: queryKeys.providers.list(query),
  });

  return {
    providers: providersQuery.data ?? EMPTY_PROVIDERS,
    isLoading: providersQuery.isLoading,
    error: providersQuery.error,
    refetch: providersQuery.refetch,
    providersQuery,
  };
}
