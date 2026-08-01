import type { Provider } from '@cherrystudio/universal/data/types/provider';

export interface ProvidersBackend {
  canRemove(provider: Pick<Provider, 'id' | 'presetProviderId'>): boolean;
  persistAvatar(id: string, sourceUri: string): Promise<string>;
  resolveAvatar(id: string): string | undefined;
}
