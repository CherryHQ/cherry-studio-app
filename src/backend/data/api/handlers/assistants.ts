import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@cherrystudio/universal/data/api/schemas/_endpointHelpers';
import {
  type AssistantSchemas,
  CreateAssistantSchema,
  DeleteAssistantQuerySchema,
  ImportAssistantSchema,
  ListAssistantsQuerySchema,
  type UpdateAssistantDto,
  UpdateAssistantSchema,
} from '@cherrystudio/universal/data/api/schemas/assistants';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import { application } from '@/backend/core/application/Application';
import type { AssistantService } from '@/backend/data/services/AssistantService';
import { topicService } from '@/backend/data/services/TopicService';

type AssistantData = Pick<
  AssistantService,
  | 'create'
  | 'createFromImport'
  | 'delete'
  | 'getById'
  | 'list'
  | 'reorder'
  | 'reorderBatch'
  | 'update'
>;

export function createAssistantHandlers(service: AssistantData): HandlersFor<AssistantSchemas> {
  return {
    '/assistants': {
      GET: async ({ query }) => service.list(ListAssistantsQuerySchema.parse(query ?? {})),
      POST: async ({ body }) => service.create(CreateAssistantSchema.parse(body)),
    },
    '/assistants:import': {
      POST: async ({ body }) => service.createFromImport(ImportAssistantSchema.parse(body)),
    },
    '/assistants/:id': {
      DELETE: async ({ params, query }) => {
        const deleteTopics = DeleteAssistantQuerySchema.parse(query ?? {}).deleteTopics === true;
        if (!deleteTopics) {
          // The assistant is soft-deleted and its topics stay; nothing running
          // under them is invalidated by that.
          return service.delete(params.id, { deleteTopics: false });
        }

        // The cascade runs inside the assistant's own write transaction, so the
        // topic ids have to be read before it — same constraint, and the same
        // sub-millisecond miss window, as `DELETE /assistants/:id/topics`.
        const topicIds = await topicService.listIdsByAssistantId(params.id);
        return application.get('ResourceScopeCoordinator').delete(
          topicIds.map((id) => ({ id, kind: 'topic' })),
          () => service.delete(params.id, { deleteTopics: true }),
        );
      },
      GET: async ({ params }) => service.getById(params.id),
      PATCH: async ({ body, params }) => {
        const parsed = UpdateAssistantSchema.parse(body);
        const bodyKeys =
          body && typeof body === 'object' ? new Set(Object.keys(body)) : new Set<string>();
        const patch = Object.fromEntries(
          Object.entries(parsed).filter(([key]) => bodyKeys.has(key)),
        ) as UpdateAssistantDto;
        return service.update(params.id, patch);
      },
    },
    '/assistants/:id/order': {
      PATCH: async ({ body, params }) => service.reorder(params.id, OrderRequestSchema.parse(body)),
    },
    '/assistants/order:batch': {
      PATCH: async ({ body }) => service.reorderBatch(OrderBatchRequestSchema.parse(body).moves),
    },
  };
}
