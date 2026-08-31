import { useQuery } from '@/frontend/data';

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
  return {
    models: modelsQuery.data ?? [],
    modelsQuery,
    provider,
    providerQuery,
  };
}
