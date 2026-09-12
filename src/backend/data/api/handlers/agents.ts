import type { AgentService } from '@/backend/data/services/AgentService';
import {
  type AgentSchemas,
  CreateAgentSchema,
  ListAgentsQuerySchema,
  type SetAgentAvatarDto,
  SetAgentAvatarSchema,
  type UpdateAgentDto,
  UpdateAgentSchema,
} from '@/shared/data/api/schemas/agents';
import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@/shared/data/api/schemas/endpointHelpers';
import type { HandlersFor } from '@/shared/data/api/types';
import type { Agent } from '@/shared/data/types/agent';

type AgentData = Pick<
  AgentService,
  'create' | 'delete' | 'getById' | 'list' | 'reorder' | 'reorderBatch' | 'update'
>;

/**
 * The avatar half of an Agent, supplied by bootstrap. Declared structurally
 * rather than imported: the implementation reads and writes the avatar
 * directory, and this layer must not depend on backend services.
 */
export type AgentAvatars = {
  setAvatar(id: string, input: SetAgentAvatarDto): Promise<Agent>;
  withUri(agent: Agent): Promise<Agent>;
  withUris(agents: readonly Agent[]): Promise<Agent[]>;
};

/**
 * Deletes need no resource-scope pass: an agent soft-deletes and its sessions
 * stay; nothing running is invalidated by tombstoning the definition row.
 *
 * Every read that returns a record goes through `avatars` on the way out —
 * `AgentService` leaves `avatarUri` null because resolving it is file-system
 * work, not a query.
 */
export function createAgentHandlers(
  service: AgentData,
  avatars: AgentAvatars,
): HandlersFor<AgentSchemas> {
  return {
    '/agents': {
      GET: async ({ query }) => {
        const page = await service.list(ListAgentsQuerySchema.parse(query ?? {}));
        return { ...page, items: await avatars.withUris(page.items) };
      },
      POST: async ({ body }) =>
        avatars.withUri(await service.create(CreateAgentSchema.parse(body))),
    },
    '/agents/:id': {
      DELETE: async ({ params }) => service.delete(params.id),
      GET: async ({ params }) => avatars.withUri(await service.getById(params.id)),
      PATCH: async ({ body, params }) => {
        const parsed = UpdateAgentSchema.parse(body);
        // Zod materializes every optional key as `undefined`; forwarding those
        // would make "field absent" indistinguishable from "clear this field".
        const bodyKeys =
          body && typeof body === 'object' ? new Set(Object.keys(body)) : new Set<string>();
        const patch = Object.fromEntries(
          Object.entries(parsed).filter(([key]) => bodyKeys.has(key)),
        ) as UpdateAgentDto;
        return avatars.withUri(await service.update(params.id, patch));
      },
    },
    '/agents/:id/avatar': {
      PUT: async ({ body, params }) =>
        avatars.setAvatar(params.id, SetAgentAvatarSchema.parse(body)),
    },
    '/agents/:id/order': {
      PATCH: async ({ body, params }) => service.reorder(params.id, OrderRequestSchema.parse(body)),
    },
    '/agents/order:batch': {
      PATCH: async ({ body }) => service.reorderBatch(OrderBatchRequestSchema.parse(body).moves),
    },
  };
}
