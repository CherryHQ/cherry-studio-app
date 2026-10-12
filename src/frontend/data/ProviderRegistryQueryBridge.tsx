import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useBackendModule } from './BackendProvider';
import { queryKeys } from './queryKeys';

/** Keep mounted model projections in sync when a validated registry snapshot becomes active. */
export function ProviderRegistryQueryBridge() {
  const providers = useBackendModule('providers');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!providers?.subscribeRegistryUpdates) {
      return;
    }

    const unsubscribe = providers.subscribeRegistryUpdates(() => {
      queryClient.setQueryData(queryKeys.providers.registryReady(), true);
      void queryClient.invalidateQueries({
        predicate: (query) => isRegistryProjectionPath(query.queryKey[0]),
      });
    });
    return () => {
      unsubscribe();
      queryClient.removeQueries({ queryKey: queryKeys.providers.registryReady() });
    };
  }, [providers, queryClient]);

  return null;
}

// An Agent record carries its model's display name, which falls back to the raw
// model id until the registry is active. Sub-resources such as tool bindings do not.
const AGENT_RECORD_PATH = /^\/agents(\/[^/]+)?$/;

export function isRegistryProjectionPath(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return (
    value === 'onboarding-models' ||
    value === '/models' ||
    value.startsWith('/models/') ||
    AGENT_RECORD_PATH.test(value) ||
    (value.startsWith('/providers/') &&
      (value.includes('/models:resolve') || value.includes('/image-generation-support')))
  );
}
