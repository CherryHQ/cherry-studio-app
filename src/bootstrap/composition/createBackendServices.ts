import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { ChatRuntime } from '@/backend/ai/streamManager/ChatRuntime';
import type { CacheService } from '@/backend/data/CacheService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { fileContent } from '@/backend/services/file/fileContent';
import type { JobRuntime } from '@/backend/services/jobs/JobRuntime';
import type { ModelCatalogService } from '@/backend/services/models/ModelCatalogService';
import type { ProviderOAuthService } from '@/backend/services/oauth/authorization/ProviderOAuthService';
import type { OAuthRuntimeService } from '@/backend/services/oauth/runtime/OAuthRuntimeService';
import { devicePermissions } from '@/backend/services/permissions';
import type { ProviderSetupService } from '@/backend/services/providers/ProviderSetupService';
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
  chat: ChatRuntime;
  jobRuntime: JobRuntime;
  mcpRuntime: McpRuntimeService;
  modelCatalog: ModelCatalogService;
  oauth: ProviderOAuthService;
  oauthSession: OAuthRuntimeService;
  preference: PreferenceService;
  providerSetup: ProviderSetupService;
  webSearch: WebSearchService;
};

export function createBackendServices({
  ai,
  cache,
  chat,
  jobRuntime,
  mcpRuntime,
  modelCatalog,
  oauth,
  oauthSession,
  preference,
  providerSetup,
  webSearch,
}: BackendInfrastructure) {
  return {
    ...createDataServices({ cache, preference }),
    ai,
    chat,
    // Module singletons, spread here only so the routing table reads one object.
    devicePermissions,
    fileContent,
    jobRuntime,
    mcpRuntime,
    modelCatalog,
    oauth,
    oauthSession,
    providerSetup,
    webSearch,
  };
}
