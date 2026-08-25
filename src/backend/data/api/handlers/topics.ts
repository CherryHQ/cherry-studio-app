import { application } from '@/backend/core/application/Application';
import type { ResourceScope } from '@/backend/core/resources/types';
import type { TopicService } from '@/backend/data/services/TopicService';
import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@/shared/data/api/schemas/endpointHelpers';
import {
  CreateTopicSchema,
  DeleteTopicsQuerySchema,
  ListTopicsQuerySchema,
  type TopicSchemas,
  UpdateTopicSchema,
} from '@/shared/data/api/schemas/topics';
import type { HandlersFor } from '@/shared/data/api/types';

const topicScopes = (ids: readonly string[]): ResourceScope[] =>
  ids.map((id) => ({ id, kind: 'topic' }));

/**
 * Deletes route through the scope coordinator so the work running under a topic
 * is cancelled and drained before its rows go.
 *
 * Here rather than inside `TopicService` for two reasons: this is the boundary
 * every caller crosses, so no future one can forget; and the cancellation must
 * happen outside the write transaction the service opens — `withWriteTx` is not
 * reentrant, and a cancelled turn needs the write lock to land its terminal row.
 */
export function createTopicHandlers(service: TopicService): HandlersFor<TopicSchemas> {
  const scopes = () => application.get('ResourceScopeCoordinator');

  return {
    '/assistants/:assistantId/topics': {
      DELETE: async ({ params }) => {
        // Read first: the cascade discovers its own ids inside the transaction,
        // which is too late to cancel anything.
        const ids = await service.listIdsByAssistantId(params.assistantId);
        return scopes().delete(topicScopes(ids), () =>
          service.deleteByAssistantId(params.assistantId),
        );
      },
    },
    '/topics': {
      DELETE: async ({ query }) => {
        const { ids } = DeleteTopicsQuerySchema.parse(query);
        return scopes().delete(topicScopes(ids), () => service.deleteByIds(ids));
      },
      GET: async ({ query }) => service.listByCursor(ListTopicsQuerySchema.parse(query ?? {})),
      POST: async ({ body }) => service.create(CreateTopicSchema.parse(body)),
    },
    '/topics/:id': {
      DELETE: async ({ params }) =>
        scopes().delete(topicScopes([params.id]), () => service.delete(params.id)),
      GET: async ({ params }) => service.getById(params.id),
      PATCH: async ({ body, params }) => service.update(params.id, UpdateTopicSchema.parse(body)),
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
