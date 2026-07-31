import type { MessageService } from '@/backend/data/services/MessageService';
import type { MessageSchemas } from '@/shared/data/api/schemas/messages';
import type { HandlersFor } from '@/shared/data/api/types';

type MessageData = Pick<
  MessageService,
  | 'create'
  | 'createSibling'
  | 'delete'
  | 'getBranchMessages'
  | 'getById'
  | 'getPathThrough'
  | 'getTree'
  | 'update'
>;

export function createMessageHandlers(service: MessageData): HandlersFor<MessageSchemas> {
  return {
    '/messages/:id': {
      DELETE: ({ params, query }) =>
        service.delete(params.id, query?.cascade, query?.activeNodeStrategy),
      GET: ({ params }) => service.getById(params.id),
      PATCH: ({ body, params }) => service.update(params.id, body),
    },
    '/messages/:id/siblings': {
      POST: ({ body, params }) => service.createSibling(params.id, body),
    },
    '/topics/:topicId/messages': {
      GET: ({ params, query }) => service.getBranchMessages(params.topicId, query),
      POST: ({ body, params }) => service.create(params.topicId, body),
    },
    '/topics/:topicId/path': {
      GET: ({ params, query }) => service.getPathThrough(params.topicId, query.nodeId),
    },
    '/topics/:topicId/tree': {
      GET: ({ params, query }) => service.getTree(params.topicId, query),
    },
  };
}
