import { AiService } from '@/backend/ai/AiService';
import { McpRuntimeService } from '@/backend/ai/mcp';
import { ToolResolver } from '@/backend/ai/tools';
import type { CacheService } from '@/backend/data/CacheService';
import type { DbService } from '@/backend/data/db/DbService';
import { PreferenceService } from '@/backend/data/PreferenceService';
import { AgentChannelService } from '@/backend/data/services/AgentChannelService';
import { AgentGlobalSkillService } from '@/backend/data/services/AgentGlobalSkillService';
import { AgentService } from '@/backend/data/services/AgentService';
import { AgentSessionMessageService } from '@/backend/data/services/AgentSessionMessageService';
import { AgentSessionService } from '@/backend/data/services/AgentSessionService';
import { AgentTaskService } from '@/backend/data/services/AgentTaskService';
import { AgentWorkspaceService } from '@/backend/data/services/AgentWorkspaceService';
import { AiUsageRecordService } from '@/backend/data/services/AiUsageRecordService';
import { AssistantService } from '@/backend/data/services/AssistantService';
import { ContentSearchService } from '@/backend/data/services/ContentSearchService';
import { EntitySearchService } from '@/backend/data/services/EntitySearchService';
import { FileEntryService } from '@/backend/data/services/FileEntryService';
import { FileRefService } from '@/backend/data/services/FileRefService';
import { GroupService } from '@/backend/data/services/GroupService';
import { JobService } from '@/backend/data/services/JobService';
import { KnowledgeBaseService } from '@/backend/data/services/KnowledgeBaseService';
import { KnowledgeItemService } from '@/backend/data/services/KnowledgeItemService';
import { McpServerService } from '@/backend/data/services/McpServerService';
import { MessageService } from '@/backend/data/services/MessageService';
import { MiniAppService } from '@/backend/data/services/MiniAppService';
import { ModelService } from '@/backend/data/services/ModelService';
import { NoteService } from '@/backend/data/services/NoteService';
import { PaintingService } from '@/backend/data/services/PaintingService';
import { PinService } from '@/backend/data/services/PinService';
import { PromptService } from '@/backend/data/services/PromptService';
import { ProviderService } from '@/backend/data/services/ProviderService';
import { TagService } from '@/backend/data/services/TagService';
import { TemporaryChatService } from '@/backend/data/services/TemporaryChatService';
import { TopicService } from '@/backend/data/services/TopicService';
import { TranslateHistoryService } from '@/backend/data/services/TranslateHistoryService';
import { TranslateLanguageService } from '@/backend/data/services/TranslateLanguageService';
import { discardPreparedFiles, resolveInternalFileUri } from '@/backend/services/file/fileStorage';
import { DevicePermissions } from '@/backend/services/permissions';
import { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

export type BackendServices = ReturnType<typeof createBackendServices>;

export function createBackendServices(dbService: DbService, cache: CacheService) {
  const preference = new PreferenceService(dbService);
  const aiUsageRecord = new AiUsageRecordService(dbService);
  const devicePermissions = new DevicePermissions();
  const pin = new PinService(dbService);
  const provider = new ProviderService(dbService, pin, cache);
  const model = new ModelService(dbService, preference, pin);
  const tag = new TagService(dbService);
  const group = new GroupService(dbService);
  const job = new JobService(dbService);
  const agentWorkspace = new AgentWorkspaceService(dbService);
  const agentSession = new AgentSessionService(dbService, agentWorkspace, pin);
  const agentSessionMessage = new AgentSessionMessageService(dbService);
  const agentChannel = new AgentChannelService(dbService);
  const agentGlobalSkill = new AgentGlobalSkillService(dbService);
  const agentTask = new AgentTaskService(dbService, agentChannel, job);
  const agent = new AgentService(dbService, agentSession, pin);
  const knowledgeBase = new KnowledgeBaseService(dbService, group);
  const knowledgeItem = new KnowledgeItemService(dbService, knowledgeBase);
  const miniApp = new MiniAppService(dbService);
  const note = new NoteService(dbService);
  const prompt = new PromptService(dbService);
  const translateHistory = new TranslateHistoryService(dbService);
  const translateLanguage = new TranslateLanguageService(dbService);
  const fileEntry = new FileEntryService(dbService, resolveInternalFileUri);
  const fileRef = new FileRefService(dbService);
  const painting = new PaintingService(dbService, fileEntry, discardPreparedFiles);
  const mcpServer = new McpServerService(dbService);
  const mcpRuntime = new McpRuntimeService({ mcpServer });
  const topic = new TopicService(dbService, pin, tag);
  const assistant = new AssistantService(dbService, group, topic, model, preference, tag, pin);
  const message = new MessageService(dbService, topic, fileEntry);
  const contentSearch = new ContentSearchService(dbService);
  const entitySearch = new EntitySearchService(dbService);
  const temporaryChat = new TemporaryChatService(dbService, aiUsageRecord);
  const webSearch = new WebSearchService(preference);
  const toolResolver = new ToolResolver({
    devicePermissions,
    mcpRuntime,
    preference,
    webSearch,
  });
  const ai = new AiService({
    assistant,
    aiUsageRecord,
    fileEntry,
    model,
    preference,
    provider,
    tools: toolResolver,
  });

  return {
    agent,
    agentChannel,
    agentGlobalSkill,
    agentSession,
    agentSessionMessage,
    agentTask,
    agentWorkspace,
    ai,
    aiUsageRecord,
    assistant,
    cache,
    contentSearch,
    devicePermissions,
    entitySearch,
    fileEntry,
    fileRef,
    group,
    job,
    knowledgeBase,
    knowledgeItem,
    mcpRuntime,
    mcpServer,
    message,
    miniApp,
    model,
    note,
    painting,
    pin,
    preference,
    prompt,
    provider,
    tag,
    temporaryChat,
    topic,
    tools: toolResolver,
    translateHistory,
    translateLanguage,
    webSearch,
  };
}
