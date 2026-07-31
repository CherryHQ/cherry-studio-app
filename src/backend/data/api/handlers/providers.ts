import type {
  CreateProviderInput,
  ProviderSchemas,
  UpdateProviderApiKeyInput,
  UpdateProviderInput,
} from '@/shared/data/api/schemas/providers';
import type { HandlersFor } from '@/shared/data/api/types';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/shared/data/types/provider';

export type ProviderData = {
  create(input: CreateProviderInput): Promise<Provider>;
  get(id: string): Promise<Provider>;
  getAuth(id: string): Promise<AuthConfig | null>;
  list(query?: { enabled?: boolean }): Promise<Provider[]>;
  listApiKeys(id: string, query?: { enabled?: boolean }): Promise<ApiKeyEntry[]>;
  remove(id: string): Promise<void>;
  replaceApiKeys(id: string, apiKeys: ApiKeyEntry[]): Promise<Provider>;
  update(id: string, input: UpdateProviderInput): Promise<Provider>;
  updateApiKey(id: string, keyId: string, input: UpdateProviderApiKeyInput): Promise<Provider>;
};

export function createProviderHandlers(service: ProviderData): HandlersFor<ProviderSchemas> {
  return {
    '/providers': {
      GET: ({ query }) => service.list(query),
      POST: ({ body }) => service.create(body),
    },
    '/providers/:id': {
      DELETE: ({ params }) => service.remove(params.id),
      GET: ({ params }) => service.get(params.id),
      PATCH: ({ body, params }) => service.update(params.id, body),
    },
    '/providers/:id/api-keys': {
      GET: ({ params, query }) => service.listApiKeys(params.id, query),
      PUT: ({ body, params }) => service.replaceApiKeys(params.id, body),
    },
    '/providers/:id/api-keys/:keyId': {
      PATCH: ({ body, params }) => service.updateApiKey(params.id, params.keyId, body),
    },
    '/providers/:id/auth': {
      GET: ({ params }) => service.getAuth(params.id),
    },
  };
}
