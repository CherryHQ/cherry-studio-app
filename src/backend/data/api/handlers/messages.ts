import type { MessageSchemas } from '@cherrystudio/universal/data/api/schemas/messages';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { MessageService } from '@/backend/data/services/MessageService';

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

export function createMessageHandlers(
  service: MessageData,
  onTopicsDeleted: (topicIds: readonly string[]) => void,
): HandlersFor<MessageSchemas> {
  return {
    '/messages/:id': {
      DELETE: async ({ params, query }) => {
        const message = await service.getById(params.id);
        const result = await service.delete(params.id, query?.cascade, query?.activeNodeStrategy);
        onTopicsDeleted([message.topicId]);
        return result;
      },
      GET: ({ params }) => service.getById(params.id),
      PATCH: ({ body, params }) => service.update(params.id, body),
    },
    '/messages/:id/siblings': {
      POST: ({ body, params }) => service.createSibling(params.id, body),
    },
    '/topics/:topicId/messages': {
      DELETE: async ({ params }) => {
        const result = await service.clearTopicMessages(params.topicId);
        onTopicsDeleted([params.topicId]);
        return result;
      },
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
