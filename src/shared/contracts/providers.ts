import type { Provider } from '@/shared/data/types/provider';

export type ProviderCatalogEntry = {
  description?: string;
  id: string;
  isInstalled: boolean;
  isRecommended: boolean;
  name: string;
};

export type ProviderRegistryUpdateEvent = {
  revision: number;
  source: 'cache' | 'gitcode' | 'github';
};

export type ProviderRegistryUpdateCheck = { status: 'available' | 'current' };

export type ProviderRegistryUpdateResult = { status: 'current' | 'updated' };

export type ProviderConfigurationIssue =
  | 'missing-api-key'
  | 'disabled-api-keys'
  | 'invalid-endpoint'
  | 'unsupported-auth';

export type ProviderSetupStatus = {
  provider: Provider;
  issue: ProviderConfigurationIssue | null;
  hasModels: boolean;
};

export class ProviderSetupError extends Error {
  constructor(public readonly reason: ProviderConfigurationIssue | 'no-models') {
    super(`Provider setup requires attention: ${reason}`);
    this.name = 'ProviderSetupError';
  }
}

export interface ProvidersModule {
  getSetupStatus(providerId: string): Promise<ProviderSetupStatus>;
  enable(providerId: string): Promise<Provider>;
  applyRegistryUpdate(): Promise<ProviderRegistryUpdateResult>;
  checkRegistryUpdate(): Promise<ProviderRegistryUpdateCheck>;
  importPreset(providerId: string): Promise<Provider>;
  listCatalog(): Promise<ProviderCatalogEntry[]>;
  persistAvatar(id: string, sourceUri: string): Promise<string>;
  removeAvatar(id: string): void;
  resolveAvatar(id: string): string | undefined;
  subscribeRegistryUpdates(listener: (event: ProviderRegistryUpdateEvent) => void): () => void;
}
