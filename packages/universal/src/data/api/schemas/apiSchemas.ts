import type { AgentChannelSchemas } from './agentChannels';
import type { AgentSchemas } from './agents';
import type { AgentSessionMessageSchemas } from './agentSessionMessages';
import type { AgentSessionSchemas } from './agentSessions';
import type { AgentWorkspaceSchemas } from './agentWorkspaces';
import type { AiUsageRecordSchemas } from './aiUsageRecords';
import type { AssistantSchemas } from './assistants';
import type { FileSchemas } from './files';
import type { GroupSchemas } from './groups';
import type { JobSchemas } from './jobs';
import type { KnowledgeSchemas } from './knowledges';
import type { McpServerSchemas } from './mcpServers';
import type { MessageSchemas } from './messages';
import type { MiniAppSchemas } from './miniApps';
import type { ModelSchemas } from './models';
import type { NoteSchemas } from './notes';
import type { PaintingSchemas } from './paintings';
import type { PinSchemas } from './pins';
import type { PromptSchemas } from './prompts';
import type { ProviderSchemas } from './providers';
import type { SearchSchemas } from './search';
import type { SkillSchemas } from './skills';
import type { TagSchemas } from './tags';
import type { TemporaryChatSchemas } from './temporaryChats';
import type { TopicSchemas } from './topics';
import type { TranslateSchemas } from './translate';

export type ApiSchemas = AgentChannelSchemas &
  AgentSchemas &
  AgentSessionMessageSchemas &
  AgentSessionSchemas &
  AgentWorkspaceSchemas &
  AiUsageRecordSchemas &
  AssistantSchemas &
  FileSchemas &
  GroupSchemas &
  JobSchemas &
  KnowledgeSchemas &
  McpServerSchemas &
  MessageSchemas &
  MiniAppSchemas &
  ModelSchemas &
  NoteSchemas &
  PaintingSchemas &
  PinSchemas &
  PromptSchemas &
  ProviderSchemas &
  SearchSchemas &
  SkillSchemas &
  TagSchemas &
  TemporaryChatSchemas &
  TopicSchemas &
  TranslateSchemas;
