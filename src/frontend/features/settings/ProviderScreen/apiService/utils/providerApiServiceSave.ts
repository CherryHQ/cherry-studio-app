import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import type { EndpointConfigs, Provider } from '@cherrystudio/universal/data/types/provider';

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
  if (!isValidEndpointBaseUrl(trimmedBaseUrl)) {
    throw new ProviderApiServiceSaveError('invalid-base-url');
  }

  const primaryEndpoint = getPrimaryEndpoint(provider);

  return {
    defaultChatEndpoint: primaryEndpoint,
    endpointConfigs: {
      ...provider.endpointConfigs,
      [primaryEndpoint]: {
        ...provider.endpointConfigs?.[primaryEndpoint],
        baseUrl: trimmedBaseUrl,
      },
    },
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
