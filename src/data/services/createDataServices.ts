import { AiService } from '@/ai/AiService';
import { McpService } from '@/ai/mcp';
import { cacheService } from '@/data/cache';
import type { DbService } from '@/data/db/DbService';
import { WebSearchService } from '@/services/webSearch/WebSearchService';

import { AssistantService } from './AssistantService';
import { FileEntryService } from './FileEntryService';
import { GroupService } from './GroupService';
import { McpServerService } from './McpServerService';
import { MessageService } from './MessageService';
import { ModelService } from './ModelService';
import { PaintingService } from './PaintingService';
import { PinService } from './PinService';
import { PreferenceService } from './PreferenceService';
import { PromptService } from './PromptService';
import { ProviderService } from './ProviderService';
import { TagService } from './TagService';
import { TopicService } from './TopicService';

export type DataServices = ReturnType<typeof createDataServices>;

export function createDataServices(dbService: DbService) {
  const preference = new PreferenceService(dbService);
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
  const assistant = new AssistantService(dbService, model, preference, tag, pin, mcpServer);
  const topic = new TopicService(dbService, pin, tag);
  const message = new MessageService(dbService, topic, fileEntry);
  const webSearch = new WebSearchService(preference);
  const ai = new AiService({ assistant, fileEntry, mcp, model, preference, provider, webSearch });

  return {
    ai,
    assistant,
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
    webSearch,
  };
}
