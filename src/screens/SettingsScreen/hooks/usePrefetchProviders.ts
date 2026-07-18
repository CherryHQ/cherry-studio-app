import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { queryKeys } from '@/data/api';
import { useDataServices } from '@/data/runtime';
import type { DataServices } from '@/data/services/createDataServices';

export function prefetchProviders(services: DataServices, queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryFn: () => services.provider.list(),
    queryKey: queryKeys.providers.list(),
    staleTime: 1000 * 60 * 5,
  });
}

export function usePrefetchProviders() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const services = useDataServices();

  return useCallback(() => {
    router.prefetch('/settings/provider');
    void prefetchProviders(services, queryClient);
  }, [queryClient, router, services]);
}
