import type { ApiImplementation } from '@cherrystudio/universal/data/api/types';

import type { AgentChannelService } from '../../services/AgentChannelService';
import type { AgentGlobalSkillService } from '../../services/AgentGlobalSkillService';
import type { AgentService } from '../../services/AgentService';
import type { AgentSessionMessageService } from '../../services/AgentSessionMessageService';
import type { AgentSessionService } from '../../services/AgentSessionService';
import type { AgentTaskService } from '../../services/AgentTaskService';
import type { AgentWorkspaceService } from '../../services/AgentWorkspaceService';
import type { AiUsageRecordService } from '../../services/AiUsageRecordService';
import type { AssistantService } from '../../services/AssistantService';
import type { ContentSearchService } from '../../services/ContentSearchService';
import type { EntitySearchService } from '../../services/EntitySearchService';
import type { FileEntryService } from '../../services/FileEntryService';
import type { FileRefService } from '../../services/FileRefService';
import type { GroupService } from '../../services/GroupService';
import type { JobService } from '../../services/JobService';
import type { KnowledgeBaseService } from '../../services/KnowledgeBaseService';
import type { KnowledgeItemService } from '../../services/KnowledgeItemService';
import type { McpServerService } from '../../services/McpServerService';
import type { MessageService } from '../../services/MessageService';
import type { MiniAppService } from '../../services/MiniAppService';
import type { NoteService } from '../../services/NoteService';
import type { PaintingService } from '../../services/PaintingService';
import type { PinService } from '../../services/PinService';
import type { PromptService } from '../../services/PromptService';
import type { ProviderService } from '../../services/ProviderService';
import type { TagService } from '../../services/TagService';
import type { TemporaryChatService } from '../../services/TemporaryChatService';
import type { TopicService } from '../../services/TopicService';
import type { TranslateHistoryService } from '../../services/TranslateHistoryService';
import type { TranslateLanguageService } from '../../services/TranslateLanguageService';
import { createAgentChannelHandlers } from './agentChannels';
import { createAgentHandlers } from './agents';
import { createAgentSessionMessageHandlers } from './agentSessionMessages';
import { createAgentSessionHandlers } from './agentSessions';
import { createAgentWorkspaceHandlers } from './agentWorkspaces';
import { createAiUsageRecordHandlers } from './aiUsageRecords';
import { createAssistantHandlers } from './assistants';
import { createFileHandlers } from './files';
import { createGroupHandlers } from './groups';
import { createJobHandlers } from './jobs';
import { createKnowledgeHandlers } from './knowledges';
import { createMcpServerHandlers, type McpServerMutations } from './mcpServers';
import { createMessageHandlers } from './messages';
import { createMiniAppHandlers } from './miniApps';
import { createModelHandlers } from './models';
import { createNoteHandlers } from './notes';
import { createPaintingHandlers } from './paintings';
import { createPinHandlers } from './pins';
import { createPromptHandlers } from './prompts';
import { createProviderHandlers } from './providers';
import { createSearchHandlers } from './search';
import { createSkillHandlers } from './skills';
import { createTagHandlers } from './tags';
import { createTemporaryChatHandlers } from './temporaryChats';
import { createTopicHandlers } from './topics';
import { createTranslateHandlers } from './translate';

export type DataApiDependencies = {
  agentChannels: AgentChannelService;
  agentGlobalSkills: AgentGlobalSkillService;
  agents: AgentService;
  agentSessionMessages: AgentSessionMessageService;
  agentSessions: AgentSessionService;
  agentTasks: AgentTaskService;
  agentWorkspaces: AgentWorkspaceService;
  aiUsageRecords: AiUsageRecordService;
  assistants: AssistantService;
  contentSearch: ContentSearchService;
  entitySearch: EntitySearchService;
  files: FileEntryService;
  fileRefs: FileRefService;
  groups: GroupService;
  jobs: JobService;
  knowledgeBases: KnowledgeBaseService;
  knowledgeItems: KnowledgeItemService;
  mcpServerMutations: McpServerMutations;
  mcpServers: McpServerService;
  messages: MessageService;
  miniApps: MiniAppService;
  models: import('../../services/ModelService').ModelService;
  notes: NoteService;
  onTopicsDeleted: (topicIds: readonly string[]) => void;
  paintings: PaintingService;
  pins: PinService;
  prompts: PromptService;
  providers: ProviderService;
  tags: TagService;
  temporaryChats: TemporaryChatService;
  topics: TopicService;
  translateHistories: TranslateHistoryService;
  translateLanguages: TranslateLanguageService;
};

export function createDataApiHandlers(dependencies: DataApiDependencies): ApiImplementation {
  return {
    ...createAgentChannelHandlers(dependencies.agentChannels),
    ...createAgentHandlers(dependencies.agents, dependencies.agentTasks),
    ...createAgentSessionMessageHandlers(dependencies.agentSessionMessages),
    ...createAgentSessionHandlers(dependencies.agentSessions),
    ...createAgentWorkspaceHandlers(dependencies.agentWorkspaces, dependencies.agentSessions),
    ...createAiUsageRecordHandlers(dependencies.aiUsageRecords),
    ...createAssistantHandlers(dependencies.assistants, dependencies.onTopicsDeleted),
    ...createFileHandlers(dependencies.files, dependencies.fileRefs),
    ...createGroupHandlers(dependencies.groups),
    ...createJobHandlers(dependencies.jobs),
    ...createKnowledgeHandlers(dependencies.knowledgeBases, dependencies.knowledgeItems),
    ...createMcpServerHandlers(dependencies.mcpServers, dependencies.mcpServerMutations),
    ...createMessageHandlers(dependencies.messages),
    ...createMiniAppHandlers(dependencies.miniApps),
    ...createModelHandlers(dependencies.models),
    ...createNoteHandlers(dependencies.notes),
    ...createPaintingHandlers(dependencies.paintings),
    ...createPinHandlers(dependencies.pins),
    ...createPromptHandlers(dependencies.prompts),
    ...createProviderHandlers(dependencies.providers),
    ...createSearchHandlers(dependencies.contentSearch, dependencies.entitySearch),
    ...createSkillHandlers(dependencies.agentGlobalSkills),
    ...createTagHandlers(dependencies.tags),
    ...createTemporaryChatHandlers(dependencies.temporaryChats),
    ...createTopicHandlers(dependencies.topics, dependencies.onTopicsDeleted),
    ...createTranslateHandlers(dependencies.translateHistories, dependencies.translateLanguages),
  };
}
