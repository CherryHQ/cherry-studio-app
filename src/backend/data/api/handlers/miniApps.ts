import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@cherrystudio/universal/data/api/schemas/_endpointHelpers';
import {
  CreateMiniAppSchema,
  ListMiniAppsQuerySchema,
  type MiniAppSchemas,
  UpdateMiniAppSchema,
} from '@cherrystudio/universal/data/api/schemas/miniApps';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { MiniAppService } from '@/backend/data/services/MiniAppService';

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
