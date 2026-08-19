import type { AiUsageRecordSchemas } from './aiUsageRecords';
import type { AssistantSchemas } from './assistants';
import type { FileSchemas } from './files';
import type { JobSchemas } from './jobs';
import type { McpServerSchemas } from './mcpServers';
import type { MessageSchemas } from './messages';
import type { ModelSchemas } from './models';
import type { PaintingSchemas } from './paintings';
import type { ProviderSchemas } from './providers';
import type { SearchSchemas } from './search';
import type { TemporaryChatSchemas } from './temporaryChats';
import type { TopicSchemas } from './topics';

export type ApiSchemas = AiUsageRecordSchemas &
  AssistantSchemas &
  FileSchemas &
  JobSchemas &
  McpServerSchemas &
  MessageSchemas &
  ModelSchemas &
  PaintingSchemas &
  ProviderSchemas &
  SearchSchemas &
  TemporaryChatSchemas &
  TopicSchemas;
