import type { AgentSessionMessageService } from '@/backend/data/services/AgentSessionMessageService';
import { projectMessagePartsForRenderer } from '@cherrystudio/shared/ai/transport';
import { toDataApiError } from '@cherrystudio/shared/data/api/errors';
import {
  type AgentSessionMessageEntity,
  type AgentSessionMessageSchemas,
  AgentSessionMessagesListQuerySchema,
  UpdateAgentSessionMessageSchema,
} from '@cherrystudio/shared/data/api/schemas/agentSessionMessages';
import type { HandlersFor } from '@cherrystudio/shared/data/api/types';

function projectForRenderer(
  message: AgentSessionMessageEntity,
  sessionId: string,
): AgentSessionMessageEntity {
  if (message.role !== 'assistant' || !message.data.parts) return message;
  const parts = projectMessagePartsForRenderer(
    message.data.parts,
    `agent-session:${sessionId}`,
    message.id,
  );
  return parts === message.data.parts ? message : { ...message, data: { ...message.data, parts } };
}

export function createAgentSessionMessageHandlers(
  service: AgentSessionMessageService,
): HandlersFor<AgentSessionMessageSchemas> {
  return {
    '/agent-sessions/:sessionId/messages': {
      GET: async ({ params, query }) => {
        const parsed = AgentSessionMessagesListQuerySchema.safeParse(query ?? {});
        if (!parsed.success) throw toDataApiError(parsed.error);
        const response = await service.listSessionMessages(params.sessionId, parsed.data);
        if (!parsed.data.deferToolOutputs) return response;
        return {
          ...response,
          items: response.items.map((item) => projectForRenderer(item, params.sessionId)),
        };
      },
    },
    '/agent-sessions/:sessionId/messages/:messageId': {
      DELETE: async ({ params }) =>
        service.deleteSessionMessage(params.sessionId, params.messageId),
      GET: async ({ params }) => service.getSessionMessage(params.sessionId, params.messageId),
      PATCH: async ({ body, params }) => {
        const parsed = UpdateAgentSessionMessageSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error);
        return service.updateSessionMessage(params.sessionId, params.messageId, parsed.data);
      },
    },
  };
}
