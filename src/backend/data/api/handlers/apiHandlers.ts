import type { ApiImplementation } from '@/shared/data/api/types';

import type { AgentService } from '../../services/AgentService';
import type { AgentSessionMessageService } from '../../services/AgentSessionMessageService';
import type { AgentSessionService } from '../../services/AgentSessionService';
import type { AgentToolBindingService } from '../../services/AgentToolBindingService';
import type { AiUsageRecordService } from '../../services/AiUsageRecordService';
import type { ContentSearchService } from '../../services/ContentSearchService';
import type { EntitySearchService } from '../../services/EntitySearchService';
import type { FileEntryService } from '../../services/FileEntryService';
import type { JobService } from '../../services/JobService';
import type { McpServerService } from '../../services/McpServerService';
import type { PaintingService } from '../../services/PaintingService';
import type { ProviderService } from '../../services/ProviderService';
import { type AgentAvatars, createAgentHandlers } from './agents';
import { createAgentSessionMessageHandlers } from './agentSessionMessages';
import { createAgentSessionHandlers, type AgentSessionMutations } from './agentSessions';
import { createAgentToolBindingHandlers } from './agentToolBindings';
import { createAiUsageRecordHandlers } from './aiUsageRecords';
import { createFileHandlers } from './files';
import { createJobHandlers } from './jobs';
import { createMcpServerHandlers, type McpServerMutations } from './mcpServers';
import { createModelHandlers, type SystemModelSupportFilter } from './models';
import { createPaintingHandlers } from './paintings';
import { createProviderHandlers } from './providers';
import { createSearchHandlers } from './search';

export type DataApiDependencies = {
  agentAvatars: AgentAvatars;
  agents: AgentService;
  agentToolBindings: AgentToolBindingService;
  agentSessionMessages: AgentSessionMessageService;
  agentSessionMutations: AgentSessionMutations;
  agentSessions: AgentSessionService;
  aiUsageRecords: AiUsageRecordService;
  contentSearch: ContentSearchService;
  entitySearch: EntitySearchService;
  files: FileEntryService;
  jobs: JobService;
  mcpServerMutations: McpServerMutations;
  mcpServers: McpServerService;
  models: import('../../services/ModelService').ModelService;
  systemModelSupport: SystemModelSupportFilter;
  paintings: PaintingService;
  providers: ProviderService;
};

export function createDataApiHandlers(dependencies: DataApiDependencies): ApiImplementation {
  return {
    ...createAgentHandlers(dependencies.agents, dependencies.agentAvatars),
    ...createAgentToolBindingHandlers(dependencies.agentToolBindings),
    ...createAgentSessionHandlers(dependencies.agentSessions, dependencies.agentSessionMutations),
    ...createAgentSessionMessageHandlers(dependencies.agentSessionMessages),
    ...createAiUsageRecordHandlers(dependencies.aiUsageRecords),
    ...createFileHandlers(dependencies.files),
    ...createJobHandlers(dependencies.jobs),
    ...createMcpServerHandlers(dependencies.mcpServers, dependencies.mcpServerMutations),
    ...createModelHandlers(dependencies.models, dependencies.systemModelSupport),
    ...createPaintingHandlers(dependencies.paintings),
    ...createProviderHandlers(dependencies.providers),
    ...createSearchHandlers(dependencies.contentSearch, dependencies.entitySearch),
  };
}
