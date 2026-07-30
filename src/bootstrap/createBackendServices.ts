import type { CacheService } from '@/backend/data/CacheService';
import type { DbService } from '@/backend/data/db/DbService';
import { PreferenceService } from '@/backend/data/PreferenceService';
import { AssistantService } from '@/backend/data/services/AssistantService';
import { FileEntryService } from '@/backend/data/services/FileEntryService';
import { GroupService } from '@/backend/data/services/GroupService';
import { McpServerService } from '@/backend/data/services/McpServerService';
import { MessageService } from '@/backend/data/services/MessageService';
import { ModelService } from '@/backend/data/services/ModelService';
import { PaintingService } from '@/backend/data/services/PaintingService';
import { PinService } from '@/backend/data/services/PinService';
import { PromptService } from '@/backend/data/services/PromptService';
import { ProviderService } from '@/backend/data/services/ProviderService';
import { TagService } from '@/backend/data/services/TagService';
import { TopicService } from '@/backend/data/services/TopicService';
import { AiService } from '@/backend/ai/AiService';
import { McpService } from '@/backend/ai/mcp';
import { ToolService } from '@/backend/ai/tools';
import { DevicePermissionService } from '@/backend/infrastructure/integrations/devicePermissions';
import { WebSearchService } from '@/backend/infrastructure/integrations/webSearch/WebSearchService';

export type BackendServices = ReturnType<typeof createBackendServices>;

export function createBackendServices(dbService: DbService, cache: CacheService) {
  const preference = new PreferenceService(dbService);
  const devicePermission = new DevicePermissionService();
  const pin = new PinService(dbService);
  const provider = new ProviderService(dbService, pin, cache);
  const model = new ModelService(dbService, preference, pin);
  const tag = new TagService(dbService);
  const group = new GroupService(dbService);
  const prompt = new PromptService(dbService);
  const fileEntry = new FileEntryService(dbService);
  const painting = new PaintingService(dbService, fileEntry);
  const mcpServer = new McpServerService(dbService);
  const mcp = new McpService({ mcpServer });
  const assistant = new AssistantService(dbService, model, preference, tag, pin);
  const topic = new TopicService(dbService, pin, tag);
  const message = new MessageService(dbService, topic, fileEntry);
  const webSearch = new WebSearchService(preference);
  const tools = new ToolService({ devicePermission, mcp, preference, webSearch });
  const ai = new AiService({
    assistant,
    fileEntry,
    model,
    preference,
    provider,
    tools,
  });

  return {
    ai,
    assistant,
    cache,
    devicePermission,
    fileEntry,
    group,
    mcp,
    mcpServer,
    message,
    model,
    painting,
    pin,
    preference,
    prompt,
    provider,
    tag,
    topic,
    tools,
    webSearch,
  };
}
