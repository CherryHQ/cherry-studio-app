import type { TopicService } from '@/backend/data/services/TopicService';
import type { TopicSchemas } from '@/shared/data/api/schemas/topics';
import type { HandlersFor } from '@/shared/data/api/types';

type TopicData = Pick<
  TopicService,
  | 'create'
  | 'get'
  | 'listPage'
  | 'removeMany'
  | 'reorder'
  | 'reorderBatch'
  | 'setActiveNode'
  | 'update'
>;

export function createTopicHandlers(service: TopicData): HandlersFor<TopicSchemas> {
  return {
    '/topics': {
      DELETE: ({ query }) => service.removeMany(query.ids),
      GET: ({ query }) => service.listPage(query),
      POST: ({ body }) => service.create(body),
    },
    '/topics/:id': {
      DELETE: ({ params }) => service.removeMany([params.id]),
      GET: ({ params }) => service.get(params.id),
      PATCH: ({ body, params }) => service.update(params.id, body),
    },
    '/topics/:id/active-node': {
      PUT: ({ body, params }) => service.setActiveNode(params.id, body.nodeId),
    },
    '/topics/:id/order': {
      PATCH: ({ body, params }) => service.reorder(params.id, body),
    },
    '/topics/order:batch': {
      PATCH: ({ body }) => service.reorderBatch(body.moves),
    },
  };
}
