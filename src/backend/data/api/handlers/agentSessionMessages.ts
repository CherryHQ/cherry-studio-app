import {
  type AgentSessionMessageSchemas,
  type AgentSessionMessageReader,
  AgentTranscriptSelectionSchema,
  ListAgentSessionMessagesQuerySchema,
} from '@/shared/data/api/schemas/agentSessionMessages';
import type { HandlersFor } from '@/shared/data/api/types';

export function createAgentSessionMessageHandlers(
  service: AgentSessionMessageReader,
): HandlersFor<AgentSessionMessageSchemas> {
  return {
    '/agent-sessions/:sessionId/messages/selection': {
      GET: async ({ params, query, signal }) => {
        signal?.throwIfAborted();
        const result = await service.readSelection(
          params.sessionId,
          AgentTranscriptSelectionSchema.parse(query).ids,
        );
        signal?.throwIfAborted();
        return result;
      },
    },
    '/agent-sessions/:sessionId/messages': {
      GET: async ({ params, query }) =>
        service.listByCursor(
          params.sessionId,
          ListAgentSessionMessagesQuerySchema.parse(query ?? {}),
        ),
    },
  };
}
