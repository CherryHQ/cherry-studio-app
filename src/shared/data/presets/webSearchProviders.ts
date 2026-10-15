import * as z from 'zod';

import type {
  WebSearchCapability,
  WebSearchProviderCapabilityOverride,
  WebSearchProviderCapabilityOverrides,
  WebSearchProviderFeatureCapability,
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

type WebSearchProviderPresetConfig = {
  capabilities: readonly WebSearchProviderFeatureCapability[];
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
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://open.bigmodel.cn/api/paas/v4/web_search',
      },
    ],
  },
  tavily: {
    name: 'Tavily',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.tavily.com',
      },
    ],
  },
  searxng: {
    name: 'Searxng',
    type: 'api',
    // Desktop defaults to a local instance; a phone has none to reach, so the user supplies it.
    capabilities: [
      { feature: 'searchKeywords', requiresApiHost: true, requiresApiKey: false, apiHost: '' },
    ],
  },
  exa: {
    name: 'Exa',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.exa.ai',
      },
    ],
  },
  'exa-mcp': {
    name: 'ExaMCP',
    type: 'mcp',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: false,
        apiHost: 'https://mcp.exa.ai/mcp',
      },
      {
        feature: 'fetchUrls',
        requiresApiHost: true,
        requiresApiKey: false,
        apiHost: 'https://mcp.exa.ai/mcp',
      },
    ],
  },
  bocha: {
    name: 'Bocha',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.bochaai.com',
      },
    ],
  },
  querit: {
    name: 'Querit',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.querit.ai',
      },
      {
        feature: 'fetchUrls',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.querit.ai',
      },
    ],
  },
  fetch: {
    name: 'fetch',
    type: 'api',
    capabilities: [{ feature: 'fetchUrls', requiresApiHost: false, requiresApiKey: false }],
  },
  jina: {
    name: 'Jina',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://s.jina.ai',
      },
      {
        feature: 'fetchUrls',
        requiresApiHost: true,
        requiresApiKey: false,
        apiHost: 'https://r.jina.ai',
      },
    ],
  },
  firecrawl: {
    name: 'Firecrawl',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: false,
        apiHost: 'https://api.firecrawl.dev',
      },
      {
        feature: 'fetchUrls',
        requiresApiHost: true,
        requiresApiKey: false,
        apiHost: 'https://api.firecrawl.dev',
      },
    ],
  },
  crawl4ai: {
    name: 'Crawl4AI',
    type: 'api',
    capabilities: [
      { feature: 'fetchUrls', requiresApiHost: true, requiresApiKey: false, apiHost: '' },
    ],
  },
  parallel: {
    name: 'Parallel',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.parallel.ai',
      },
    ],
  },
  serply: {
    name: 'Serply',
    type: 'api',
    capabilities: [
      {
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
        apiHost: 'https://api.serply.io',
      },
    ],
  },
} as const satisfies Record<WebSearchProviderId, WebSearchProviderPresetConfig>;

const PRESETS_WEB_SEARCH_PROVIDERS: readonly WebSearchProviderPreset[] =
  WEB_SEARCH_PROVIDER_IDS.map((id) => ({ id, ...WEB_SEARCH_PROVIDER_PRESET_MAP[id] }));

export function getWebSearchProviderPresetsByCapability(capability: WebSearchCapability) {
  return PRESETS_WEB_SEARCH_PROVIDERS.filter((provider) =>
    provider.capabilities.some((item) => item.feature === capability),
  );
}
