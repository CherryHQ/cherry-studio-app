import { useQuery } from '@/frontend/data';

export function usePluginCatalog() {
  return useQuery('/plugin-catalog', { staleTime: Infinity, retry: false });
}
