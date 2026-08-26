import type { AgentSchemas } from './agents';
import type { AgentSessionMessageSchemas } from './agentSessionMessages';
import type { AgentSessionSchemas } from './agentSessions';
import type { AgentToolBindingSchemas } from './agentToolBindings';
import type { AiUsageRecordSchemas } from './aiUsageRecords';
import type { FileSchemas } from './files';
import type { JobSchemas } from './jobs';
import type { McpServerSchemas } from './mcpServers';
import type { ModelSchemas } from './models';
import type { PaintingSchemas } from './paintings';
import type { ProviderSchemas } from './providers';
import type { SearchSchemas } from './search';

export type ApiSchemas = AgentSchemas &
  AgentToolBindingSchemas &
  AgentSessionMessageSchemas &
  AgentSessionSchemas &
  AiUsageRecordSchemas &
  FileSchemas &
  JobSchemas &
  McpServerSchemas &
  ModelSchemas &
  PaintingSchemas &
  ProviderSchemas &
  SearchSchemas;
