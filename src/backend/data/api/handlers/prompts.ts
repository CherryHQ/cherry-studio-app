import type { PromptService } from '@/backend/data/services/PromptService';
import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@/shared/data/api/schemas/_endpointHelpers';
import {
  CreatePromptSchema,
  ListPromptsQuerySchema,
  PromptIdSchema,
  type PromptSchemas,
  UpdatePromptSchema,
} from '@/shared/data/api/schemas/prompts';
import type { HandlersFor } from '@/shared/data/api/types';

export function createPromptHandlers(service: PromptService): HandlersFor<PromptSchemas> {
  return {
    '/prompts': {
      GET: async ({ query }) => service.list(ListPromptsQuerySchema.parse(query ?? {})),
      POST: async ({ body }) => service.create(CreatePromptSchema.parse(body)),
    },
    '/prompts/:id': {
      DELETE: async ({ params }) => service.delete(PromptIdSchema.parse(params.id)),
      GET: async ({ params }) => service.getById(PromptIdSchema.parse(params.id)),
      PATCH: async ({ body, params }) =>
        service.update(PromptIdSchema.parse(params.id), UpdatePromptSchema.parse(body)),
    },
    '/prompts/:id/order': {
      PATCH: async ({ body, params }) =>
        service.reorder(PromptIdSchema.parse(params.id), OrderRequestSchema.parse(body)),
    },
    '/prompts/order:batch': {
      PATCH: async ({ body }) => service.reorderBatch(OrderBatchRequestSchema.parse(body).moves),
    },
  };
}
