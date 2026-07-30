import type { EndpointType } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import {
  getPrimaryEndpoint,
  isConfigurableEndpointType,
  resolveVisibleEndpointTypes,
} from './providerApiServiceEndpointRules';

export type EndpointDraft = {
  baseUrlByEndpoint: Partial<Record<EndpointType, string>>;
  primaryEndpoint: EndpointType;
  visibleEndpointTypes: EndpointType[];
};

export function createEndpointDraft(provider: Provider): EndpointDraft {
  const endpointConfigs = provider.endpointConfigs ?? {};
  const baseUrlByEndpoint = Object.fromEntries(
    Object.entries(endpointConfigs).map(([endpoint, config]) => [endpoint, config.baseUrl ?? '']),
  ) as Partial<Record<EndpointType, string>>;
  const primaryEndpoint = getPrimaryEndpoint(provider);

  return {
    baseUrlByEndpoint: {
      ...baseUrlByEndpoint,
      [primaryEndpoint]: endpointConfigs[primaryEndpoint]?.baseUrl ?? '',
    },
    primaryEndpoint,
    visibleEndpointTypes: resolveVisibleEndpointTypes(provider),
  };
}

export function canAddEndpointToDraft(draft: EndpointDraft, endpoint: EndpointType): boolean {
  return (
    endpoint !== draft.primaryEndpoint &&
    isConfigurableEndpointType(endpoint) &&
    !draft.visibleEndpointTypes.includes(endpoint)
  );
}
