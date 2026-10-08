import { WEB_SEARCH_PROVIDER_PRESET_MAP } from '@/shared/data/presets/webSearchProviders';
import type {
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
} from '@/shared/data/types/webSearch';

export type WebSearchProviderDetailSection = { type: 'apiKeys' } | { type: 'zhipuApiKeyShortcut' };

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
