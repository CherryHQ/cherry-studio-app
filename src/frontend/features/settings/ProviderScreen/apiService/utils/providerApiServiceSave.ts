import type { EndpointType } from '@cherrystudio/shared/data/types/model';
import type { EndpointConfigs, Provider } from '@cherrystudio/shared/data/types/provider';

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
}): { defaultChatEndpoint: EndpointType; endpointConfigs: EndpointConfigs } {
  validateEndpointDraft(draft);

  return {
    defaultChatEndpoint: draft.primaryEndpoint,
    endpointConfigs: mergeEndpointConfigs(
      provider.endpointConfigs,
      draft.baseUrlByEndpoint,
      draft.primaryEndpoint,
      draft.visibleEndpointTypes,
    ),
  };
}

function validateEndpointDraft(draft: EndpointDraft) {
  const primaryBaseUrl = draft.baseUrlByEndpoint[draft.primaryEndpoint]?.trim() ?? '';
  if (!primaryBaseUrl || !isValidEndpointBaseUrl(primaryBaseUrl)) {
    throw new ProviderApiServiceSaveError('invalid-base-url');
  }

  for (const endpoint of new Set([draft.primaryEndpoint, ...draft.visibleEndpointTypes])) {
    const baseUrl = draft.baseUrlByEndpoint[endpoint] ?? '';

    if (baseUrl.trim() && !isValidEndpointBaseUrl(baseUrl)) {
      throw new ProviderApiServiceSaveError('invalid-base-url');
    }
  }
}
