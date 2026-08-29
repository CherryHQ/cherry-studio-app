import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useBackendModule } from './BackendProvider';

/** Keep mounted model projections in sync when a validated registry snapshot becomes active. */
export function ProviderRegistryQueryBridge() {
  const providers = useBackendModule('providers');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!providers?.subscribeRegistryUpdates) {
      return;
    }

    return providers.subscribeRegistryUpdates(() => {
      void queryClient.invalidateQueries({
        predicate: (query) => isRegistryProjectionPath(query.queryKey[0]),
      });
    });
  }, [providers, queryClient]);

  return null;
}

function isRegistryProjectionPath(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return (
    value === '/models' ||
    value.startsWith('/models/') ||
    (value.startsWith('/providers/') &&
      (value.includes('/models:resolve') || value.includes('/image-generation-support')))
  );
}
