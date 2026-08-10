import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { randomUUID } from 'expo-crypto';

export const OAUTH_API_KEY_LABEL = 'OAuth';

export interface OAuthApiKeyRepository {
  listApiKeys(providerId: string): Promise<{ keys: ApiKeyEntry[] }>;
  replaceApiKeys(providerId: string, apiKeys: ApiKeyEntry[]): Promise<unknown>;
}

export class OAuthApiKeyStore {
  constructor(private readonly providers: OAuthApiKeyRepository) {}

  async has(providerId: string): Promise<boolean> {
    const { keys } = await this.providers.listApiKeys(providerId);
    return keys.some(
      (entry) => entry.label === OAUTH_API_KEY_LABEL && entry.isEnabled && Boolean(entry.key),
    );
  }

  async replace(providerId: string, apiKeys: string): Promise<void> {
    const manual = await this.readManual(providerId);
    const manualValues = new Set(manual.map((entry) => entry.key));
    const minted = apiKeys
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key && !manualValues.has(key))
      .map((key) => ({
        id: `oauth-${randomUUID()}`,
        isEnabled: true,
        key,
        label: OAUTH_API_KEY_LABEL,
      }));

    await this.providers.replaceApiKeys(providerId, [...manual, ...minted]);
  }

  async clear(providerId: string): Promise<void> {
    await this.providers.replaceApiKeys(providerId, await this.readManual(providerId));
  }

  private async readManual(providerId: string): Promise<ApiKeyEntry[]> {
    const { keys } = await this.providers.listApiKeys(providerId);
    return keys.filter((entry) => entry.label !== OAUTH_API_KEY_LABEL);
  }
}
