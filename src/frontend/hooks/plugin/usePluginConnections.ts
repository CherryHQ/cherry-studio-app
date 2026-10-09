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
