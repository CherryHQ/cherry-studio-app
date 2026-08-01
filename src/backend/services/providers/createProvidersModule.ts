import type { Provider } from '@cherrystudio/universal/data/types/provider';

import type { ProvidersModule } from '@/shared/contracts';

type ProviderAvatarStorage = {
  persist(providerId: string, sourceUri: string): Promise<string>;
  resolve(providerId: string): string | undefined;
};

export type ProvidersModuleDependencies = {
  avatars: ProviderAvatarStorage;
  canRemove(provider: Pick<Provider, 'id' | 'presetProviderId'>): boolean;
};

export function createProvidersModule({
  avatars,
  canRemove,
}: ProvidersModuleDependencies): ProvidersModule {
  return {
    canRemove,
    persistAvatar: avatars.persist,
    resolveAvatar: avatars.resolve,
  };
}
