import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { CacheService } from '@/backend/data/CacheService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { COPILOT_PROVIDER_ID } from '@/backend/services/oauth/authorization/adapters/CopilotOAuthAdapter';
import type { ProviderOAuthService } from '@/backend/services/oauth/authorization/ProviderOAuthService';
import type { OAuthRuntimeService } from '@/backend/services/oauth/runtime/OAuthRuntimeService';
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
  oauth: ProviderOAuthService;
  oauthSession: OAuthRuntimeService;
  preference: PreferenceService;
  webSearch: WebSearchService;
};

export function createBackendServices({
  cache,
  mcpRuntime,
  oauth,
  oauthSession,
  preference,
  webSearch,
}: BackendInfrastructure) {
  const dataServices = createDataServices({ cache, preference });
  const platformAdapters = createPlatformAdapters({
    fileEntry: dataServices.fileEntry,
    fileRef: dataServices.fileRef,
  });
  const aiServices = createAiServices({
    aiUsageRecord: dataServices.aiUsageRecord,
    assistant: dataServices.assistant,
    devicePermissions: platformAdapters.devicePermissions,
    fileContent: platformAdapters.fileContent,
    mcpRuntime,
    model: dataServices.model,
    oauth: {
      authenticatedFetch: (...args) => oauthSession.authenticatedFetch(...args),
      // The provider name lives here, in the composition, rather than in the
      // OAuth module: its README keeps the generic runtime and public contract
      // free of provider names.
      getCopilotServingToken: (headers, signal) =>
        oauth.getServingToken(COPILOT_PROVIDER_ID, headers, signal),
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
