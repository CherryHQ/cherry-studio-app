import { AiService } from '@/ai/AiService';
import type { DbService } from '@/data/db/DbService';
import { WebSearchService } from '@/services/webSearch/WebSearchService';

import { AssistantService } from './AssistantService';
import { GroupService } from './GroupService';
import { MessageService } from './MessageService';
import { ModelService } from './ModelService';
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
  const provider = new ProviderService(dbService, pin);
  const model = new ModelService(dbService);
  const tag = new TagService(dbService);
  const group = new GroupService(dbService);
  const prompt = new PromptService(dbService);
  const assistant = new AssistantService(dbService, model, preference, tag, pin);
  const topic = new TopicService(dbService, pin, tag);
  const message = new MessageService(dbService, topic);
  const webSearch = new WebSearchService(preference);
  const ai = new AiService({ assistant, model, preference, provider, webSearch });

  return {
    ai,
    assistant,
    group,
    message,
    model,
    pin,
    preference,
    prompt,
    provider,
    tag,
    topic,
    webSearch,
  };
}
