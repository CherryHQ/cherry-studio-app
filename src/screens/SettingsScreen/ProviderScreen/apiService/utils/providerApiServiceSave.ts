import type { ApiKeyEntry, AuthConfig, EndpointConfigs, Provider } from '@/data/types/provider';

import { normalizeApiKeyEntries } from './providerApiServiceApiKeys';
import { buildAuthConfigFromDraft, needsAuthConfigSave } from './providerApiServiceAuthDraft';
import type { DraftSnapshot } from './providerApiServiceDraft';
import {
  canEditProviderEndpoint,
  isValidEndpointBaseUrl,
  mergeEndpointConfigs,
} from './providerApiServiceEndpointRules';

export type ProviderApiServiceProviderUpdates = {
  authConfig?: AuthConfig;
  endpointConfigs?: EndpointConfigs;
};

export type ProviderApiServiceSavePayload = {
  apiKeys: ApiKeyEntry[];
  providerUpdates: ProviderApiServiceProviderUpdates;
};

export class ProviderApiServiceSaveError extends Error {
  constructor(readonly code: 'invalid-base-url' | 'invalid-json') {
    super(code);
  }
}

export function buildProviderApiServiceEndpointUpdates({
  draft,
  provider,
}: {
  draft: DraftSnapshot;
  provider: Provider;
}): Pick<ProviderApiServiceProviderUpdates, 'endpointConfigs'> {
  if (!canEditProviderEndpoint(provider)) {
    return {
      endpointConfigs: provider.endpointConfigs,
    };
  }

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

export function buildProviderApiServiceApiKeysPayload(draft: DraftSnapshot): ApiKeyEntry[] {
  return normalizeApiKeyEntries(draft.apiKeyEntries);
}

export function buildProviderApiServiceSavePayload({
  apiKeys,
  authConfig,
  draft,
  provider,
}: {
  apiKeys: readonly ApiKeyEntry[];
  authConfig: AuthConfig | null | undefined;
  draft: DraftSnapshot;
  provider: Provider;
}): ProviderApiServiceSavePayload {
  const shouldSaveEndpoint = canEditProviderEndpoint(provider);

  if (shouldSaveEndpoint) {
    validateEndpointDraft(draft);
  }

  let nextAuthConfig: AuthConfig | undefined;

  try {
    if (needsAuthConfigSave(draft.authDraft.type)) {
      nextAuthConfig = buildAuthConfigFromDraft(authConfig, provider, draft.authDraft);
    }
  } catch {
    throw new ProviderApiServiceSaveError('invalid-json');
  }

  const nextEndpointConfigs = shouldSaveEndpoint
    ? buildProviderApiServiceEndpointUpdates({ draft, provider }).endpointConfigs
    : provider.endpointConfigs;

  return {
    apiKeys: buildProviderApiServiceApiKeysPayload(draft),
    providerUpdates: {
      ...(nextAuthConfig ? { authConfig: nextAuthConfig } : {}),
      ...(shouldSaveEndpoint ? { endpointConfigs: nextEndpointConfigs } : {}),
    },
  };
}

function validateEndpointDraft(draft: DraftSnapshot) {
  const primaryBaseUrl = draft.baseUrlByEndpoint[draft.primaryEndpoint] ?? '';

  if (primaryBaseUrl.trim() && !isValidEndpointBaseUrl(primaryBaseUrl)) {
    throw new ProviderApiServiceSaveError('invalid-base-url');
  }

  for (const endpoint of draft.visibleEndpointTypes) {
    if (endpoint === draft.primaryEndpoint) {
      continue;
    }

    const baseUrl = draft.baseUrlByEndpoint[endpoint] ?? '';
    if (baseUrl.trim() && !isValidEndpointBaseUrl(baseUrl)) {
      throw new ProviderApiServiceSaveError('invalid-base-url');
    }
  }
}
