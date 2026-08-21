import type { EndpointType } from '@/shared/data/types/model';
import type { EndpointConfigs, Provider } from '@/shared/data/types/provider';

import type { EndpointDraft } from './providerApiServiceEndpointDraft';
import {
  getPrimaryEndpoint,
  isValidEndpointBaseUrl,
  mergeEndpointConfigs,
} from './providerApiServiceEndpointRules';

export class ProviderApiServiceSaveError extends Error {
  constructor(readonly code: 'invalid-base-url') {
    super(code);
  }
}

export function buildProviderApiServiceEndpointUpdates({
  draft,
  provider,
}: {
  draft: EndpointDraft;
  provider: Provider;
}): { defaultChatEndpoint: EndpointType; endpointConfigs: EndpointConfigs } {
  validateEndpointDraft(draft);

  return {
    defaultChatEndpoint: draft.primaryEndpoint,
    endpointConfigs: mergeEndpointConfigs(
      provider.endpointConfigs,
      draft.baseUrlByEndpoint,
      draft.visibleEndpointTypes,
    ),
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

function validateEndpointDraft(draft: EndpointDraft) {
  for (const endpoint of new Set([draft.primaryEndpoint, ...draft.visibleEndpointTypes])) {
    const baseUrl = draft.baseUrlByEndpoint[endpoint] ?? '';

    if (baseUrl.trim() && !isValidEndpointBaseUrl(baseUrl)) {
      throw new ProviderApiServiceSaveError('invalid-base-url');
    }
  }
}
