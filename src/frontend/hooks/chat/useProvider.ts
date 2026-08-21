import { useMemo } from 'react';

import { useQuery } from '@/frontend/data';
import type { Provider } from '@/shared/data/types/provider';

const EMPTY_PROVIDERS: readonly Provider[] = Object.freeze([]);

/**
 * Always queries the unfiltered list so every caller shares one cache entry. The chat
 * composer and the settings list already hold `/providers`, so an `enabled`-scoped query
 * would fetch the same rows again under a second key — the model picker used to pay that
 * on every open. `ProviderService.list` filters on `isEnabled` and keeps the `orderKey`
 * ordering, which the filter below reproduces exactly.
 */
export function useProviders(query: { enabled?: boolean } = {}) {
  const providersQuery = useQuery('/providers');
  const { enabled } = query;
  const { data } = providersQuery;
  const providers = useMemo(() => {
    if (!data) {
      return EMPTY_PROVIDERS;
    }

    return enabled === undefined ? data : data.filter((provider) => provider.isEnabled === enabled);
  }, [data, enabled]);

  return {
    providers,
    isLoading: providersQuery.isLoading,
    error: providersQuery.error,
    refetch: providersQuery.refetch,
    providersQuery,
  };
}
