import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { ApiKeyEntry, EndpointConfigs } from '@/shared/data/types/provider';

export function useProviderApiServiceQueries(providerId: string) {
  const providers = useBackendModule('providers');
  const queryClient = useQueryClient();
  const providerQuery = useQuery({
    enabled: Boolean(providerId),
    queryFn: () => providers.get(providerId),
    queryKey: queryKeys.providers.detail(providerId),
    retry: false,
  });
  const apiKeysQuery = useQuery({
    enabled: Boolean(providerId),
    queryFn: () => providers.listApiKeys(providerId),
    queryKey: queryKeys.providers.apiKeys(providerId),
    retry: false,
  });
  const authConfigQuery = useQuery({
    enabled: Boolean(providerId),
    queryFn: () => providers.getAuth(providerId),
    queryKey: queryKeys.providers.authConfig(providerId),
    retry: false,
  });
  const saveProviderMutation = useMutation({
    mutationFn: (updates: { endpointConfigs: EndpointConfigs }) =>
      providers.update(providerId, updates),
    onSuccess: () => invalidateProviderQueries(queryClient, providerId, { authConfig: true }),
  });
  const replaceApiKeysMutation = useMutation({
    mutationFn: (apiKeys: ApiKeyEntry[]) => providers.replaceApiKeys(providerId, apiKeys),
    onSuccess: () => invalidateProviderQueries(queryClient, providerId, { apiKeys: true }),
  });

  return {
    apiKeys: apiKeysQuery.data,
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

async function invalidateProviderQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  providerId: string,
  options: { apiKeys?: boolean; authConfig?: boolean },
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.list({ enabled: true }) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.list({ enabled: false }) }),
    ...(options.apiKeys
      ? [queryClient.invalidateQueries({ queryKey: queryKeys.providers.apiKeys(providerId) })]
      : []),
    ...(options.authConfig
      ? [queryClient.invalidateQueries({ queryKey: queryKeys.providers.authConfig(providerId) })]
      : []),
  ]);
}
