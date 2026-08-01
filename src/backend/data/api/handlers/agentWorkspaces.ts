import type { AgentSessionService } from '@/backend/data/services/AgentSessionService';
import type { AgentWorkspaceService } from '@/backend/data/services/AgentWorkspaceService';
import { toDataApiError } from '@cherrystudio/shared/data/api/errors';
import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@cherrystudio/shared/data/api/schemas/_endpointHelpers';
import {
  type AgentWorkspaceSchemas,
  CreateAgentWorkspaceSchema,
  UpdateAgentWorkspaceSchema,
} from '@cherrystudio/shared/data/api/schemas/agentWorkspaces';
import type { HandlersFor } from '@cherrystudio/shared/data/api/types';

export function createAgentWorkspaceHandlers(
  workspaces: AgentWorkspaceService,
  sessions: AgentSessionService,
): HandlersFor<AgentWorkspaceSchemas> {
  return {
    '/agent-workspaces': {
      GET: async () => workspaces.list(),
      POST: async ({ body }) => {
        const parsed = CreateAgentWorkspaceSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error);
        return workspaces.findOrCreateByPath(parsed.data.path, { name: parsed.data.name });
      },
    },
    '/agent-workspaces/:id/order': {
      PATCH: async ({ body, params }) =>
        workspaces.reorder(params.id, OrderRequestSchema.parse(body)),
    },
    '/agent-workspaces/:workspaceId': {
      DELETE: async ({ params }) => sessions.deleteWorkspaceCascade(params.workspaceId),
      GET: async ({ params }) => workspaces.getById(params.workspaceId),
      PATCH: async ({ body, params }) => {
        const parsed = UpdateAgentWorkspaceSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error);
        return workspaces.update(params.workspaceId, parsed.data);
      },
    },
    '/agent-workspaces/order:batch': {
      PATCH: async ({ body }) => workspaces.reorderBatch(OrderBatchRequestSchema.parse(body).moves),
    },
  };
}
