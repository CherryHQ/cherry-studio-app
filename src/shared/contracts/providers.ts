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

export type CompleteCherryInOAuthInput = {
  apiHost: string;
  code: string;
  codeVerifier: string;
  oauthServer: string;
  redirectUri: string;
};

export type CherryInProfile = {
  displayName: string | null;
  email: string | null;
  group: string | null;
  username: string | null;
};

export type CherryInAccount = {
  balance: number;
  monthlySpend: number | null;
  monthlyUsageTokens: number | null;
  profile: CherryInProfile | null;
};

export interface ProvidersBackend {
  canRemove(provider: Pick<Provider, 'id' | 'presetProviderId'>): boolean;
  completeCherryInOAuth(input: CompleteCherryInOAuthInput): Promise<void>;
  create(input: CreateProviderInput): Promise<Provider>;
  get(id: string): Promise<Provider>;
  getAuth(id: string): Promise<AuthConfig | null>;
  getCherryInAccount(apiHost: string): Promise<CherryInAccount | null>;
  list(query?: { enabled?: boolean }): Promise<Provider[]>;
  listApiKeys(id: string, query?: { enabled?: boolean }): Promise<ApiKeyEntry[]>;
  logoutCherryIn(apiHost: string): Promise<void>;
  persistAvatar(id: string, sourceUri: string): Promise<string>;
  remove(id: string): Promise<void>;
  replaceApiKeys(id: string, apiKeys: ApiKeyEntry[]): Promise<Provider>;
  resolveAvatar(id: string): string | undefined;
  update(id: string, input: UpdateProviderInput): Promise<Provider>;
  updateApiKey(id: string, keyId: string, input: UpdateProviderApiKeyInput): Promise<Provider>;
}
