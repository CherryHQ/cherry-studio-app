import type { WebSearchCapability, WebSearchProvider } from '@/shared/data/types/webSearch';

import { WebSearchConfigError } from '../WebSearchConfigError';

export function resolveProviderApiHost(
  provider: WebSearchProvider,
  capability: WebSearchCapability,
): string {
  const host = provider.capabilities.find((item) => item.feature === capability)?.apiHost?.trim();
  if (!host) {
    throw new WebSearchConfigError(
      'api_host_missing',
      `API host is required for provider ${provider.id} capability ${capability}`,
    );
  }

  let protocol: string;
  try {
    protocol = new URL(host).protocol;
  } catch (cause) {
    throw new WebSearchConfigError(
      'api_host_invalid',
      `API host must be a valid HTTP(S) URL for provider ${provider.id} capability ${capability}`,
      { cause },
    );
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new WebSearchConfigError(
      'api_host_invalid',
      `API host must be a valid HTTP(S) URL for provider ${provider.id} capability ${capability}`,
    );
  }

  return host;
}

/**
 * The configuration a capability needs before any request is worth sending. Adapters still resolve
 * their own host and key; this states the preset's contract once for every provider.
 */
export function assertProviderReady(
  provider: WebSearchProvider,
  capability: WebSearchCapability,
): void {
  const providerCapability = provider.capabilities.find((item) => item.feature === capability);
  if (!providerCapability) {
    throw new WebSearchConfigError(
      'capability_unsupported',
      `Web search provider ${provider.id} does not support capability ${capability}`,
    );
  }
  if (providerCapability.requiresApiHost) {
    resolveProviderApiHost(provider, capability);
  }
  if (providerCapability.requiresApiKey && !provider.apiKeys.some((key) => key.trim())) {
    throw new WebSearchConfigError(
      'api_key_missing',
      `API key is required for provider ${provider.id}`,
    );
  }
}

export class ApiKeyRotationState {
  private readonly lastUsedKeyByProvider = new Map<WebSearchProvider['id'], string>();

  resolve(provider: WebSearchProvider, required = true): string {
    // `indexOf` reports the first occurrence, so a repeated entry would pin the rotation to it.
    const keys = [...new Set(provider.apiKeys.flatMap((key) => key.trim() || []))];

    if (keys.length === 0) {
      if (required) {
        throw new WebSearchConfigError(
          'api_key_missing',
          `API key is required for provider ${provider.id}`,
        );
      }
      return '';
    }

    if (keys.length === 1) {
      return keys[0];
    }

    const lastUsedKey = this.lastUsedKeyByProvider.get(provider.id);
    const currentIndex = lastUsedKey ? keys.indexOf(lastUsedKey) : -1;
    const nextIndex = (currentIndex + 1) % keys.length;
    const nextKey = keys[nextIndex];

    this.lastUsedKeyByProvider.set(provider.id, nextKey);
    return nextKey;
  }

  clear(): void {
    this.lastUsedKeyByProvider.clear();
  }
}
