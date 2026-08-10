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

import type { AssistantService } from '@/backend/data/services/AssistantService';

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

export function createAssistantHandlers(
  service: AssistantData,
  onTopicsDeleted: (topicIds: readonly string[]) => void,
): HandlersFor<AssistantSchemas> {
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
        const parsed = DeleteAssistantQuerySchema.parse(query ?? {});
        const result = await service.delete(params.id, {
          deleteTopics: parsed.deleteTopics === true,
        });
        if (result.deletedTopicIds) onTopicsDeleted(result.deletedTopicIds);
        return result;
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
