import type { AiUsageRecordSchemas } from './aiUsageRecords';
import type { AssistantSchemas } from './assistants';
import type { FileSchemas } from './files';
import type { McpServerSchemas } from './mcpServers';
import type { MessageSchemas } from './messages';
import type { ModelSchemas } from './models';
import type { PaintingSchemas } from './paintings';
import type { PinSchemas } from './pins';
import type { ProviderSchemas } from './providers';
import type { TopicSchemas } from './topics';

export type ApiSchemas = AiUsageRecordSchemas &
  AssistantSchemas &
  FileSchemas &
  McpServerSchemas &
  MessageSchemas &
  ModelSchemas &
  PaintingSchemas &
  PinSchemas &
  ProviderSchemas &
  TopicSchemas;
