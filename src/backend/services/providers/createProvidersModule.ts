import type { ProtoProviderConfig } from '@cherrystudio/provider-registry';

import {
  createPresetProviderInput,
  isRecommendedPresetProvider,
} from '@/backend/data/services/presetProviders';
import type {
  ProviderRegistryUpdateCheck,
  ProviderRegistryUpdateEvent,
  ProviderRegistryUpdateResult,
  ProvidersModule,
} from '@/shared/contracts';
import type { Provider } from '@/shared/data/types/provider';

type ProviderAvatarStorage = {
  persist(providerId: string, sourceUri: string): Promise<string>;
  remove(providerId: string): void;
  resolve(providerId: string): string | undefined;
};

export type ProvidersModuleDependencies = {
  avatars: ProviderAvatarStorage;
  catalog: {
    isExcluded(providerId: string): boolean;
    list(): ProtoProviderConfig[];
  };
  providers: {
    create(input: ReturnType<typeof createPresetProviderInput>): Promise<Provider>;
    find(providerId: string): Promise<Provider | null>;
    list(): Promise<Provider[]>;
  };
  registryUpdates: {
    apply(): Promise<ProviderRegistryUpdateResult>;
    check(): Promise<ProviderRegistryUpdateCheck>;
    subscribe(listener: (event: ProviderRegistryUpdateEvent) => void): () => void;
  };
};

export function createProvidersModule({
  avatars,
  catalog,
  providers,
  registryUpdates,
}: ProvidersModuleDependencies): ProvidersModule {
  return {
    applyRegistryUpdate: registryUpdates.apply,
    checkRegistryUpdate: registryUpdates.check,
    importPreset: async (providerId) => {
      const preset = catalog
        .list()
        .find((candidate) => candidate.id === providerId && !catalog.isExcluded(candidate.id));

      if (!preset) {
        throw new Error(`Provider preset '${providerId}' is unavailable`);
      }

      return (
        (await providers.find(providerId)) ?? providers.create(createPresetProviderInput(preset))
      );
    },
    listCatalog: async () => {
      const installedProviderIds = new Set((await providers.list()).map((provider) => provider.id));

      return catalog
        .list()
        .filter((provider) => !catalog.isExcluded(provider.id))
        .map((provider) => ({
          ...(provider.description ? { description: provider.description } : {}),
          id: provider.id,
          isInstalled: installedProviderIds.has(provider.id),
          isRecommended: isRecommendedPresetProvider(provider.id),
          name: provider.name,
        }));
    },
    persistAvatar: avatars.persist,
    removeAvatar: avatars.remove,
    resolveAvatar: avatars.resolve,
    subscribeRegistryUpdates: registryUpdates.subscribe,
  };
}
