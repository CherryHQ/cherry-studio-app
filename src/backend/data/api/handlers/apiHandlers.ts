import type { ApiImplementation } from '@/shared/data/api/types';

import type { AgentService } from '../../services/AgentService';
import type { AiUsageRecordService } from '../../services/AiUsageRecordService';
import type { AssistantService } from '../../services/AssistantService';
import type { ContentSearchService } from '../../services/ContentSearchService';
import type { EntitySearchService } from '../../services/EntitySearchService';
import type { FileEntryService } from '../../services/FileEntryService';
import type { JobService } from '../../services/JobService';
import type { McpServerService } from '../../services/McpServerService';
import type { MessageService } from '../../services/MessageService';
import type { PaintingService } from '../../services/PaintingService';
import type { ProviderService } from '../../services/ProviderService';
import type { TopicService } from '../../services/TopicService';
import { createAgentHandlers } from './agents';
import { createAiUsageRecordHandlers } from './aiUsageRecords';
import { createAssistantHandlers } from './assistants';
import { createFileHandlers } from './files';
import { createJobHandlers } from './jobs';
import { createMcpServerHandlers, type McpServerMutations } from './mcpServers';
import { createMessageHandlers } from './messages';
import { createModelHandlers } from './models';
import { createPaintingHandlers } from './paintings';
import { createProviderHandlers } from './providers';
import { createSearchHandlers } from './search';
import { createTopicHandlers } from './topics';

export type DataApiDependencies = {
  agents: AgentService;
  aiUsageRecords: AiUsageRecordService;
  assistants: AssistantService;
  contentSearch: ContentSearchService;
  entitySearch: EntitySearchService;
  files: FileEntryService;
  jobs: JobService;
  mcpServerMutations: McpServerMutations;
  mcpServers: McpServerService;
  messages: MessageService;
  models: import('../../services/ModelService').ModelService;
  paintings: PaintingService;
  providers: ProviderService;
  topics: TopicService;
};

export function createDataApiHandlers(dependencies: DataApiDependencies): ApiImplementation {
  return {
    ...createAgentHandlers(dependencies.agents),
    ...createAiUsageRecordHandlers(dependencies.aiUsageRecords),
    ...createAssistantHandlers(dependencies.assistants),
    ...createFileHandlers(dependencies.files),
    ...createJobHandlers(dependencies.jobs),
    ...createMcpServerHandlers(dependencies.mcpServers, dependencies.mcpServerMutations),
    ...createMessageHandlers(dependencies.messages),
    ...createModelHandlers(dependencies.models),
    ...createPaintingHandlers(dependencies.paintings),
    ...createProviderHandlers(dependencies.providers),
    ...createSearchHandlers(dependencies.contentSearch, dependencies.entitySearch),
    ...createTopicHandlers(dependencies.topics),
  };
}
