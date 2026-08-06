import { AiService } from '@/backend/ai/AiService';
import { McpRuntimeService } from '@/backend/ai/mcp';
import { ToolResolver } from '@/backend/ai/tools';
import { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import type { DataServices } from './createDataServices';
import type { PlatformAdapters } from './createPlatformAdapters';

type AiServicesDependencies = Pick<
  DataServices,
  'aiUsageRecord' | 'assistant' | 'mcpServer' | 'model' | 'preference' | 'provider'
> &
  Pick<PlatformAdapters, 'devicePermissions' | 'fileContent'>;

export function createAiServices(dependencies: AiServicesDependencies) {
  const mcpRuntime = new McpRuntimeService({ mcpServer: dependencies.mcpServer });
  const webSearch = new WebSearchService(dependencies.preference);
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
    preference: dependencies.preference,
    provider: dependencies.provider,
    tools: toolResolver,
  });

  return {
    ai,
    mcpRuntime,
    tools: toolResolver,
    webSearch,
  };
}
