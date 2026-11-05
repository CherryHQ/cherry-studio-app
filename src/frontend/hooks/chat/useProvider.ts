import { useMemo } from 'react';

import { useQuery } from '@/frontend/data';
import type { Provider } from '@/shared/data/types/provider';

const EMPTY_PROVIDERS: readonly Provider[] = Object.freeze([]);

/**
 * Always queries the unfiltered list so every caller shares one cache entry. The chat
 * composer and the settings list already hold `/providers`, so an `enabled`-scoped query
 * would fetch the same rows again under a second key — the model picker used to pay that
 * on every open. `ProviderService.list` pins Plan first and then keeps saved `orderKey`
 * ordering; filtering on `isEnabled` below preserves that same order.
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
