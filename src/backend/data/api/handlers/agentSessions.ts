import type { AgentSessionService } from '@/backend/data/services/AgentSessionService';
import { toDataApiError } from '@cherrystudio/universal/data/api/errors';
import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@cherrystudio/universal/data/api/schemas/_endpointHelpers';
import {
  type AgentSessionSchemas,
  CreateAgentSessionSchema,
  DeleteAgentSessionsQuerySchema,
  ListAgentSessionsQuerySchema,
  SetAgentSessionWorkspaceSchema,
  UpdateAgentSessionSchema,
} from '@cherrystudio/universal/data/api/schemas/agentSessions';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

export function createAgentSessionHandlers(
  service: AgentSessionService,
): HandlersFor<AgentSessionSchemas> {
  return {
    '/agent-sessions': {
      DELETE: async ({ query }) => {
        const parsed = DeleteAgentSessionsQuerySchema.safeParse(query);
        if (!parsed.success) throw toDataApiError(parsed.error);
        return service.deleteByIds(parsed.data.ids);
      },
      GET: async ({ query }) => {
        const parsed = ListAgentSessionsQuerySchema.safeParse(query ?? {});
        if (!parsed.success) throw toDataApiError(parsed.error);
        return service.listByCursor(parsed.data);
      },
      POST: async ({ body }) => {
        const parsed = CreateAgentSessionSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error);
        return service.create(parsed.data);
      },
    },
    '/agent-sessions/:id/order': {
      PATCH: async ({ body, params }) => service.reorder(params.id, OrderRequestSchema.parse(body)),
    },
    '/agent-sessions/:sessionId': {
      DELETE: async ({ params }) => service.delete(params.sessionId),
      GET: async ({ params }) => service.getById(params.sessionId),
      PATCH: async ({ body, params }) => {
        const parsed = UpdateAgentSessionSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error);
        return service.update(params.sessionId, parsed.data);
      },
    },
    '/agent-sessions/:sessionId/workspace': {
      PUT: async ({ body, params }) => {
        const parsed = SetAgentSessionWorkspaceSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error);
        return service.setWorkspace(params.sessionId, parsed.data);
      },
    },
    '/agent-sessions/latest': {
      GET: async () => ({ session: await service.getLatestUpdated() }),
    },
    '/agent-sessions/order:batch': {
      PATCH: async ({ body }) => service.reorderBatch(OrderBatchRequestSchema.parse(body).moves),
    },
    '/agents/:agentId/sessions': {
      DELETE: async ({ params }) => service.deleteByAgentId(params.agentId),
    },
  };
}
