import type { MessageService } from '@/backend/data/services/MessageService';
import type { MessageSchemas } from '@cherrystudio/shared/data/api/schemas/messages';
import type { HandlersFor } from '@cherrystudio/shared/data/api/types';

type MessageData = Pick<
  MessageService,
  | 'create'
  | 'createSibling'
  | 'clearTopicMessages'
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
      DELETE: ({ params }) => service.clearTopicMessages(params.topicId),
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
