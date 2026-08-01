import { useCallback, useState } from 'react';

import type { EndpointType } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  canAddEndpointToDraft,
  canUseEndpointAsPrimary,
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

  const updatePrimaryEndpoint = useCallback((endpoint: EndpointType) => {
    setDraft((current) =>
      canUseEndpointAsPrimary(current, endpoint)
        ? { ...current, primaryEndpoint: endpoint }
        : current,
    );
  }, []);

  return {
    addEndpoint,
    draft,
    removeEndpoint,
    updateBaseUrl,
    updatePrimaryEndpoint,
  };
}
