import { agentQueryKeys } from './agents';
import { agentSessionQueryKeys } from './agentSessions';
import { aiUsageRecordQueryKeys } from './aiUsageRecords';
import { assistantQueryKeys } from './assistants';
import { fileQueryKeys } from './files';
import { jobQueryKeys } from './jobs';
import { mcpServerQueryKeys } from './mcpServers';
import { messageQueryKeys } from './messages';
import { modelQueryKeys } from './models';
import { paintingQueryKeys } from './paintings';
import { providerQueryKeys } from './providers';
import { topicQueryKeys } from './topics';

export const queryKeys = {
  agentSessions: agentSessionQueryKeys,
  agents: agentQueryKeys,
  aiUsageRecords: aiUsageRecordQueryKeys,
  assistants: assistantQueryKeys,
  files: fileQueryKeys,
  jobs: jobQueryKeys,
  mcpServers: mcpServerQueryKeys,
  messages: messageQueryKeys,
  models: modelQueryKeys,
  paintings: paintingQueryKeys,
  providers: providerQueryKeys,
  topics: topicQueryKeys,
};
