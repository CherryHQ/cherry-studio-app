import type { AgentSessionMessageService } from '@/backend/data/services/AgentSessionMessageService';
import {
  type AgentSessionMessageSchemas,
  ListAgentSessionMessagesQuerySchema,
} from '@/shared/data/api/schemas/agentSessionMessages';
import type { HandlersFor } from '@/shared/data/api/types';

export function createAgentSessionMessageHandlers(
  service: AgentSessionMessageService,
): HandlersFor<AgentSessionMessageSchemas> {
  return {
    '/agent-sessions/:sessionId/messages': {
      GET: async ({ params, query }) =>
        service.listByCursor(
          params.sessionId,
          ListAgentSessionMessagesQuerySchema.parse(query ?? {}),
        ),
    },
  };
}
