import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { ProvidersBackend } from '@/shared/contracts';

export function prefetchProviders(providers: ProvidersBackend, queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryFn: () => providers.list(),
    queryKey: queryKeys.providers.list(),
    staleTime: 1000 * 60 * 5,
  });
}

export function usePrefetchProviders() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const providers = useBackendModule('providers');

  return useCallback(() => {
    router.prefetch('/settings/provider');
    void prefetchProviders(providers, queryClient);
  }, [providers, queryClient, router]);
}
