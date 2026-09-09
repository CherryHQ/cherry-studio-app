import { useQueryClient } from '@tanstack/react-query';

import { queryKeys, useQuery } from '@/frontend/data';

export function usePluginConnections() {
  return useQuery('/plugin-connections', { retry: false });
}

export function useRefreshPluginConnections() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.pluginConnections.all() }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          (query.queryKey[0].startsWith('/mcp-servers') || query.queryKey[0].startsWith('/agents')),
      }),
    ]);
  };
}
