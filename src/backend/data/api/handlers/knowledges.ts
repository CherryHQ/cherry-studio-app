import type { KnowledgeBaseService } from '@/backend/data/services/KnowledgeBaseService';
import type { KnowledgeItemService } from '@/backend/data/services/KnowledgeItemService';
import {
  type KnowledgeSchemas,
  ListKnowledgeBasesQuerySchema,
  ListKnowledgeItemsQuerySchema,
  UpdateKnowledgeBaseSchema,
} from '@/shared/data/api/schemas/knowledges';
import type { HandlersFor } from '@/shared/data/api/types';

export function createKnowledgeHandlers(
  bases: KnowledgeBaseService,
  items: KnowledgeItemService,
): HandlersFor<KnowledgeSchemas> {
  return {
    '/knowledge-bases': {
      GET: async ({ query }) => bases.list(ListKnowledgeBasesQuerySchema.parse(query ?? {})),
    },
    '/knowledge-bases/:id': {
      GET: async ({ params }) => bases.getById(params.id),
      PATCH: async ({ body, params }) =>
        bases.update(params.id, UpdateKnowledgeBaseSchema.parse(body)),
    },
    '/knowledge-bases/:id/items': {
      GET: async ({ params, query }) =>
        items.list(params.id, ListKnowledgeItemsQuerySchema.parse(query ?? {})),
    },
    '/knowledge-items/:id': {
      GET: async ({ params }) => items.getById(params.id),
    },
  };
}
