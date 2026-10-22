import { agentQueryKeys } from './agents';
import { agentSessionQueryKeys } from './agentSessions';
import { aiUsageRecordQueryKeys } from './aiUsageRecords';
import { appUpdateQueryKeys } from './appUpdate';
import { fileQueryKeys } from './files';
import { jobQueryKeys } from './jobs';
import { mcpServerQueryKeys } from './mcpServers';
import { modelQueryKeys } from './models';
import { paintingQueryKeys } from './paintings';
import { pluginConnectionQueryKeys } from './pluginConnections';
import { providerQueryKeys } from './providers';

export const queryKeys = {
  avatars: {
    studio: () => ['avatars', 'studio'] as const,
    characters: () => ['avatars', 'characters'] as const,
    resource: (source: string) => ['avatars', 'resource', source] as const,
  },
  agentSessions: agentSessionQueryKeys,
  agents: agentQueryKeys,
  appUpdate: appUpdateQueryKeys,
  aiUsageRecords: aiUsageRecordQueryKeys,
  files: fileQueryKeys,
  jobs: jobQueryKeys,
  mcpServers: mcpServerQueryKeys,
  models: modelQueryKeys,
  paintings: paintingQueryKeys,
  pluginConnections: pluginConnectionQueryKeys,
  providers: providerQueryKeys,
};
