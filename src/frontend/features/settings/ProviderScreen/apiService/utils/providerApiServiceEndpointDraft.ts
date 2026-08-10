import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import {
  getConfigurableEndpointTypesForProvider,
  getPrimaryEndpoint,
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
  const visibleEndpointTypes = [
    ...new Set([
      ...resolveVisibleEndpointTypes(provider),
      ...getConfigurableEndpointTypesForProvider(provider),
    ]),
  ];

  return {
    baseUrlByEndpoint: {
      ...baseUrlByEndpoint,
      [primaryEndpoint]: endpointConfigs[primaryEndpoint]?.baseUrl ?? '',
    },
    primaryEndpoint,
    visibleEndpointTypes,
  };
}
