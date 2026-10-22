import { WEB_SEARCH_PROVIDER_CATALOG } from '@cherrystudio/web-search/catalog';
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

const MOBILE_REMOTE_CAPABILITIES: Record<
  Exclude<WebSearchProviderId, 'fetch'>,
  readonly WebSearchCapability[]
> = {
  zhipu: ['searchKeywords'],
  tavily: ['searchKeywords'],
  searxng: ['searchKeywords'],
  exa: ['searchKeywords'],
  'exa-mcp': ['searchKeywords', 'fetchUrls'],
  bocha: ['searchKeywords'],
  querit: ['searchKeywords', 'fetchUrls'],
  deepseek: ['searchKeywords', 'fetchUrls'],
  jina: ['searchKeywords', 'fetchUrls'],
  firecrawl: ['searchKeywords', 'fetchUrls'],
  crawl4ai: ['fetchUrls'],
  parallel: ['searchKeywords'],
  serply: ['searchKeywords'],
};

const remotePresets = Object.fromEntries(
  WEB_SEARCH_PROVIDER_IDS.filter((id) => id !== 'fetch').map(
    (id): [Exclude<WebSearchProviderId, 'fetch'>, WebSearchProviderPresetConfig] => {
      const metadata = WEB_SEARCH_PROVIDER_CATALOG[id];
      return [
        id,
        {
          name: metadata.name,
          type: metadata.type,
          capabilities: metadata.capabilities
            .filter((item) => MOBILE_REMOTE_CAPABILITIES[id].includes(item.capability))
            .map((item) => ({
              feature: item.capability,
              requiresApiHost: item.requiresApiHost,
              requiresApiKey: item.apiKey === 'required',
              apiHost: item.defaultApiHost ?? '',
            })),
        },
      ];
    },
  ),
) as Record<Exclude<WebSearchProviderId, 'fetch'>, WebSearchProviderPresetConfig>;

export const WEB_SEARCH_PROVIDER_PRESET_MAP: Record<
  WebSearchProviderId,
  WebSearchProviderPresetConfig
> = {
  ...remotePresets,
  fetch: {
    name: 'fetch',
    type: 'api',
    capabilities: [{ feature: 'fetchUrls', requiresApiHost: false, requiresApiKey: false }],
  },
};

const PRESETS_WEB_SEARCH_PROVIDERS: readonly WebSearchProviderPreset[] =
  WEB_SEARCH_PROVIDER_IDS.map((id) => ({ id, ...WEB_SEARCH_PROVIDER_PRESET_MAP[id] }));

export function getWebSearchProviderPresetsByCapability(capability: WebSearchCapability) {
  return PRESETS_WEB_SEARCH_PROVIDERS.filter((provider) =>
    provider.capabilities.some((item) => item.feature === capability),
  );
}
