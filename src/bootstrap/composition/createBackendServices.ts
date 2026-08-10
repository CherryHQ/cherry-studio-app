import { fetch as expoFetch } from 'expo/fetch';

import type { CacheService } from '@/backend/data/CacheService';
import type { DbService } from '@/backend/data/db/DbService';
import { createOAuthFlowRegistry } from '@/backend/services/oauth/authorization/createOAuthFlowRegistry';
import { OAuthApiKeyStore } from '@/backend/services/oauth/authorization/OAuthApiKeyStore';
import { ProviderOAuthService } from '@/backend/services/oauth/authorization/ProviderOAuthService';
import { OAuthRuntimeService } from '@/backend/services/oauth/runtime/OAuthRuntimeService';
import { ProviderAuthConfigOAuthTokenStore } from '@/backend/services/oauth/runtime/OAuthTokenStore';
import { createOAuthProviderDefinitions } from '@/backend/services/oauth/runtime/providerDefinitions';

import { createAiServices } from './createAiServices';
import { createDataServices } from './createDataServices';
import { createPlatformAdapters } from './createPlatformAdapters';

export type BackendServices = ReturnType<typeof createBackendServices>;

export function createBackendServices(dbService: DbService, cache: CacheService) {
  const dataServices = createDataServices({ cache, dbService });
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
    mcpServer: dataServices.mcpServer,
    model: dataServices.model,
    oauth: {
      authenticatedFetch: (...args) => oauthSession.authenticatedFetch(...args),
      getCopilotServingToken: (...args) => registry.copilot.getServingToken(...args),
    },
    preference: dataServices.preference,
    provider: dataServices.provider,
  });

  return {
    ...dataServices,
    ...platformAdapters,
    ...aiServices,
    oauth,
    oauthSession,
  };
}
