import type {
  WebSearchCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
} from '@/data/preference';
import {
  PRESETS_WEB_SEARCH_PROVIDERS,
  WEB_SEARCH_PROVIDER_PRESET_MAP,
  type WebSearchProviderPreset,
} from '@/data/presets/webSearchProviders';

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

export type WebSearchProviderDetailSection =
  | { type: 'apiKeys' }
  | { type: 'basicAuth' }
  | { type: 'capabilityApiHosts' }
  | { type: 'description' }
  | { type: 'zhipuApiKeyShortcut' };

type WebSearchProviderDisplayMeta = {
  descriptionKey?: string;
  officialWebsite?: string;
};

const WEB_SEARCH_CAPABILITY_ORDER: readonly WebSearchCapability[] = [
  'searchKeywords',
  'fetchUrls',
] as const;

const WEB_SEARCH_PROVIDER_DISPLAY_META: Record<WebSearchProviderId, WebSearchProviderDisplayMeta> =
  {
    bocha: {
      officialWebsite: 'https://bochaai.com',
    },
    exa: {
      officialWebsite: 'https://exa.ai',
    },
    'exa-mcp': {
      officialWebsite: 'https://exa.ai',
    },
    fetch: {
      descriptionKey: 'settings.websearch.providerDescription.fetch',
    },
    jina: {
      officialWebsite: 'https://jina.ai/reader',
    },
    querit: {
      officialWebsite: 'https://querit.ai',
    },
    searxng: {
      officialWebsite: 'https://docs.searxng.org',
    },
    tavily: {
      officialWebsite: 'https://tavily.com',
    },
    zhipu: {
      officialWebsite: 'https://docs.bigmodel.cn/cn/guide/tools/web-search',
    },
  };

const WEB_SEARCH_PROVIDER_DETAIL_SECTIONS = {
  bocha: [{ type: 'apiKeys' }, { type: 'capabilityApiHosts' }],
  exa: [{ type: 'apiKeys' }, { type: 'capabilityApiHosts' }],
  'exa-mcp': [],
  fetch: [{ type: 'description' }],
  jina: [{ type: 'apiKeys' }, { type: 'capabilityApiHosts' }],
  querit: [{ type: 'apiKeys' }, { type: 'capabilityApiHosts' }],
  searxng: [{ type: 'capabilityApiHosts' }, { type: 'basicAuth' }],
  tavily: [{ type: 'apiKeys' }, { type: 'capabilityApiHosts' }],
  zhipu: [{ type: 'zhipuApiKeyShortcut' }, { type: 'capabilityApiHosts' }],
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

export function getWebSearchProviderDescriptionKey(
  providerId: WebSearchProviderId,
): string | undefined {
  return WEB_SEARCH_PROVIDER_DISPLAY_META[providerId].descriptionKey;
}

export function getWebSearchProviderOfficialWebsite(
  providerId: WebSearchProviderId,
): string | undefined {
  return WEB_SEARCH_PROVIDER_DISPLAY_META[providerId].officialWebsite;
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
  providers: readonly WebSearchProviderPreset[] = PRESETS_WEB_SEARCH_PROVIDERS,
): WebSearchProviderFeatureSection[] {
  return WEB_SEARCH_CAPABILITY_ORDER.map((capability) => {
    const entries = providers
      .map((provider) => createWebSearchMenuEntry(provider, capability))
      .filter((entry): entry is WebSearchProviderMenuEntry => Boolean(entry));

    return { capability, entries };
  }).filter((section) => section.entries.length > 0);
}

export function normalizeWebSearchApiHost(value: string): string {
  return value.trim().replace(/\/+$/, '');
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
