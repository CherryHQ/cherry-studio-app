import type { ProvidersModule } from '@/shared/contracts';
import type { Provider } from '@/shared/data/types/provider';

type ProviderAvatarStorage = {
  persist(providerId: string, sourceUri: string): Promise<string>;
  remove(providerId: string): void;
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
    removeAvatar: avatars.remove,
    resolveAvatar: avatars.resolve,
  };
}
