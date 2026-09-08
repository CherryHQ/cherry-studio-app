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
import { ProviderSetupError, type ProviderSetupStatus } from '@/shared/contracts/providers';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/shared/data/types/provider';

import { getProviderConfigurationIssue } from './providerConfiguration';

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
    get(providerId: string): Promise<Provider>;
    keys(providerId: string): Promise<ApiKeyEntry[]>;
    auth(providerId: string): Promise<AuthConfig | null>;
    enable(providerId: string): Promise<Provider>;
  };
  hasAvailableModels(provider: Provider): Promise<boolean>;
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
  hasAvailableModels,
}: ProvidersModuleDependencies): ProvidersModule {
  const getSetupStatus = async (providerId: string): Promise<ProviderSetupStatus> => {
    const provider = await providers.get(providerId);
    const [keys, auth] = await Promise.all([
      providers.keys(providerId),
      providers.auth(providerId),
    ]);
    const issue = getProviderConfigurationIssue(provider, keys, auth);
    return { provider, issue, hasModels: !issue && (await hasAvailableModels(provider)) };
  };
  return {
    getSetupStatus,
    enable: async (providerId) => {
      const status = await getSetupStatus(providerId);
      if (status.issue) throw new ProviderSetupError(status.issue);
      if (!status.hasModels) throw new ProviderSetupError('no-models');
      return status.provider.isEnabled ? status.provider : providers.enable(providerId);
    },
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
