import type { ApiImplementation } from '@/shared/data/api/types';
import type { AssistantService } from '../../services/AssistantService';
import type { FileEntryService } from '../../services/FileEntryService';
import type { MessageService } from '../../services/MessageService';
import type { PinService } from '../../services/PinService';
import type { TopicService } from '../../services/TopicService';
import { createAssistantHandlers } from './assistants';
import { createFileHandlers } from './files';
import { createMcpServerHandlers, type McpServerData } from './mcpServers';
import { createMessageHandlers } from './messages';
import { createModelHandlers, type ModelData } from './models';
import { createPaintingHandlers, type PaintingData } from './paintings';
import { createPinHandlers } from './pins';
import { createProviderHandlers, type ProviderData } from './providers';
import { createTopicHandlers } from './topics';

export type DataApiDependencies = {
  assistants: AssistantService;
  files: FileEntryService;
  mcpServers: McpServerData;
  messages: MessageService;
  models: ModelData;
  paintings: PaintingData;
  pins: PinService;
  providers: ProviderData;
  topics: TopicService;
};

export function createDataApiHandlers(dependencies: DataApiDependencies): ApiImplementation {
  return {
    ...createAssistantHandlers(dependencies.assistants),
    ...createFileHandlers(dependencies.files),
    ...createMcpServerHandlers(dependencies.mcpServers),
    ...createMessageHandlers(dependencies.messages),
    ...createModelHandlers(dependencies.models),
    ...createPaintingHandlers(dependencies.paintings),
    ...createPinHandlers(dependencies.pins),
    ...createProviderHandlers(dependencies.providers),
    ...createTopicHandlers(dependencies.topics),
  };
}
