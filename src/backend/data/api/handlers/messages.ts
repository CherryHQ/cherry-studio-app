import { application } from '@/backend/core/application/Application';
import type { ResourceScope } from '@/backend/core/resources/types';
import type { MessageService } from '@/backend/data/services/MessageService';
import type { MessageSchemas } from '@/shared/data/api/schemas/messages';
import type { HandlersFor } from '@/shared/data/api/types';

type MessageData = Pick<
  MessageService,
  'create' | 'clearTopicMessages' | 'getBranchMessages' | 'getById' | 'update'
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
      GET: ({ params }) => service.getById(params.id),
      PATCH: ({ body, params }) => service.update(params.id, body),
    },
    '/topics/:topicId/messages': {
      DELETE: ({ params }) =>
        scopes().invalidate(topicScope(params.topicId), () =>
          service.clearTopicMessages(params.topicId),
        ),
      GET: ({ params, query }) => service.getBranchMessages(params.topicId, query),
      POST: ({ body, params }) => service.create(params.topicId, body),
    },
  };
}
