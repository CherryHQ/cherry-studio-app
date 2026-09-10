import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys, useQuery, useBackendModule } from '@/frontend/data';

export function usePluginConnections() {
  const plugins = useBackendModule('plugins');
  const queryClient = useQueryClient();
  useEffect(
    () =>
      plugins.observeConnections(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.pluginConnections.all() });
      }),
    [plugins, queryClient],
  );
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
