import type { EndpointType } from '@cherrystudio/shared/data/types/model';
import type { ApiKeyEntry, Provider } from '@cherrystudio/shared/data/types/provider';

import { apiKeyEntriesSignature, normalizeApiKeyEntries } from './providerApiServiceApiKeys';
import type { EndpointDraft } from './providerApiServiceEndpointDraft';
import {
  canEditProviderEndpoint,
  getPrimaryEndpoint,
  mergeEndpointConfigs,
  resolveVisibleEndpointTypes,
} from './providerApiServiceEndpointRules';

export function getProviderApiServiceEndpointDirtyState({
  draft,
  provider,
}: {
  draft: EndpointDraft | null;
  provider: Provider | undefined;
}): boolean {
  if (!provider || !draft || !canEditProviderEndpoint(provider)) {
    return false;
  }

  return (
    draft.primaryEndpoint !== getPrimaryEndpoint(provider) ||
    endpointVisibilitySignature(getPersistableEndpointTypes(draft, provider)) !==
      endpointVisibilitySignature(resolveVisibleEndpointTypes(provider)) ||
    endpointConfigsSignature(
      mergeEndpointConfigs(
        provider.endpointConfigs,
        draft.baseUrlByEndpoint,
        draft.primaryEndpoint,
        getPersistableEndpointTypes(draft, provider),
      ),
    ) !== endpointConfigsSignature(provider.endpointConfigs)
  );
}

export function getProviderApiServiceApiKeysDirtyState({
  apiKeys,
  entries,
}: {
  apiKeys: readonly ApiKeyEntry[];
  entries: readonly ApiKeyEntry[];
}): boolean {
  return (
    apiKeyEntriesSignature(entries) !== apiKeyEntriesSignature(normalizeApiKeyEntries(apiKeys))
  );
}

export function endpointConfigsSignature(endpointConfigs: Provider['endpointConfigs']): string {
  return JSON.stringify(
    Object.entries(endpointConfigs ?? {})
      .map(([endpoint, config]) => ({ config, endpoint }))
      .sort((left, right) => left.endpoint.localeCompare(right.endpoint)),
  );
}

export function endpointVisibilitySignature(endpointTypes: readonly string[]): string {
  return JSON.stringify([...endpointTypes].sort());
}

function getPersistableEndpointTypes(draft: EndpointDraft, provider: Provider): EndpointType[] {
  return draft.visibleEndpointTypes.filter((endpoint) => {
    if (endpoint === draft.primaryEndpoint) {
      return true;
    }

    return Boolean(
      draft.baseUrlByEndpoint[endpoint]?.trim() || provider.endpointConfigs?.[endpoint],
    );
  });
}
