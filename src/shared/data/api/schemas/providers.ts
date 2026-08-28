import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { EndpointType } from '@/shared/data/types/model';
import type {
  ApiFeatures,
  ApiKeyEntry,
  AuthConfig,
  EndpointConfigs,
  Provider,
  ProviderSettings,
  RuntimeApiFeatures,
} from '@/shared/data/types/provider';

export type CreateProviderInput = {
  apiFeatures?: ApiFeatures | null;
  apiKeys?: ApiKeyEntry[];
  authConfig?: AuthConfig | null;
  defaultChatEndpoint?: EndpointType | null;
  endpointConfigs?: EndpointConfigs | null;
  name: string;
  presetProviderId?: string | null;
  providerId: string;
  providerSettings?: ProviderSettings | null;
};

export type UpdateProviderInput = {
  apiFeatures?: Partial<RuntimeApiFeatures> | null;
  authConfig?: AuthConfig | null;
  defaultChatEndpoint?: EndpointType | null;
  endpointConfigs?: EndpointConfigs | null;
  isEnabled?: boolean;
  name?: string;
  providerSettings?: ProviderSettings | null;
};

export type UpdateProviderApiKeyInput = {
  isEnabled?: boolean;
  key?: string;
  label?: string;
};

export type ProviderListPageQuery = {
  cursor?: string;
  limit?: number;
};

export type ProviderSchemas = {
  '/providers': {
    GET: {
      query?: { enabled?: boolean };
      response: Provider[];
    };
    POST: {
      body: CreateProviderInput;
      response: Provider;
    };
  };
  '/providers/page': {
    GET: {
      query?: ProviderListPageQuery;
      response: CursorPaginationResponse<Provider>;
    };
  };
  '/providers/:id': {
    DELETE: {
      params: { id: string };
      response: undefined;
    };
    GET: {
      params: { id: string };
      response: Provider;
    };
    PATCH: {
      body: UpdateProviderInput;
      params: { id: string };
      response: Provider;
    };
  };
  '/providers/:id/api-keys': {
    GET: {
      params: { id: string };
      query?: { enabled?: boolean };
      response: ApiKeyEntry[];
    };
    PUT: {
      body: ApiKeyEntry[];
      params: { id: string };
      response: Provider;
    };
  };
  '/providers/:id/api-keys/:keyId': {
    PATCH: {
      body: UpdateProviderApiKeyInput;
      params: { id: string; keyId: string };
      response: Provider;
    };
  };
  '/providers/:id/auth': {
    GET: {
      params: { id: string };
      response: AuthConfig | null;
    };
  };
};
