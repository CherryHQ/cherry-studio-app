import { fetch as expoFetch } from 'expo/fetch';

import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { CacheService } from '@/backend/data/CacheService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { createOAuthFlowRegistry } from '@/backend/services/oauth/authorization/createOAuthFlowRegistry';
import { OAuthApiKeyStore } from '@/backend/services/oauth/authorization/OAuthApiKeyStore';
import { ProviderOAuthService } from '@/backend/services/oauth/authorization/ProviderOAuthService';
import { OAuthRuntimeService } from '@/backend/services/oauth/runtime/OAuthRuntimeService';
import { ProviderAuthConfigOAuthTokenStore } from '@/backend/services/oauth/runtime/OAuthTokenStore';
import { createOAuthProviderDefinitions } from '@/backend/services/oauth/runtime/providerDefinitions';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import { createAiServices } from './createAiServices';
import { createDataServices } from './createDataServices';
import { createPlatformAdapters } from './createPlatformAdapters';

export type BackendServices = ReturnType<typeof createBackendServices>;

/**
 * Services the host owns. Named rather than positional because they are all
 * opaque service instances, and a positional list of those is a swap waiting to
 * happen. This shrinks as stage B moves modules into the registry: every entry
 * here is one the composition still has to be handed rather than resolve.
 */
export type BackendInfrastructure = {
  cache: CacheService;
  mcpRuntime: McpRuntimeService;
  preference: PreferenceService;
  webSearch: WebSearchService;
};

export function createBackendServices({
  cache,
  mcpRuntime,
  preference,
  webSearch,
}: BackendInfrastructure) {
  const dataServices = createDataServices({ cache, preference });
  const platformAdapters = createPlatformAdapters({
    fileEntry: dataServices.fileEntry,
    fileRef: dataServices.fileRef,
  });
  const fetch = expoFetch as typeof globalThis.fetch;
  const providers = {
    listApiKeys: (providerId: string) => dataServices.provider.listApiKeys(providerId),
    replaceApiKeys: (
      providerId: string,
      keys: Parameters<typeof dataServices.provider.replaceApiKeys>[1],
    ) => dataServices.provider.replaceApiKeys(providerId, keys),
    update: (providerId: string, input: { isEnabled?: boolean }) =>
      dataServices.provider.update(providerId, input),
  };
  const tokenStore = new ProviderAuthConfigOAuthTokenStore({
    getAuthConfig: (providerId) => dataServices.provider.getAuthConfig(providerId),
    update: (providerId, input) => dataServices.provider.update(providerId, input),
  });
  const apiKeys = new OAuthApiKeyStore(providers);
  const definitions = createOAuthProviderDefinitions(fetch);
  const oauthSession = new OAuthRuntimeService({
    apiKeys,
    definitions,
    fetch,
    providers,
    tokenStore,
  });
  const registry = createOAuthFlowRegistry({
    apiKeys,
    definitions,
    fetch,
    providers,
    runtime: oauthSession,
    tokenStore,
  });
  const oauth = new ProviderOAuthService(registry.registry);
  const aiServices = createAiServices({
    aiUsageRecord: dataServices.aiUsageRecord,
    assistant: dataServices.assistant,
    devicePermissions: platformAdapters.devicePermissions,
    fileContent: platformAdapters.fileContent,
    mcpRuntime,
    model: dataServices.model,
    oauth: {
      authenticatedFetch: (...args) => oauthSession.authenticatedFetch(...args),
      getCopilotServingToken: (...args) => registry.copilot.getServingToken(...args),
    },
    preference: dataServices.preference,
    provider: dataServices.provider,
    webSearch,
  });

  return {
    ...dataServices,
    ...platformAdapters,
    ...aiServices,
    oauth,
    oauthSession,
  };
}
