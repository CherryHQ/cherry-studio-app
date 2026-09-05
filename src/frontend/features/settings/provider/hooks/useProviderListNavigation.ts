import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { usePrefetchInfiniteQuery } from '@/frontend/data/hooks';

import { PROVIDER_LIST_PAGE_SIZE, PROVIDER_LIST_STALE_TIME } from '../providerListQuery';

export function useProviderListNavigation() {
  const router = useRouter();
  const prefetchInfiniteQuery = usePrefetchInfiniteQuery();

  const prepareProviderList = useCallback(() => {
    router.prefetch('/settings/provider');
    void prefetchInfiniteQuery('/providers/page', {
      limit: PROVIDER_LIST_PAGE_SIZE,
      staleTime: PROVIDER_LIST_STALE_TIME,
    });
  }, [prefetchInfiniteQuery, router]);

  const openProviderList = useCallback(() => {
    prepareProviderList();
    router.push('/settings/provider');
  }, [prepareProviderList, router]);

  return { openProviderList, prepareProviderList };
}
