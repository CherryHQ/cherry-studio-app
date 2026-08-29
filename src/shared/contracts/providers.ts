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

export interface ProvidersModule {
  canRemove(provider: Pick<Provider, 'id' | 'presetProviderId'>): boolean;
  importPreset(providerId: string): Promise<Provider>;
  listCatalog(): Promise<ProviderCatalogEntry[]>;
  persistAvatar(id: string, sourceUri: string): Promise<string>;
  removeAvatar(id: string): void;
  resolveAvatar(id: string): string | undefined;
  subscribeRegistryUpdates(listener: (event: ProviderRegistryUpdateEvent) => void): () => void;
}
