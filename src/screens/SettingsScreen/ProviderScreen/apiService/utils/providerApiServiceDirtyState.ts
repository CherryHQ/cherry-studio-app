import type { EndpointType } from '@/data/types/model';
import type { ApiKeyEntry, Provider } from '@/data/types/provider';

import { apiKeyEntriesSignature, normalizeApiKeyEntries } from './providerApiServiceApiKeys';
import type { DraftSnapshot } from './providerApiServiceDraft';
import {
  canEditProviderEndpoint,
  mergeEndpointConfigs,
  resolveVisibleEndpointTypes,
} from './providerApiServiceEndpointRules';

export function getProviderApiServiceEndpointDirtyState({
  draft,
  provider,
}: {
  draft: DraftSnapshot | null;
  provider: Provider | undefined;
}): boolean {
  if (!provider || !draft || !canEditProviderEndpoint(provider)) {
    return false;
  }

  return (
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
  draft,
}: {
  apiKeys: readonly ApiKeyEntry[];
  draft: DraftSnapshot | null;
}): boolean {
  if (!draft) {
    return false;
  }

  return (
    apiKeyEntriesSignature(draft.apiKeyEntries) !==
    apiKeyEntriesSignature(normalizeApiKeyEntries(apiKeys))
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

function getPersistableEndpointTypes(draft: DraftSnapshot, provider: Provider): EndpointType[] {
  return draft.visibleEndpointTypes.filter((endpoint) => {
    if (endpoint === draft.primaryEndpoint) {
      return true;
    }

    return Boolean(
      draft.baseUrlByEndpoint[endpoint]?.trim() || provider.endpointConfigs?.[endpoint],
    );
  });
}
