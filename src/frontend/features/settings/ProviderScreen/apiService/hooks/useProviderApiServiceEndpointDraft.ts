import { useCallback, useState } from 'react';

import type { EndpointType } from '@/shared/domain/model';
import type { Provider } from '@/shared/domain/provider';

import {
  canAddEndpointToDraft,
  createEndpointDraft,
  type EndpointDraft,
} from '../utils/providerApiServiceEndpointDraft';

/**
 * Endpoint editing state, owned by the mounted endpoint form. The caller passes a
 * loaded provider, so the draft is ready on the first frame and dies with the form —
 * saved values come back through the provider query, never through this state.
 */
export function useProviderApiServiceEndpointDraft(provider: Provider) {
  const [draft, setDraft] = useState<EndpointDraft>(() => createEndpointDraft(provider));

  const updateBaseUrl = useCallback((endpoint: EndpointType, value: string) => {
    setDraft((current) => ({
      ...current,
      baseUrlByEndpoint: {
        ...current.baseUrlByEndpoint,
        [endpoint]: value,
      },
    }));
  }, []);

  const addEndpoint = useCallback((endpoint: EndpointType) => {
    setDraft((current) =>
      canAddEndpointToDraft(current, endpoint)
        ? {
            ...current,
            baseUrlByEndpoint: {
              ...current.baseUrlByEndpoint,
              [endpoint]: current.baseUrlByEndpoint[endpoint] ?? '',
            },
            visibleEndpointTypes: [...current.visibleEndpointTypes, endpoint],
          }
        : current,
    );
  }, []);

  const removeEndpoint = useCallback((endpoint: EndpointType) => {
    setDraft((current) => {
      if (endpoint === current.primaryEndpoint) {
        return current;
      }

      const { [endpoint]: _removedBaseUrl, ...baseUrlByEndpoint } = current.baseUrlByEndpoint;

      return {
        ...current,
        baseUrlByEndpoint,
        visibleEndpointTypes: current.visibleEndpointTypes.filter((item) => item !== endpoint),
      };
    });
  }, []);

  return {
    addEndpoint,
    draft,
    removeEndpoint,
    updateBaseUrl,
  };
}
