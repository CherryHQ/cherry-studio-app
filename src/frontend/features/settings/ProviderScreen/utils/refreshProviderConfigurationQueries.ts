import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data/queryKeys';

import { refreshProviderModelQueries } from '../models/utils/refreshProviderModelQueries';

export async function refreshProviderConfigurationQueries(
  queryClient: QueryClient,
  providerId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.apiKeys(providerId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.authConfig(providerId) }),
    refreshProviderModelQueries(queryClient, providerId),
  ]);
}
