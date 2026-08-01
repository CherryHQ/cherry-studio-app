import { useQuery } from '@/frontend/data';
import type { Provider } from '@cherrystudio/shared/data/types/provider';

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
