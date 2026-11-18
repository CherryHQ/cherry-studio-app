import type { AgentSessionMessageService } from '@/backend/data/services/AgentSessionMessageService';
import {
  type AgentSessionMessageSchemas,
  AgentTranscriptQuerySchema,
  AgentTranscriptSelectionSchema,
  ListAgentSessionMessagesQuerySchema,
  SaveAgentMessageTranslationSchema,
} from '@/shared/data/api/schemas/agentSessionMessages';
import type { HandlersFor } from '@/shared/data/api/types';

export function createAgentSessionMessageHandlers(
  service: Pick<
    AgentSessionMessageService,
    'listByCursor' | 'readSelection' | 'readTranscript' | 'saveTranslation'
  >,
): HandlersFor<AgentSessionMessageSchemas> {
  return {
    '/agent-sessions/:sessionId/messages/transcript': {
      GET: async ({ params, query, signal }) => {
        signal?.throwIfAborted();
        const { role } = AgentTranscriptQuerySchema.parse(query ?? {});
        const result = await service.readTranscript(params.sessionId, role);
        signal?.throwIfAborted();
        return result;
      },
    },
    '/agent-sessions/:sessionId/messages/:messageId/translations': {
      PATCH: async ({ params, body }) =>
        service.saveTranslation(
          params.sessionId,
          params.messageId,
          SaveAgentMessageTranslationSchema.parse(body),
        ),
    },
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
