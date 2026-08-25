import type { AgentService } from '@/backend/data/services/AgentService';
import {
  type AgentSchemas,
  CreateAgentSchema,
  ListAgentsQuerySchema,
  type UpdateAgentDto,
  UpdateAgentSchema,
} from '@/shared/data/api/schemas/agents';
import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@/shared/data/api/schemas/endpointHelpers';
import type { HandlersFor } from '@/shared/data/api/types';

type AgentData = Pick<
  AgentService,
  'create' | 'delete' | 'getById' | 'list' | 'reorder' | 'reorderBatch' | 'update'
>;

/**
 * Deletes need no resource-scope pass: an agent soft-deletes and its sessions
 * stay; nothing running is invalidated by tombstoning the definition row.
 */
export function createAgentHandlers(service: AgentData): HandlersFor<AgentSchemas> {
  return {
    '/agents': {
      GET: async ({ query }) => service.list(ListAgentsQuerySchema.parse(query ?? {})),
      POST: async ({ body }) => service.create(CreateAgentSchema.parse(body)),
    },
    '/agents/:id': {
      DELETE: async ({ params }) => service.delete(params.id),
      GET: async ({ params }) => service.getById(params.id),
      PATCH: async ({ body, params }) => {
        const parsed = UpdateAgentSchema.parse(body);
        // Zod materializes every optional key as `undefined`; forwarding those
        // would make "field absent" indistinguishable from "clear this field".
        const bodyKeys =
          body && typeof body === 'object' ? new Set(Object.keys(body)) : new Set<string>();
        const patch = Object.fromEntries(
          Object.entries(parsed).filter(([key]) => bodyKeys.has(key)),
        ) as UpdateAgentDto;
        return service.update(params.id, patch);
      },
    },
    '/agents/:id/order': {
      PATCH: async ({ body, params }) => service.reorder(params.id, OrderRequestSchema.parse(body)),
    },
    '/agents/order:batch': {
      PATCH: async ({ body }) => service.reorderBatch(OrderBatchRequestSchema.parse(body).moves),
    },
  };
}
