import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '@/frontend/data';
import { useDataServices } from '@/runtime';

const modelPickerPrefetchStaleTime = 1000 * 60 * 5;

export function usePrefetchModelPickerData() {
  const queryClient = useQueryClient();
  const services = useDataServices();

  useEffect(() => {
    void Promise.all([
      queryClient.prefetchQuery({
        queryFn: () => services.model.list({ enabled: true }),
        queryKey: queryKeys.models.list({ enabled: true }),
        staleTime: modelPickerPrefetchStaleTime,
      }),
      queryClient.prefetchQuery({
        queryFn: () => services.provider.list({ enabled: true }),
        queryKey: queryKeys.providers.list({ enabled: true }),
        staleTime: modelPickerPrefetchStaleTime,
      }),
      queryClient.prefetchQuery({
        queryFn: () => services.pin.listByEntityType('model'),
        queryKey: queryKeys.pins.list({ entityType: 'model' }),
        staleTime: modelPickerPrefetchStaleTime,
      }),
    ]);
  }, [queryClient, services]);
}
