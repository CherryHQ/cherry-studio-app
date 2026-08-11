import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { CacheService } from '@/backend/data/CacheService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { fileContent } from '@/backend/services/file/fileContent';
import type { ProviderOAuthService } from '@/backend/services/oauth/authorization/ProviderOAuthService';
import type { OAuthRuntimeService } from '@/backend/services/oauth/runtime/OAuthRuntimeService';
import { devicePermissions } from '@/backend/services/permissions';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import { createDataServices } from './createDataServices';

export type BackendServices = ReturnType<typeof createBackendServices>;

/**
 * Services the host owns. Named rather than positional because they are all
 * opaque service instances, and a positional list of those is a swap waiting to
 * happen. This shrinks as stage B moves modules into the registry: every entry
 * here is one the composition still has to be handed rather than resolve.
 */
export type BackendInfrastructure = {
  ai: AiService;
  cache: CacheService;
  mcpRuntime: McpRuntimeService;
  oauth: ProviderOAuthService;
  oauthSession: OAuthRuntimeService;
  preference: PreferenceService;
  webSearch: WebSearchService;
};

export function createBackendServices({
  ai,
  cache,
  mcpRuntime,
  oauth,
  oauthSession,
  preference,
  webSearch,
}: BackendInfrastructure) {
  return {
    ...createDataServices({ cache, preference }),
    ai,
    // Module singletons, spread here only so the routing table reads one object.
    devicePermissions,
    fileContent,
    mcpRuntime,
    oauth,
    oauthSession,
    webSearch,
  };
}
