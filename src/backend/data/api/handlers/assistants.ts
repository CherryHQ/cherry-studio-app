import type { AssistantService } from '@/backend/data/services/AssistantService';
import type { AssistantSchemas } from '@/shared/data/api/schemas/assistants';
import type { HandlersFor } from '@/shared/data/api/types';

type AssistantData = Pick<
  AssistantService,
  'create' | 'get' | 'list' | 'remove' | 'reorder' | 'reorderBatch' | 'update'
>;

export function createAssistantHandlers(service: AssistantData): HandlersFor<AssistantSchemas> {
  return {
    '/assistants': {
      GET: ({ query }) => service.list(query),
      POST: ({ body }) => service.create(body),
    },
    '/assistants/:id': {
      DELETE: ({ params }) => service.remove(params.id),
      GET: ({ params }) => service.get(params.id),
      PATCH: ({ body, params }) => service.update(params.id, body),
    },
    '/assistants/:id/order': {
      PATCH: ({ body, params }) => service.reorder(params.id, body),
    },
    '/assistants/order:batch': {
      PATCH: ({ body }) => service.reorderBatch(body.moves),
    },
  };
}
