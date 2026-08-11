import { fetch as expoFetch } from 'expo/fetch';

import { AiService, type AiServiceDependencies } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import { VertexAuthClient } from '@/backend/ai/provider/VertexAuthClient';
import { ToolResolver } from '@/backend/ai/tools';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import type { DataServices } from './createDataServices';
import type { PlatformAdapters } from './createPlatformAdapters';

type AiServicesDependencies = Pick<
  DataServices,
  'aiUsageRecord' | 'assistant' | 'model' | 'preference' | 'provider'
> &
  Pick<PlatformAdapters, 'devicePermissions' | 'fileContent'> & {
    oauth: AiServiceDependencies['oauth'];
    /** Lifecycle-owned: the host constructs and tears these down; this only wires them. */
    mcpRuntime: McpRuntimeService;
    webSearch: WebSearchService;
  };

export function createAiServices(dependencies: AiServicesDependencies) {
  const { mcpRuntime, webSearch } = dependencies;
  const vertexAuth = new VertexAuthClient({ fetch: expoFetch as typeof globalThis.fetch });
  const toolResolver = new ToolResolver({
    devicePermissions: dependencies.devicePermissions,
    mcpRuntime,
    preference: dependencies.preference,
    webSearch,
  });
  const ai = new AiService({
    assistant: dependencies.assistant,
    aiUsageRecord: dependencies.aiUsageRecord,
    fileContent: dependencies.fileContent,
    model: dependencies.model,
    oauth: dependencies.oauth,
    preference: dependencies.preference,
    provider: dependencies.provider,
    tools: toolResolver,
    vertexAuth,
  });

  return {
    ai,
    mcpRuntime,
    tools: toolResolver,
    webSearch,
  };
}
