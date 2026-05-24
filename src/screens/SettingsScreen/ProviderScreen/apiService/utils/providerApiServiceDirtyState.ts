import type { EndpointType } from '@/data/types/model';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/data/types/provider';

import { apiKeyEntriesSignature, normalizeApiKeyEntries } from './providerApiServiceApiKeys';
import {
  authConfigSignature,
  buildAuthConfigFromDraft,
  getEffectiveAuthConfig,
  needsAuthConfigSave,
} from './providerApiServiceAuthDraft';
import type { DraftSnapshot } from './providerApiServiceDraft';
import {
  canEditProviderEndpoint,
  mergeEndpointConfigs,
  resolveVisibleEndpointTypes,
} from './providerApiServiceEndpointRules';

export type ProviderApiServiceDirtyState = {
  apiKeyValuesDirty: boolean;
  authDirty: boolean;
  endpointConfigsDirty: boolean;
  isDirty: boolean;
};

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

export function getProviderApiServiceDirtyState({
  apiKeys,
  authConfig,
  draft,
  effectiveAuthConfig,
  provider,
}: {
  apiKeys: readonly ApiKeyEntry[];
  authConfig: AuthConfig | null | undefined;
  draft: DraftSnapshot | null;
  effectiveAuthConfig: AuthConfig | null;
  provider: Provider | undefined;
}): ProviderApiServiceDirtyState {
  if (!provider || !draft) {
    return {
      apiKeyValuesDirty: false,
      authDirty: false,
      endpointConfigsDirty: false,
      isDirty: false,
    };
  }

  const apiKeyValuesDirty = getProviderApiServiceApiKeysDirtyState({ apiKeys, draft });
  const endpointConfigsDirty = getProviderApiServiceEndpointDirtyState({ draft, provider });
  const authDirty = getAuthDirtyState({ authConfig, draft, effectiveAuthConfig, provider });

  return {
    apiKeyValuesDirty,
    authDirty,
    endpointConfigsDirty,
    isDirty: apiKeyValuesDirty || endpointConfigsDirty || authDirty,
  };
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

function getAuthDirtyState({
  authConfig,
  draft,
  effectiveAuthConfig,
  provider,
}: {
  authConfig: AuthConfig | null | undefined;
  draft: DraftSnapshot;
  effectiveAuthConfig: AuthConfig | null;
  provider: Provider;
}): boolean {
  if (!effectiveAuthConfig || !needsAuthConfigSave(draft.authDraft.type)) {
    return false;
  }

  try {
    return (
      authConfigSignature(buildAuthConfigFromDraft(authConfig, provider, draft.authDraft)) !==
      authConfigSignature(getEffectiveAuthConfig(effectiveAuthConfig, provider))
    );
  } catch {
    return true;
  }
}
