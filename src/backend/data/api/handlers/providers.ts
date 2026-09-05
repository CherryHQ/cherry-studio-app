import type { ProviderService } from '@/backend/data/services/ProviderService';
import type { ProviderSchemas } from '@/shared/data/api/schemas/providers';
import type { HandlersFor } from '@/shared/data/api/types';

export function createProviderHandlers(service: ProviderService): HandlersFor<ProviderSchemas> {
  return {
    '/providers': {
      GET: ({ query }) => service.list(query),
      POST: ({ body }) => service.create(body),
    },
    '/providers/page': {
      GET: ({ query }) => service.listPage(query),
    },
    '/providers/:id': {
      DELETE: ({ params }) => service.delete(params.id),
      GET: ({ params }) => service.getByProviderId(params.id),
      PATCH: ({ body, params }) => service.update(params.id, body),
    },
    '/providers/:id/api-keys': {
      GET: async ({ params, query }) => (await service.listApiKeys(params.id, query)).keys,
      PUT: ({ body, params }) => service.replaceApiKeys(params.id, body),
    },
    '/providers/:id/api-keys/:keyId': {
      PATCH: ({ body, params }) => service.updateApiKey(params.id, params.keyId, body),
    },
    '/providers/:id/auth': {
      GET: ({ params }) => service.getAuthConfig(params.id),
    },
  };
}
