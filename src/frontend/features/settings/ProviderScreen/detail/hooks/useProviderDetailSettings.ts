import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useBackendModule } from '@/frontend/data';

const providerModelStaleTime = 1000 * 60 * 5;

export function useProviderDetailSettings(providerId: string) {
  const models = useBackendModule('models');
  const providers = useBackendModule('providers');
  const queryClient = useQueryClient();
  const providerQuery = useQuery({
    enabled: Boolean(providerId),
    queryKey: queryKeys.providers.detail(providerId),
    queryFn: () => providers.get(providerId),
    retry: false,
  });
  const provider = providerQuery.data;
  const modelsQuery = useQuery({
    enabled: Boolean(providerId),
    queryKey: queryKeys.models.list({ enabled: true, providerId }),
    queryFn: () => models.list({ enabled: true, providerId }),
    staleTime: providerModelStaleTime,
  });
  const updateProviderEnabledMutation = useMutation({
    mutationFn: (enabled: boolean) => providers.update(providerId, { isEnabled: enabled }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.list({ enabled: true }) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.list({ enabled: false }) }),
      ]);
    },
  });

  return {
    models: modelsQuery.data ?? [],
    modelsQuery,
    provider,
    providerQuery,
    updateProviderEnabledMutation,
  };
}
