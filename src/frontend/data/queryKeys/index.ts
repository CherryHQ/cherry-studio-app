import { agentQueryKeys } from './agents';
import { agentSessionQueryKeys } from './agentSessions';
import { aiUsageRecordQueryKeys } from './aiUsageRecords';
import { fileQueryKeys } from './files';
import { jobQueryKeys } from './jobs';
import { mcpServerQueryKeys } from './mcpServers';
import { modelQueryKeys } from './models';
import { paintingQueryKeys } from './paintings';
import { providerQueryKeys } from './providers';

export const queryKeys = {
  agentSessions: agentSessionQueryKeys,
  agents: agentQueryKeys,
  aiUsageRecords: aiUsageRecordQueryKeys,
  files: fileQueryKeys,
  jobs: jobQueryKeys,
  mcpServers: mcpServerQueryKeys,
  models: modelQueryKeys,
  paintings: paintingQueryKeys,
  providers: providerQueryKeys,
};
