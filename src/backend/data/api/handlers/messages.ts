import { application } from '@/backend/core/application/Application';
import type { ResourceScope } from '@/backend/core/resources/types';
import type { MessageService } from '@/backend/data/services/MessageService';
import type { MessageSchemas } from '@/shared/data/api/schemas/messages';
import type { HandlersFor } from '@/shared/data/api/types';

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

/**
 * Message deletes `invalidate` rather than `delete`: the rows go but the topic
 * survives, so its scope reopens once the mutation lands. What the pass buys is
 * the same as for a topic — a turn streaming into this thread is cancelled and
 * has written its terminal row before the delete transaction opens, instead of
 * racing it.
 */
export function createMessageHandlers(service: MessageData): HandlersFor<MessageSchemas> {
  const scopes = () => application.get('ResourceScopeCoordinator');
  const topicScope = (topicId: string): ResourceScope[] => [{ id: topicId, kind: 'topic' }];

  return {
    '/messages/:id': {
      DELETE: async ({ params, query }) => {
        // Only the row knows which topic it belongs to, and the scope is needed
        // before the mutation.
        const { topicId } = await service.getById(params.id);
        return scopes().invalidate(topicScope(topicId), () =>
          service.delete(params.id, query?.cascade, query?.activeNodeStrategy),
        );
      },
      GET: ({ params }) => service.getById(params.id),
      PATCH: ({ body, params }) => service.update(params.id, body),
    },
    '/messages/:id/siblings': {
      POST: ({ body, params }) => service.createSibling(params.id, body),
    },
    '/topics/:topicId/messages': {
      DELETE: ({ params }) =>
        scopes().invalidate(topicScope(params.topicId), () =>
          service.clearTopicMessages(params.topicId),
        ),
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
