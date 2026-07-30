import type { EndpointConfigs, Provider } from '@/shared/domain/provider';

import type { EndpointDraft } from './providerApiServiceEndpointDraft';
import { isValidEndpointBaseUrl, mergeEndpointConfigs } from './providerApiServiceEndpointRules';

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
}): { endpointConfigs: EndpointConfigs } {
  validateEndpointDraft(draft);

  return {
    endpointConfigs: mergeEndpointConfigs(
      provider.endpointConfigs,
      draft.baseUrlByEndpoint,
      draft.primaryEndpoint,
      draft.visibleEndpointTypes,
    ),
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
