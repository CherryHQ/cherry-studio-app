import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys, useBackendModule } from '@/frontend/data';

const modelPickerPrefetchStaleTime = 1000 * 60 * 5;

export function usePrefetchModelPickerData() {
  const queryClient = useQueryClient();
  const models = useBackendModule('models');
  const pins = useBackendModule('pins');
  const providers = useBackendModule('providers');

  useEffect(() => {
    void Promise.all([
      queryClient.prefetchQuery({
        queryFn: () => models.list({ enabled: true }),
        queryKey: queryKeys.models.list({ enabled: true }),
        staleTime: modelPickerPrefetchStaleTime,
      }),
      queryClient.prefetchQuery({
        queryFn: () => providers.list({ enabled: true }),
        queryKey: queryKeys.providers.list({ enabled: true }),
        staleTime: modelPickerPrefetchStaleTime,
      }),
      queryClient.prefetchQuery({
        queryFn: () => pins.list('model'),
        queryKey: queryKeys.pins.list({ entityType: 'model' }),
        staleTime: modelPickerPrefetchStaleTime,
      }),
    ]);
  }, [models, pins, providers, queryClient]);
}
