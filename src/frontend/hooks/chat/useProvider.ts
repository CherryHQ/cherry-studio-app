import { useQuery } from '@tanstack/react-query';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { Provider } from '@/shared/data/types/provider';

const EMPTY_PROVIDERS: readonly Provider[] = Object.freeze([]);

export function useProviders(query: { enabled?: boolean } = {}) {
  const providers = useBackendModule('providers');
  const providersQuery = useQuery({
    queryFn: () => providers.list(query),
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
