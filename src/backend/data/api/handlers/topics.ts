import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@cherrystudio/universal/data/api/schemas/_endpointHelpers';
import {
  CreateTopicSchema,
  DeleteTopicsQuerySchema,
  DuplicateTopicSchema,
  ListTopicsQuerySchema,
  SetActiveNodeSchema,
  type TopicSchemas,
  UpdateTopicSchema,
} from '@cherrystudio/universal/data/api/schemas/topics';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { TopicService } from '@/backend/data/services/TopicService';

export function createTopicHandlers(
  service: TopicService,
  onTopicsDeleted: (topicIds: readonly string[]) => void,
): HandlersFor<TopicSchemas> {
  return {
    '/assistants/:assistantId/topics': {
      DELETE: async ({ params }) => {
        const result = await service.deleteByAssistantId(params.assistantId);
        onTopicsDeleted(result.deletedIds);
        return result;
      },
    },
    '/topics': {
      DELETE: async ({ query }) => {
        const result = await service.deleteByIds(DeleteTopicsQuerySchema.parse(query).ids);
        onTopicsDeleted(result.deletedIds);
        return result;
      },
      GET: async ({ query }) => service.listByCursor(ListTopicsQuerySchema.parse(query ?? {})),
      POST: async ({ body }) => service.create(CreateTopicSchema.parse(body)),
    },
    '/topics/:id': {
      DELETE: async ({ params }) => {
        await service.delete(params.id);
        onTopicsDeleted([params.id]);
      },
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
