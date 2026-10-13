import {
  WEB_SEARCH_PROVIDER_PRESET_MAP,
  type WebSearchProviderPreset,
} from '@/shared/data/presets/webSearchProviders';
import type {
  WebSearchCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
} from '@/shared/data/types/webSearch';

export type WebSearchProviderDetailSection =
  | { type: 'apiHost' }
  | { type: 'apiKeys' }
  | { type: 'basicAuth' }
  | { type: 'zhipuApiKeyShortcut' };

export function getWebSearchProviderPreset(providerId: WebSearchProviderId) {
  return {
    id: providerId,
    ...WEB_SEARCH_PROVIDER_PRESET_MAP[providerId],
  };
}

export function getWebSearchProviderCapability(
  provider: WebSearchProviderPreset,
  capability: WebSearchCapability,
) {
  return provider.capabilities.find((item) => item.feature === capability);
}

/** The settings a provider exposes for one capability, in display order. */
export function getWebSearchProviderDetailSections(
  provider: WebSearchProviderPreset,
  capability: WebSearchCapability,
): readonly WebSearchProviderDetailSection[] {
  const sections: WebSearchProviderDetailSection[] = [];

  if (provider.id === 'zhipu') {
    // Zhipu search authenticates with the Zhipu model provider's key.
    sections.push({ type: 'zhipuApiKeyShortcut' });
  } else if (provider.type === 'api' && provider.id !== 'fetch' && provider.id !== 'searxng') {
    sections.push({ type: 'apiKeys' });
  }
  if (getWebSearchProviderCapability(provider, capability)?.apiHost !== undefined) {
    sections.push({ type: 'apiHost' });
  }
  if (provider.id === 'searxng') {
    sections.push({ type: 'basicAuth' });
  }

  return sections;
}

export type WebSearchProviderCheckPlacement = 'apiHost' | 'apiKeys' | null;

/**
 * The check button sits beside the setting a check depends on: the address for a self-hosted
 * provider or one without a key field, otherwise the key.
 */
export function getWebSearchProviderCheckPlacement(
  provider: WebSearchProviderPreset,
  capability: WebSearchCapability,
): WebSearchProviderCheckPlacement {
  const sections = new Set(
    getWebSearchProviderDetailSections(provider, capability).map((section) => section.type),
  );
  const hasApiKeys = sections.has('apiKeys');

  if (
    sections.has('apiHost') &&
    (!hasApiKeys || isSelfHostedWebSearchProvider(provider, capability))
  ) {
    return 'apiHost';
  }
  return hasApiKeys ? 'apiKeys' : null;
}

/** A provider whose preset has no address runs on the user's own server. */
export function isSelfHostedWebSearchProvider(
  provider: WebSearchProviderPreset,
  capability: WebSearchCapability,
): boolean {
  const providerCapability = getWebSearchProviderCapability(provider, capability);
  return providerCapability?.requiresApiHost === true && !providerCapability.apiHost;
}

/** Empty text restores the preset address; anything else must be an HTTP(S) URL. */
export function parseWebSearchApiHostInput(
  input: string,
): { apiHost: string | undefined; valid: true } | { valid: false } {
  const apiHost = input.trim().replace(/\/+$/, '');
  if (!apiHost) return { apiHost: undefined, valid: true };

  try {
    const { protocol } = new URL(apiHost);
    return protocol === 'http:' || protocol === 'https:'
      ? { apiHost, valid: true }
      : { valid: false };
  } catch {
    return { valid: false };
  }
}

export function mergeWebSearchProviderOverride(
  overrides: WebSearchProviderOverrides,
  providerId: WebSearchProviderId,
  patch: WebSearchProviderOverride,
): WebSearchProviderOverrides {
  return {
    ...overrides,
    [providerId]: {
      ...overrides[providerId],
      ...patch,
      capabilities: patch.capabilities
        ? {
            ...overrides[providerId]?.capabilities,
            ...patch.capabilities,
          }
        : overrides[providerId]?.capabilities,
    },
  };
}
