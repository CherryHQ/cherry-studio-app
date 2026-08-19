import type { Provider } from '@cherrystudio/universal/data/types/provider';

export interface ProvidersModule {
  canRemove(provider: Pick<Provider, 'id' | 'presetProviderId'>): boolean;
  persistAvatar(id: string, sourceUri: string): Promise<string>;
  removeAvatar(id: string): void;
  resolveAvatar(id: string): string | undefined;
}
