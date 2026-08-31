import type { EndpointType } from '@/shared/data/types/model';
import type { EndpointConfigs, Provider } from '@/shared/data/types/provider';

import { getPrimaryEndpoint, isValidEndpointBaseUrl } from './providerApiServiceEndpointRules';

export class ProviderApiServiceSaveError extends Error {
  constructor(readonly code: 'invalid-base-url') {
    super(code);
  }
}

export function buildProviderPrimaryBaseUrlUpdates({
  baseUrl,
  provider,
}: {
  baseUrl: string;
  provider: Provider;
}): { defaultChatEndpoint: EndpointType; endpointConfigs: EndpointConfigs } {
  const trimmedBaseUrl = baseUrl.trim();
  if (trimmedBaseUrl && !isValidEndpointBaseUrl(trimmedBaseUrl)) {
    throw new ProviderApiServiceSaveError('invalid-base-url');
  }

  const primaryEndpoint = getPrimaryEndpoint(provider);
  const endpointConfigs: EndpointConfigs = { ...provider.endpointConfigs };
  const primaryConfig = { ...endpointConfigs[primaryEndpoint] };

  if (trimmedBaseUrl) {
    endpointConfigs[primaryEndpoint] = { ...primaryConfig, baseUrl: trimmedBaseUrl };
  } else {
    delete primaryConfig.baseUrl;
    if (Object.keys(primaryConfig).length > 0) {
      endpointConfigs[primaryEndpoint] = primaryConfig;
    } else {
      delete endpointConfigs[primaryEndpoint];
    }
  }

  return {
    defaultChatEndpoint: primaryEndpoint,
    endpointConfigs,
  };
}
