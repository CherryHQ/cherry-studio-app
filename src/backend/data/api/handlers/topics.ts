import type { TopicService } from '@/backend/data/services/TopicService';
import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@/shared/data/api/schemas/_endpointHelpers';
import {
  CreateTopicSchema,
  DeleteTopicsQuerySchema,
  DuplicateTopicSchema,
  ListTopicsQuerySchema,
  SetActiveNodeSchema,
  type TopicSchemas,
  UpdateTopicSchema,
} from '@/shared/data/api/schemas/topics';
import type { HandlersFor } from '@/shared/data/api/types';

export function createTopicHandlers(service: TopicService): HandlersFor<TopicSchemas> {
  return {
    '/assistants/:assistantId/topics': {
      DELETE: async ({ params }) => service.deleteByAssistantId(params.assistantId),
    },
    '/topics': {
      DELETE: async ({ query }) => service.deleteByIds(DeleteTopicsQuerySchema.parse(query).ids),
      GET: async ({ query }) => service.listByCursor(ListTopicsQuerySchema.parse(query ?? {})),
      POST: async ({ body }) => service.create(CreateTopicSchema.parse(body)),
    },
    '/topics/:id': {
      DELETE: async ({ params }) => service.delete(params.id),
      GET: async ({ params }) => service.getById(params.id),
      PATCH: async ({ body, params }) => service.update(params.id, UpdateTopicSchema.parse(body)),
    },
    '/topics/:id/active-node': {
      PUT: async ({ body, params }) =>
        service.setActiveNode(params.id, SetActiveNodeSchema.parse(body).nodeId),
    },
    '/topics/:id/duplicate': {
      POST: async ({ body, params }) =>
        service.duplicate(params.id, DuplicateTopicSchema.parse(body)),
    },
    '/topics/:id/order': {
      PATCH: async ({ body, params }) => service.reorder(params.id, OrderRequestSchema.parse(body)),
    },
    '/topics/latest': {
      GET: async () => ({ topic: await service.getLatestUpdated() }),
    },
    '/topics/order:batch': {
      PATCH: async ({ body }) => service.reorderBatch(OrderBatchRequestSchema.parse(body).moves),
    },
  };
}
