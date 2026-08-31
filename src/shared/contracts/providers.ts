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

export interface ProvidersModule {
  applyRegistryUpdate(): Promise<ProviderRegistryUpdateResult>;
  checkRegistryUpdate(): Promise<ProviderRegistryUpdateCheck>;
  importPreset(providerId: string): Promise<Provider>;
  listCatalog(): Promise<ProviderCatalogEntry[]>;
  persistAvatar(id: string, sourceUri: string): Promise<string>;
  removeAvatar(id: string): void;
  resolveAvatar(id: string): string | undefined;
  subscribeRegistryUpdates(listener: (event: ProviderRegistryUpdateEvent) => void): () => void;
}
