import { useDataMutation, useDataQuery } from '@/data/hooks';
import { queryKeys } from '@/data/queries';
import type { EndpointType } from '@/data/types/model';
import type { ApiKeyEntry, AuthConfig, EndpointConfigs } from '@/data/types/provider';

export function useProviderApiServiceQueries(providerId: string) {
  const providerQuery = useDataQuery({
    enabled: Boolean(providerId),
    queryFn: (services) => services.provider.getByProviderId(providerId),
    queryKey: queryKeys.providers.detail(providerId),
    retry: false,
  });
  const apiKeysQuery = useDataQuery({
    enabled: Boolean(providerId),
    queryFn: (services) => services.provider.listApiKeys(providerId),
    queryKey: queryKeys.providers.apiKeys(providerId),
    retry: false,
  });
  const authConfigQuery = useDataQuery({
    enabled: Boolean(providerId),
    queryFn: (services) => services.provider.getAuthConfig(providerId),
    queryKey: queryKeys.providers.authConfig(providerId),
    retry: false,
  });
  const saveProviderMutation = useDataMutation({
    invalidateQueries: [
      queryKeys.providers.detail(providerId),
      queryKeys.providers.list(),
      queryKeys.providers.list({ enabled: true }),
      queryKeys.providers.list({ enabled: false }),
      queryKeys.providers.authConfig(providerId),
    ],
    mutationFn: (
      services,
      updates: {
        authConfig?: AuthConfig;
        defaultChatEndpoint?: EndpointType;
        endpointConfigs?: EndpointConfigs;
      },
    ) => services.provider.update(providerId, updates),
  });
  const replaceApiKeysMutation = useDataMutation({
    invalidateQueries: [
      queryKeys.providers.detail(providerId),
      queryKeys.providers.list(),
      queryKeys.providers.apiKeys(providerId),
    ],
    mutationFn: (services, apiKeys: ApiKeyEntry[]) =>
      services.provider.replaceApiKeys(providerId, apiKeys),
  });

  return {
    apiKeys: apiKeysQuery.data?.keys,
    apiKeysQuery,
    authConfig: authConfigQuery.data,
    authConfigQuery,
    isSaving: saveProviderMutation.isPending || replaceApiKeysMutation.isPending,
    provider: providerQuery.data,
    providerQuery,
    replaceApiKeysMutation,
    saveProviderMutation,
  };
}
