import type { ProviderAccountCapabilities } from '@/shared/contracts/providerAccounts';
import type { EndpointType, Model } from '@/shared/data/types/model';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/shared/data/types/provider';

export type VertexAuthConfig = Extract<AuthConfig, { type: 'iam-gcp' }>;
export type ProviderVertexAuth = {
  config: VertexAuthConfig;
  save: (config: VertexAuthConfig) => Promise<boolean>;
};

/** Where requests go: one editable address, a set of protocol addresses, or nothing editable. */
export type ProviderAddress =
  | { kind: 'none' }
  | { baseUrl: string; endpoint: EndpointType; kind: 'primary' }
  | {
      defaultChatEndpoint: EndpointType;
      endpointUrls: Partial<Record<EndpointType, string>>;
      kind: 'custom';
    };

/**
 * Every change is a single action. A saved provider writes it straight through and
 * resolves `false` after reporting a failure; a draft applies it locally. Callers
 * never need to know which.
 */
export type ProviderConfigurationActions = {
  addApiKey: (entry: ApiKeyEntry) => Promise<boolean>;
  removeApiKey: (id: string) => Promise<boolean>;
  reorderApiKeys: (apiKeys: ApiKeyEntry[]) => Promise<boolean>;
  rename: (name: string) => Promise<boolean>;
  setAvatar: (uri: string | null) => Promise<boolean>;
  setBaseUrl: (baseUrl: string) => Promise<boolean>;
  /** Makes `endpoint` the default, writing `baseUrl` as its address in the same change. */
  setDefaultEndpoint: (endpoint: EndpointType, baseUrl: string) => Promise<boolean>;
  setEndpointUrl: (endpoint: EndpointType, baseUrl: string) => Promise<boolean>;
  updateApiKey: (id: string, updates: Partial<Omit<ApiKeyEntry, 'id'>>) => Promise<boolean>;
};

export type ProviderConfigurationAccount = {
  signedIn?: boolean;
  capabilities: ProviderAccountCapabilities;
  onBusyChange: (busy: boolean) => void;
  onKeysChanged: () => Promise<void>;
};

/** What the configuration screen shows and how it changes, independent of persistence. */
export type ProviderConfigurationValue = {
  /** Ephemeral fingerprint: a probe result never survives a changed connection or credential. */
  connectionKey?: string;
  vertexAuth?: ProviderVertexAuth;
  account?: ProviderConfigurationAccount;
  actions: ProviderConfigurationActions;
  address: ProviderAddress;
  /** `null` when the provider's authentication does not use API keys. */
  apiKeys: readonly ApiKeyEntry[] | null;
  apiKeyUrl?: string;
  avatarUri: string | null;
  isBusy: boolean;
  /** Text models the connection test can use; absent for providers that are not saved yet. */
  models?: readonly Model[];
  name: string;
  presetProviderId?: string;
  provider?: Provider;
  providerId: string;
};
