import type { CacheService } from '@/backend/data/CacheService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { agentChannelService } from '@/backend/data/services/AgentChannelService';
import { agentGlobalSkillService } from '@/backend/data/services/AgentGlobalSkillService';
import { agentService } from '@/backend/data/services/AgentService';
import { agentSessionMessageService } from '@/backend/data/services/AgentSessionMessageService';
import { agentSessionService } from '@/backend/data/services/AgentSessionService';
import { agentTaskService } from '@/backend/data/services/AgentTaskService';
import { agentWorkspaceService } from '@/backend/data/services/AgentWorkspaceService';
import { aiUsageRecordService } from '@/backend/data/services/AiUsageRecordService';
import { assistantService } from '@/backend/data/services/AssistantService';
import { contentSearchService } from '@/backend/data/services/ContentSearchService';
import { entitySearchService } from '@/backend/data/services/EntitySearchService';
import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { fileRefService } from '@/backend/data/services/FileRefService';
import { groupService } from '@/backend/data/services/GroupService';
import { jobService } from '@/backend/data/services/JobService';
import { knowledgeBaseService } from '@/backend/data/services/KnowledgeBaseService';
import { knowledgeItemService } from '@/backend/data/services/KnowledgeItemService';
import { mcpServerService } from '@/backend/data/services/McpServerService';
import { messageService } from '@/backend/data/services/MessageService';
import { miniAppService } from '@/backend/data/services/MiniAppService';
import { modelService } from '@/backend/data/services/ModelService';
import { noteService } from '@/backend/data/services/NoteService';
import { paintingService } from '@/backend/data/services/PaintingService';
import { pinService } from '@/backend/data/services/PinService';
import { promptService } from '@/backend/data/services/PromptService';
import { providerService } from '@/backend/data/services/ProviderService';
import { tagService } from '@/backend/data/services/TagService';
import { temporaryChatService } from '@/backend/data/services/TemporaryChatService';
import { topicService } from '@/backend/data/services/TopicService';
import { translateHistoryService } from '@/backend/data/services/TranslateHistoryService';
import { translateLanguageService } from '@/backend/data/services/TranslateLanguageService';

export type DataServices = ReturnType<typeof createDataServices>;

/**
 * Names the data-service singletons for the routing table.
 *
 * Every service here is a module singleton that resolves `DbService` through
 * `application` per call, so this builds nothing — it only gives the route
 * registrations one object to read from. `cache` and `preference` are the two
 * lifecycle-owned services the routes also expose; the host constructs those.
 */
export function createDataServices({
  cache,
  preference,
}: {
  cache: CacheService;
  preference: PreferenceService;
}) {
  return {
    agent: agentService,
    agentChannel: agentChannelService,
    agentGlobalSkill: agentGlobalSkillService,
    agentSession: agentSessionService,
    agentSessionMessage: agentSessionMessageService,
    agentTask: agentTaskService,
    agentWorkspace: agentWorkspaceService,
    aiUsageRecord: aiUsageRecordService,
    assistant: assistantService,
    cache,
    contentSearch: contentSearchService,
    entitySearch: entitySearchService,
    fileEntry: fileEntryService,
    fileRef: fileRefService,
    group: groupService,
    job: jobService,
    knowledgeBase: knowledgeBaseService,
    knowledgeItem: knowledgeItemService,
    mcpServer: mcpServerService,
    message: messageService,
    miniApp: miniAppService,
    model: modelService,
    note: noteService,
    painting: paintingService,
    pin: pinService,
    preference,
    prompt: promptService,
    provider: providerService,
    tag: tagService,
    temporaryChat: temporaryChatService,
    topic: topicService,
    translateHistory: translateHistoryService,
    translateLanguage: translateLanguageService,
  };
}
