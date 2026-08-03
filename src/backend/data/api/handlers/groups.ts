import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@cherrystudio/universal/data/api/schemas/_endpointHelpers';
import {
  CreateGroupSchema,
  GroupIdSchema,
  type GroupSchemas,
  ListGroupsQuerySchema,
  UpdateGroupSchema,
} from '@cherrystudio/universal/data/api/schemas/groups';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { GroupService } from '@/backend/data/services/GroupService';

export function createGroupHandlers(service: GroupService): HandlersFor<GroupSchemas> {
  return {
    '/groups': {
      GET: async ({ query }) =>
        service.listByEntityType(ListGroupsQuerySchema.parse(query).entityType),
      POST: async ({ body }) => service.create(CreateGroupSchema.parse(body)),
    },
    '/groups/:id': {
      DELETE: async ({ params }) => service.delete(GroupIdSchema.parse(params.id)),
      GET: async ({ params }) => service.getById(GroupIdSchema.parse(params.id)),
      PATCH: async ({ body, params }) =>
        service.update(GroupIdSchema.parse(params.id), UpdateGroupSchema.parse(body)),
    },
    '/groups/:id/order': {
      PATCH: async ({ body, params }) =>
        service.reorder(GroupIdSchema.parse(params.id), OrderRequestSchema.parse(body)),
    },
    '/groups/order:batch': {
      PATCH: async ({ body }) => service.reorderBatch(OrderBatchRequestSchema.parse(body).moves),
    },
  };
}
