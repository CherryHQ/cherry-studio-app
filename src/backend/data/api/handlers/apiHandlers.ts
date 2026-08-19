import type { ApiImplementation } from '@cherrystudio/universal/data/api/types';

import type { AiUsageRecordService } from '../../services/AiUsageRecordService';
import type { AssistantService } from '../../services/AssistantService';
import type { ContentSearchService } from '../../services/ContentSearchService';
import type { EntitySearchService } from '../../services/EntitySearchService';
import type { FileEntryService } from '../../services/FileEntryService';
import type { FileRefService } from '../../services/FileRefService';
import type { JobService } from '../../services/JobService';
import type { McpServerService } from '../../services/McpServerService';
import type { MessageService } from '../../services/MessageService';
import type { PaintingService } from '../../services/PaintingService';
import type { PinService } from '../../services/PinService';
import type { ProviderService } from '../../services/ProviderService';
import type { TemporaryChatService } from '../../services/TemporaryChatService';
import type { TopicService } from '../../services/TopicService';
import { createAiUsageRecordHandlers } from './aiUsageRecords';
import { createAssistantHandlers } from './assistants';
import { createFileHandlers } from './files';
import { createJobHandlers } from './jobs';
import { createMcpServerHandlers, type McpServerMutations } from './mcpServers';
import { createMessageHandlers } from './messages';
import { createModelHandlers } from './models';
import { createPaintingHandlers } from './paintings';
import { createPinHandlers } from './pins';
import { createProviderHandlers } from './providers';
import { createSearchHandlers } from './search';
import { createTemporaryChatHandlers } from './temporaryChats';
import { createTopicHandlers } from './topics';

export type DataApiDependencies = {
  aiUsageRecords: AiUsageRecordService;
  assistants: AssistantService;
  contentSearch: ContentSearchService;
  entitySearch: EntitySearchService;
  files: FileEntryService;
  fileRefs: FileRefService;
  jobs: JobService;
  mcpServerMutations: McpServerMutations;
  mcpServers: McpServerService;
  messages: MessageService;
  models: import('../../services/ModelService').ModelService;
  paintings: PaintingService;
  pins: PinService;
  providers: ProviderService;
  temporaryChats: TemporaryChatService;
  topics: TopicService;
};

export function createDataApiHandlers(dependencies: DataApiDependencies): ApiImplementation {
  return {
    ...createAiUsageRecordHandlers(dependencies.aiUsageRecords),
    ...createAssistantHandlers(dependencies.assistants),
    ...createFileHandlers(dependencies.files, dependencies.fileRefs),
    ...createJobHandlers(dependencies.jobs),
    ...createMcpServerHandlers(dependencies.mcpServers, dependencies.mcpServerMutations),
    ...createMessageHandlers(dependencies.messages),
    ...createModelHandlers(dependencies.models),
    ...createPaintingHandlers(dependencies.paintings),
    ...createPinHandlers(dependencies.pins),
    ...createProviderHandlers(dependencies.providers),
    ...createSearchHandlers(dependencies.contentSearch, dependencies.entitySearch),
    ...createTemporaryChatHandlers(dependencies.temporaryChats),
    ...createTopicHandlers(dependencies.topics),
  };
}
