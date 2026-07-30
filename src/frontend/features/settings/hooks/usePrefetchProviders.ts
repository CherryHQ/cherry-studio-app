import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { usePrefetch } from '@/frontend/data';

export function usePrefetchProviders() {
  const prefetch = usePrefetch();
  const router = useRouter();

  return useCallback(() => {
    router.prefetch('/settings/provider');
    void prefetch('/providers', { staleTime: 1000 * 60 * 5 });
  }, [prefetch, router]);
}
