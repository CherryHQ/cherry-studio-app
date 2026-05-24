import { useDataMutation, useDataQuery } from '@/data/hooks';
import { queryKeys } from '@/data/queries';

const providerModelStaleTime = 1000 * 60 * 5;

export function useProviderDetailSettings(providerId: string) {
  const providerQuery = useDataQuery({
    enabled: Boolean(providerId),
    queryKey: queryKeys.providers.detail(providerId),
    queryFn: (services) => services.provider.getByProviderId(providerId),
    retry: false,
  });
  const provider = providerQuery.data;
  const modelsQuery = useDataQuery({
    enabled: Boolean(providerId),
    queryKey: queryKeys.models.list({ enabled: true, providerId }),
    queryFn: (services) => services.model.list({ enabled: true, providerId }),
    staleTime: providerModelStaleTime,
  });
  const updateProviderEnabledMutation = useDataMutation({
    invalidateQueries: [
      queryKeys.providers.detail(providerId),
      queryKeys.providers.list(),
      queryKeys.providers.list({ enabled: true }),
      queryKeys.providers.list({ enabled: false }),
    ],
    mutationFn: (services, enabled: boolean) =>
      services.provider.update(providerId, { isEnabled: enabled }),
  });

  return {
    models: modelsQuery.data ?? [],
    modelsQuery,
    provider,
    providerQuery,
    updateProviderEnabledMutation,
  };
}
