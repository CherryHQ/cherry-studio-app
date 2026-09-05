import * as z from 'zod';

import type {
  WebSearchCapability,
  WebSearchProviderCapabilityOverride,
  WebSearchProviderCapabilityOverrides,
  WebSearchProviderId,
  WebSearchProviderOverride,
  WebSearchProviderOverrides,
  WebSearchProviderType,
} from '@/shared/data/types/webSearch';
import { WEB_SEARCH_PROVIDER_IDS } from '@/shared/data/types/webSearch';

export const WebSearchProviderIdSchema = z.enum(WEB_SEARCH_PROVIDER_IDS);
export const WebSearchProviderCapabilityOverrideSchema: z.ZodType<WebSearchProviderCapabilityOverride> =
  z.strictObject({ apiHost: z.string().optional() });
export const WebSearchProviderCapabilityOverridesSchema: z.ZodType<WebSearchProviderCapabilityOverrides> =
  z.strictObject({
    fetchUrls: WebSearchProviderCapabilityOverrideSchema.optional(),
    searchKeywords: WebSearchProviderCapabilityOverrideSchema.optional(),
  });
export const WebSearchProviderOverrideSchema: z.ZodType<WebSearchProviderOverride> = z.strictObject(
  {
    apiKeys: z.array(z.string()).optional(),
    basicAuthPassword: z.string().optional(),
    basicAuthUsername: z.string().optional(),
    capabilities: WebSearchProviderCapabilityOverridesSchema.optional(),
    engines: z.array(z.string()).optional(),
  },
);
export const WebSearchProviderOverridesSchema: z.ZodType<WebSearchProviderOverrides> =
  z.partialRecord(WebSearchProviderIdSchema, WebSearchProviderOverrideSchema);

type WebSearchProviderPresetCapability = {
  apiHost?: string;
  feature: WebSearchCapability;
};

type WebSearchProviderPresetConfig = {
  capabilities: readonly WebSearchProviderPresetCapability[];
  name: string;
  type: WebSearchProviderType;
};

export interface WebSearchProviderPreset extends WebSearchProviderPresetConfig {
  id: WebSearchProviderId;
}

export const WEB_SEARCH_PROVIDER_PRESET_MAP = {
  zhipu: {
    name: 'Zhipu',
    type: 'api',
    capabilities: [
      { feature: 'searchKeywords', apiHost: 'https://open.bigmodel.cn/api/paas/v4/web_search' },
    ],
  },
  tavily: {
    name: 'Tavily',
    type: 'api',
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.tavily.com' }],
  },
  searxng: {
    name: 'Searxng',
    type: 'api',
    capabilities: [{ feature: 'searchKeywords', apiHost: 'http://localhost:8080' }],
  },
  exa: {
    name: 'Exa',
    type: 'api',
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.exa.ai' }],
  },
  'exa-mcp': {
    name: 'ExaMCP',
    type: 'mcp',
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://mcp.exa.ai/mcp' }],
  },
  bocha: {
    name: 'Bocha',
    type: 'api',
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.bochaai.com' }],
  },
  querit: {
    name: 'Querit',
    type: 'api',
    capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.querit.ai' }],
  },
  fetch: {
    name: 'fetch',
    type: 'api',
    capabilities: [{ feature: 'fetchUrls' }],
  },
  jina: {
    name: 'Jina',
    type: 'api',
    capabilities: [
      { feature: 'searchKeywords', apiHost: 'https://s.jina.ai' },
      { feature: 'fetchUrls', apiHost: 'https://r.jina.ai' },
    ],
  },
  firecrawl: {
    name: 'Firecrawl',
    type: 'api',
    capabilities: [
      { feature: 'searchKeywords', apiHost: 'https://api.firecrawl.dev' },
      { feature: 'fetchUrls', apiHost: 'https://api.firecrawl.dev' },
    ],
  },
} as const satisfies Record<WebSearchProviderId, WebSearchProviderPresetConfig>;

/** Providers exposed by the mobile UI. `fetch` and SearXNG remain data-compatible only. */
export const MOBILE_SUPPORTED_WEB_SEARCH_PROVIDER_IDS = [
  'zhipu',
  'tavily',
  'exa',
  'exa-mcp',
  'bocha',
  'querit',
  'jina',
  'firecrawl',
] as const satisfies readonly WebSearchProviderId[];

const MOBILE_SUPPORTED_WEB_SEARCH_PROVIDER_ID_SET = new Set<WebSearchProviderId>(
  MOBILE_SUPPORTED_WEB_SEARCH_PROVIDER_IDS,
);

export const MOBILE_SUPPORTED_WEB_SEARCH_PROVIDERS: readonly WebSearchProviderPreset[] =
  MOBILE_SUPPORTED_WEB_SEARCH_PROVIDER_IDS.map((id) => ({
    id,
    ...WEB_SEARCH_PROVIDER_PRESET_MAP[id],
  }));

export function getMobileSupportedWebSearchProvidersByCapability(capability: WebSearchCapability) {
  return MOBILE_SUPPORTED_WEB_SEARCH_PROVIDERS.filter((provider) =>
    provider.capabilities.some((item) => item.feature === capability),
  );
}

export function isMobileSupportedWebSearchProviderId(providerId: WebSearchProviderId): boolean {
  return MOBILE_SUPPORTED_WEB_SEARCH_PROVIDER_ID_SET.has(providerId);
}
