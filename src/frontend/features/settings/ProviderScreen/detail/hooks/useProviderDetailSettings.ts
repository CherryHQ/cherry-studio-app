import { useCallback, useMemo } from 'react';

import { useMutation, useQuery } from '@/frontend/data';

const providerModelStaleTime = 1000 * 60 * 5;

export function useProviderDetailSettings(providerId: string) {
  const providerQuery = useQuery('/providers/:id', {
    enabled: Boolean(providerId),
    params: { id: providerId },
    retry: false,
  });
  const provider = providerQuery.data;
  const modelsQuery = useQuery('/models', {
    enabled: Boolean(providerId),
    query: { enabled: true, isSystemSupported: true, providerId },
    staleTime: providerModelStaleTime,
  });
  const updateProviderMutation = useMutation('PATCH', '/providers/:id', {
    refresh: ['/providers', '/providers/page', `/providers/${providerId}`],
  });
  const updateProvider = updateProviderMutation.trigger;
  const updateProviderEnabled = useCallback(
    (enabled: boolean) => {
      void updateProvider({
        body: { isEnabled: enabled },
        params: { id: providerId },
      });
    },
    [providerId, updateProvider],
  );
  const updateProviderEnabledMutation = useMemo(
    () => ({ isPending: updateProviderMutation.isLoading, mutate: updateProviderEnabled }),
    [updateProviderEnabled, updateProviderMutation.isLoading],
  );

  return {
    models: modelsQuery.data ?? [],
    modelsQuery,
    provider,
    providerQuery,
    updateProviderEnabledMutation,
  };
}
