import type { MobileProviderConfig } from '@/backend/data/services/mobileProviderCatalog';
import {
  createPresetProviderInput,
  isRecommendedPresetProvider,
} from '@/backend/data/services/presetProviders';
import {
  ProviderSetupError,
  type ProviderAccountsModule,
  type ProviderRegistryUpdateEvent,
  type ProviderRegistryUpdateResult,
  type ProviderSetupStatus,
  type ProvidersModule,
} from '@/shared/contracts';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/shared/data/types/provider';

import { getProviderCatalogEdition } from './providerCatalogEdition';
import { getProviderConfigurationIssue } from './providerConfiguration';

type ProviderAvatarStorage = {
  persist(providerId: string, sourceUri: string): Promise<string>;
  remove(providerId: string): void;
  resolve(providerId: string): string | undefined;
};

export type ProvidersModuleDependencies = {
  getCountry(): Promise<string | null>;
  accounts: ProviderAccountsModule;
  avatars: ProviderAvatarStorage;
  catalog: {
    isExcluded(providerId: string): boolean;
    list(): MobileProviderConfig[];
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
    ensureReady(): Promise<void>;
    apply(): Promise<ProviderRegistryUpdateResult>;
    subscribe(listener: (event: ProviderRegistryUpdateEvent) => void): () => void;
  };
};

export function createProvidersModule({
  getCountry,
  accounts,
  avatars,
  catalog,
  providers,
  registryUpdates,
  hasAvailableModels,
}: ProvidersModuleDependencies): ProvidersModule {
  const listRegionalCatalog = async () => {
    const edition = getProviderCatalogEdition(await getCountry());
    return catalog
      .list()
      .filter(
        (provider) =>
          !catalog.isExcluded(provider.id) &&
          (!provider.availableInEditions || provider.availableInEditions.includes(edition)),
      );
  };
  const getSetupStatus = async (providerId: string): Promise<ProviderSetupStatus> => {
    const provider = await providers.get(providerId);
    const [keys, auth] = await Promise.all([
      providers.keys(providerId),
      providers.auth(providerId),
    ]);
    const signedIn =
      accounts.getCapabilities(provider).flow === 'interactive'
        ? (await accounts.getStatus(providerId)).signedIn
        : false;
    const issue = getProviderConfigurationIssue(provider, keys, auth, signedIn);
    return { provider, issue, hasModels: !issue && (await hasAvailableModels(provider)) };
  };
  return {
    accounts,
    getSetupStatus,
    ensureRegistryReady: registryUpdates.ensureReady,
    enable: async (providerId) => {
      const status = await getSetupStatus(providerId);
      if (status.issue) throw new ProviderSetupError(status.issue);
      if (!status.hasModels) throw new ProviderSetupError('no-models');
      return status.provider.isEnabled ? status.provider : providers.enable(providerId);
    },
    applyRegistryUpdate: registryUpdates.apply,
    importPreset: async (providerId) => {
      const installed = await providers.find(providerId);
      if (installed) return installed;
      const preset = (await listRegionalCatalog()).find((candidate) => candidate.id === providerId);

      if (!preset) {
        throw new Error(`Provider preset '${providerId}' is unavailable`);
      }

      return providers.create(createPresetProviderInput(preset));
    },
    listCatalog: async () => {
      const [regionalCatalog, savedProviders] = await Promise.all([
        listRegionalCatalog(),
        providers.list(),
      ]);
      const installedProviders = new Map(savedProviders.map((provider) => [provider.id, provider]));

      return regionalCatalog.map((provider) => ({
        ...(provider.description ? { description: provider.description } : {}),
        id: provider.id,
        isEnabled: installedProviders.get(provider.id)?.isEnabled ?? false,
        isInstalled: installedProviders.has(provider.id),
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
