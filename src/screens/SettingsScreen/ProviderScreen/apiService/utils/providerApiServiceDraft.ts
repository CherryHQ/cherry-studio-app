import type { EndpointType } from '@/data/types/model';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/data/types/provider';

import {
  apiKeyEntriesSignature,
  cloneApiKeyEntries,
  formatApiKeysInput,
  normalizeApiKeyEntries,
} from './providerApiServiceApiKeys';
import {
  type AuthDraft,
  createAuthDraft,
  getEffectiveAuthConfig,
} from './providerApiServiceAuthDraft';
import {
  getPrimaryEndpoint,
  isConfigurableEndpointType,
  resolveVisibleEndpointTypes,
} from './providerApiServiceEndpointRules';

export type DraftSnapshot = {
  apiKeyEntries: ApiKeyEntry[];
  apiKeysInput: string;
  apiKeysBaselineSignature: string;
  authDraft: AuthDraft;
  baseUrlByEndpoint: Partial<Record<EndpointType, string>>;
  primaryEndpoint: EndpointType;
  visibleEndpointTypes: EndpointType[];
};

function createBaseUrlDraft(provider: Provider): Partial<Record<EndpointType, string>> {
  const endpointConfigs = provider.endpointConfigs ?? {};
  const baseUrlByEndpoint = Object.fromEntries(
    Object.entries(endpointConfigs).map(([endpoint, config]) => [endpoint, config.baseUrl ?? '']),
  ) as Partial<Record<EndpointType, string>>;
  const primaryEndpoint = getPrimaryEndpoint(provider);

  return {
    ...baseUrlByEndpoint,
    [primaryEndpoint]: provider.endpointConfigs?.[primaryEndpoint]?.baseUrl ?? '',
  };
}

export function createDraftSnapshot(
  provider: Provider,
  apiKeys: readonly ApiKeyEntry[],
  authConfig: AuthConfig | null | undefined,
): DraftSnapshot {
  const normalizedApiKeys = normalizeApiKeyEntries(apiKeys);
  return {
    apiKeyEntries: cloneApiKeyEntries(normalizedApiKeys),
    apiKeysInput: formatApiKeysInput(normalizedApiKeys),
    apiKeysBaselineSignature: apiKeyEntriesSignature(normalizedApiKeys),
    authDraft: createAuthDraft(getEffectiveAuthConfig(authConfig, provider)),
    baseUrlByEndpoint: createBaseUrlDraft(provider),
    primaryEndpoint: getPrimaryEndpoint(provider),
    visibleEndpointTypes: resolveVisibleEndpointTypes(provider),
  };
}

export function getBaseUrlForEndpoint(snapshot: DraftSnapshot, endpoint: EndpointType): string {
  return snapshot.baseUrlByEndpoint[endpoint] ?? '';
}

export function canAddEndpointToDraft(snapshot: DraftSnapshot, endpoint: EndpointType): boolean {
  return (
    endpoint !== snapshot.primaryEndpoint &&
    isConfigurableEndpointType(endpoint) &&
    !snapshot.visibleEndpointTypes.includes(endpoint)
  );
}
