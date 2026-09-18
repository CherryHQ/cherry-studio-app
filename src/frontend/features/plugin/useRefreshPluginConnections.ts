import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/frontend/data';

export function useRefreshPluginConnections() {
  const queryClient = useQueryClient();
  return async () => {
    // Only the destination's connection data must be ready before returning to its detail page.
    void queryClient.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        (query.queryKey[0].startsWith('/mcp-servers') || query.queryKey[0].startsWith('/agents')),
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.pluginConnections.all() });
  };
}
