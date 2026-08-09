import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { useCallback, useState } from 'react';

import { createEndpointDraft, type EndpointDraft } from '../utils/providerApiServiceEndpointDraft';

/**
 * Endpoint editing state, owned by the mounted endpoint form. The caller passes a
 * loaded provider, so the draft is ready on the first frame and dies with the form —
 * saved values come back through the provider query, never through this state.
 */
export function useProviderApiServiceEndpointDraft(provider: Provider) {
  const [draft, setDraft] = useState<EndpointDraft>(() => createEndpointDraft(provider));

  const updateBaseUrl = useCallback((endpoint: EndpointType, value: string) => {
    setDraft((current) => {
      if (current.baseUrlByEndpoint[endpoint] === value) {
        return current;
      }

      return {
        ...current,
        baseUrlByEndpoint: {
          ...current.baseUrlByEndpoint,
          [endpoint]: value,
        },
      };
    });
  }, []);

  const updatePrimaryEndpoint = useCallback((endpoint: EndpointType) => {
    setDraft((current) => {
      if (current.primaryEndpoint === endpoint) {
        return current;
      }

      return { ...current, primaryEndpoint: endpoint };
    });
  }, []);

  return {
    draft,
    updateBaseUrl,
    updatePrimaryEndpoint,
  };
}
