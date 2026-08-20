import type {
  WebSearchCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
} from '@cherrystudio/universal/data/preference';
import {
  MOBILE_SUPPORTED_WEB_SEARCH_PROVIDERS,
  WEB_SEARCH_PROVIDER_PRESET_MAP,
  type WebSearchProviderPreset,
} from '@cherrystudio/universal/data/presets/webSearchProviders';

export type WebSearchProviderCapability = WebSearchProviderPreset['capabilities'][number];

export type WebSearchProviderMenuEntry = {
  capability: WebSearchCapability;
  key: string;
  provider: WebSearchProviderPreset;
  providerCapability: WebSearchProviderCapability;
};

export type WebSearchProviderFeatureSection = {
  capability: WebSearchCapability;
  entries: WebSearchProviderMenuEntry[];
};

export type WebSearchProviderDetailSection = { type: 'apiKeys' } | { type: 'zhipuApiKeyShortcut' };

const WEB_SEARCH_CAPABILITY_ORDER: readonly WebSearchCapability[] = [
  'searchKeywords',
  'fetchUrls',
] as const;

const WEB_SEARCH_PROVIDER_DETAIL_SECTIONS = {
  bocha: [{ type: 'apiKeys' }],
  exa: [{ type: 'apiKeys' }],
  'exa-mcp': [],
  fetch: [],
  firecrawl: [{ type: 'apiKeys' }],
  jina: [{ type: 'apiKeys' }],
  querit: [{ type: 'apiKeys' }],
  searxng: [],
  tavily: [{ type: 'apiKeys' }],
  zhipu: [{ type: 'zhipuApiKeyShortcut' }],
} as const satisfies Record<WebSearchProviderId, readonly WebSearchProviderDetailSection[]>;

export function getWebSearchProviderPreset(providerId: WebSearchProviderId) {
  return {
    id: providerId,
    ...WEB_SEARCH_PROVIDER_PRESET_MAP[providerId],
  };
}

export function getWebSearchProviderDetailSections(
  providerId: WebSearchProviderId,
): readonly WebSearchProviderDetailSection[] {
  return WEB_SEARCH_PROVIDER_DETAIL_SECTIONS[providerId];
}

export function getWebSearchCapabilityTitleKey(capability: WebSearchCapability): string {
  return capability === 'fetchUrls'
    ? 'settings.websearch.capability.fetchUrls'
    : 'settings.websearch.capability.searchKeywords';
}

export function createWebSearchMenuEntry(
  provider: WebSearchProviderPreset,
  capability: WebSearchCapability,
): WebSearchProviderMenuEntry | null {
  const providerCapability = provider.capabilities.find((item) => item.feature === capability);

  if (!providerCapability) {
    return null;
  }

  return {
    key: `${capability}:${provider.id}`,
    capability,
    provider,
    providerCapability,
  };
}

export function getWebSearchFeatureSections(
  providers: readonly WebSearchProviderPreset[] = MOBILE_SUPPORTED_WEB_SEARCH_PROVIDERS,
): WebSearchProviderFeatureSection[] {
  return WEB_SEARCH_CAPABILITY_ORDER.flatMap((capability) => {
    const entries = providers.flatMap((provider) => {
      const entry = createWebSearchMenuEntry(provider, capability);
      return entry ? [entry] : [];
    });

    return entries.length > 0 ? [{ capability, entries }] : [];
  });
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
