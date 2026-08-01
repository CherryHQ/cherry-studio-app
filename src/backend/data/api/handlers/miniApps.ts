import type { MiniAppService } from '@/backend/data/services/MiniAppService';
import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@/shared/data/api/schemas/_endpointHelpers';
import {
  CreateMiniAppSchema,
  ListMiniAppsQuerySchema,
  type MiniAppSchemas,
  UpdateMiniAppSchema,
} from '@/shared/data/api/schemas/miniApps';
import type { HandlersFor } from '@/shared/data/api/types';

export function createMiniAppHandlers(service: MiniAppService): HandlersFor<MiniAppSchemas> {
  return {
    '/mini-apps': {
      GET: async ({ query }) => service.list(ListMiniAppsQuerySchema.parse(query ?? {})),
      POST: async ({ body }) => service.create(CreateMiniAppSchema.parse(body)),
    },
    '/mini-apps/:appId': {
      DELETE: async ({ params }) => service.delete(params.appId),
      GET: async ({ params }) => service.getByAppId(params.appId),
      PATCH: async ({ body, params }) =>
        service.update(params.appId, UpdateMiniAppSchema.parse(body)),
    },
    '/mini-apps/:id/order': {
      PATCH: async ({ body, params }) =>
        service.reorder([{ anchor: OrderRequestSchema.parse(body), id: params.id }]),
    },
    '/mini-apps/order:batch': {
      PATCH: async ({ body }) => service.reorder(OrderBatchRequestSchema.parse(body).moves),
    },
  };
}
