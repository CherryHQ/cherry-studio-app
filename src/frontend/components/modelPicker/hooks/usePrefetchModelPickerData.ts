import { useEffect } from 'react';

import { usePrefetch } from '@/frontend/data';

const modelPickerPrefetchStaleTime = 1000 * 60 * 5;

export function usePrefetchModelPickerData() {
  const prefetch = usePrefetch();

  useEffect(() => {
    void Promise.all([
      prefetch('/models', {
        query: { enabled: true },
        staleTime: modelPickerPrefetchStaleTime,
      }),
      prefetch('/providers', {
        query: { enabled: true },
        staleTime: modelPickerPrefetchStaleTime,
      }),
      prefetch('/pins', {
        query: { entityType: 'model' },
        staleTime: modelPickerPrefetchStaleTime,
      }),
    ]);
  }, [prefetch]);
}
