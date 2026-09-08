import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useBackendModule } from '@/frontend/data';

export const PLUGIN_CONNECTIONS_QUERY_KEY = ['plugin-connections'] as const;

export function usePluginConnections() {
  const plugins = useBackendModule('plugins');
  return useQuery({
    queryKey: PLUGIN_CONNECTIONS_QUERY_KEY,
    queryFn: () => plugins.listConnections(),
    retry: false,
  });
}

export function useRefreshPluginConnections() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PLUGIN_CONNECTIONS_QUERY_KEY }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          (query.queryKey[0].startsWith('/mcp-servers') || query.queryKey[0].startsWith('/agents')),
      }),
    ]);
  };
}
