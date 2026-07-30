import { AiService } from '@/backend/infrastructure/ai/AiService';
import { McpService } from '@/backend/infrastructure/ai/mcp';
import { ToolService } from '@/backend/infrastructure/ai/tools';
import { cacheService } from '@/backend/infrastructure/cache';
import type { DbService } from '@/backend/infrastructure/db/DbService';
import { DevicePermissionService } from '@/backend/infrastructure/integrations/devicePermissions';
import { WebSearchService } from '@/backend/infrastructure/integrations/webSearch/WebSearchService';
import { AssistantService } from '@/backend/infrastructure/services/AssistantService';
import { FileEntryService } from '@/backend/infrastructure/services/FileEntryService';
import { GroupService } from '@/backend/infrastructure/services/GroupService';
import { McpServerService } from '@/backend/infrastructure/services/McpServerService';
import { MessageService } from '@/backend/infrastructure/services/MessageService';
import { ModelService } from '@/backend/infrastructure/services/ModelService';
import { PaintingService } from '@/backend/infrastructure/services/PaintingService';
import { PinService } from '@/backend/infrastructure/services/PinService';
import { PreferenceService } from '@/backend/infrastructure/services/PreferenceService';
import { PromptService } from '@/backend/infrastructure/services/PromptService';
import { ProviderService } from '@/backend/infrastructure/services/ProviderService';
import { TagService } from '@/backend/infrastructure/services/TagService';
import { TopicService } from '@/backend/infrastructure/services/TopicService';

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
