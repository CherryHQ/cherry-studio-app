import type { MobileAgentHost } from '@/backend/ai/agent/host/MobileAgentHost';
import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { CacheService } from '@/backend/data/CacheService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { fileContent } from '@/backend/services/file/fileContent';
import type { JobRuntime } from '@/backend/services/jobs/JobRuntime';
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
  agent: MobileAgentHost;
  ai: AiService;
  cache: CacheService;
  jobRuntime: JobRuntime;
  mcpRuntime: McpRuntimeService;
  preference: PreferenceService;
  webSearch: WebSearchService;
};

export function createBackendServices({
  agent,
  ai,
  cache,
  jobRuntime,
  mcpRuntime,
  preference,
  webSearch,
}: BackendInfrastructure) {
  return {
    ...createDataServices({ cache, preference }),
    agent,
    ai,
    // Module singletons, spread here only so the routing table reads one object.
    devicePermissions,
    fileContent,
    jobRuntime,
    mcpRuntime,
    webSearch,
  };
}
