import { AiService } from '@/ai/AiService';
import { McpService } from '@/ai/mcp';
import { ToolService } from '@/ai/tools';
import { cacheService } from '@/data/cache';
import type { DbService } from '@/data/db/DbService';
import { AssistantService } from '@/data/services/AssistantService';
import { FileEntryService } from '@/data/services/FileEntryService';
import { GroupService } from '@/data/services/GroupService';
import { McpServerService } from '@/data/services/McpServerService';
import { MessageService } from '@/data/services/MessageService';
import { ModelService } from '@/data/services/ModelService';
import { PaintingService } from '@/data/services/PaintingService';
import { PinService } from '@/data/services/PinService';
import { PreferenceService } from '@/data/services/PreferenceService';
import { PromptService } from '@/data/services/PromptService';
import { ProviderService } from '@/data/services/ProviderService';
import { TagService } from '@/data/services/TagService';
import { TopicService } from '@/data/services/TopicService';
import { DevicePermissionService } from '@/services/devicePermissions';
import { WebSearchService } from '@/services/webSearch/WebSearchService';

export type DataServices = ReturnType<typeof createDataServices>;

export function createDataServices(dbService: DbService) {
  const preference = new PreferenceService(dbService);
  const devicePermission = new DevicePermissionService();
  const pin = new PinService(dbService);
  const provider = new ProviderService(dbService, pin, cacheService);
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
