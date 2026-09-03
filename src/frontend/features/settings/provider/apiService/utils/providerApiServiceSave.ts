import type { EndpointType } from '@/shared/data/types/model';
import type { EndpointConfigs, Provider } from '@/shared/data/types/provider';

import {
  CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES,
  type CustomProviderTextEndpoint,
  getPrimaryEndpoint,
  hasConfiguredCustomProviderTextEndpoint,
  isValidEndpointBaseUrl,
  normalizeCustomProviderDefaultEndpoint,
} from './providerApiServiceEndpointRules';

export class ProviderApiServiceSaveError extends Error {
  constructor(readonly code: 'invalid-base-url' | 'missing-text-endpoint') {
    super(code);
    this.name = 'ProviderApiServiceSaveError';
  }
}

export function buildProviderTextEndpointUpdates({
  defaultChatEndpoint,
  endpointUrls,
  provider,
}: {
  defaultChatEndpoint: EndpointType;
  endpointUrls: Partial<Record<EndpointType, string>>;
  provider: Provider;
}): {
  defaultChatEndpoint: CustomProviderTextEndpoint;
  endpointConfigs: EndpointConfigs;
} {
  if (!hasConfiguredCustomProviderTextEndpoint(endpointUrls)) {
    throw new ProviderApiServiceSaveError('missing-text-endpoint');
  }

  const endpointConfigs: EndpointConfigs = { ...provider.endpointConfigs };
  for (const endpointType of CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES) {
    const baseUrl = endpointUrls[endpointType]?.trim() ?? '';
    if (baseUrl && !isValidEndpointBaseUrl(baseUrl)) {
      throw new ProviderApiServiceSaveError('invalid-base-url');
    }

    if (baseUrl) {
      endpointConfigs[endpointType] = {
        ...endpointConfigs[endpointType],
        baseUrl,
      };
    } else {
      delete endpointConfigs[endpointType];
    }
  }

  return {
    defaultChatEndpoint: normalizeCustomProviderDefaultEndpoint(endpointUrls, defaultChatEndpoint),
    endpointConfigs,
  };
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
