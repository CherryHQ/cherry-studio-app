import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { useQuery } from '@/frontend/data';

const EMPTY_PROVIDERS: readonly Provider[] = Object.freeze([]);

export function useProviders(query: { enabled?: boolean } = {}) {
  const providersQuery = useQuery('/providers', {
    query,
  });

  return {
    providers: providersQuery.data ?? EMPTY_PROVIDERS,
    isLoading: providersQuery.isLoading,
    error: providersQuery.error,
    refetch: providersQuery.refetch,
    providersQuery,
  };
}
