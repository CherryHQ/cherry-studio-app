import type { TemporaryChatService } from '@/backend/data/services/TemporaryChatService';
import { CreateMessageSchema } from '@cherrystudio/shared/data/api/schemas/messages';
import type { TemporaryChatSchemas } from '@cherrystudio/shared/data/api/schemas/temporaryChats';
import type { HandlersFor } from '@cherrystudio/shared/data/api/types';

export function createTemporaryChatHandlers(
  service: TemporaryChatService,
): HandlersFor<TemporaryChatSchemas> {
  return {
    '/temporary/topics': {
      POST: async ({ body }) => service.createTopic(body),
    },
    '/temporary/topics/:id': {
      DELETE: async ({ params }) => service.deleteTopic(params.id),
    },
    '/temporary/topics/:topicId/messages': {
      GET: async ({ params }) => service.listMessages(params.topicId),
      POST: async ({ body, params }) =>
        service.appendMessage(params.topicId, CreateMessageSchema.parse(body)),
    },
    '/temporary/topics/:id/persist': {
      POST: async ({ params }) => await service.persist(params.id),
    },
  };
}
