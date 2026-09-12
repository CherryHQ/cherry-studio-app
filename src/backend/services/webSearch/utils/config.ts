import type { PreferenceSchema, PreferenceKeyType } from '@/shared/data/preference';
import {
  WEB_SEARCH_PROVIDER_PRESET_MAP,
  type WebSearchProviderPreset,
} from '@/shared/data/presets/webSearchProviders';
import type {
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderOverrides,
  WebSearchExecutionConfig,
} from '@/shared/data/types/webSearch';
import { normalizeWebSearchCutoffLimit } from '@/shared/data/types/webSearch';

import { WebSearchConfigError } from '../WebSearchConfigError';

export interface WebSearchPreferenceReader {
  get<K extends PreferenceKeyType>(key: K): PreferenceSchema[K] | Promise<PreferenceSchema[K]>;
}

const DEFAULT_PROVIDER_KEY_BY_CAPABILITY = {
  searchKeywords: 'chat.web_search.default_search_keywords_provider',
  fetchUrls: 'chat.web_search.default_fetch_urls_provider',
} as const satisfies Record<WebSearchCapability, PreferenceKeyType>;

function trimString(value: string): string {
  return value.trim();
}

function trimStringList(values: readonly string[]): string[] {
  return values.flatMap((value) => value.trim() || []);
}

export async function getProviderOverrides(
  preferences: WebSearchPreferenceReader,
): Promise<WebSearchProviderOverrides> {
  const providerOverrides = await preferences.get('chat.web_search.provider_overrides');
  return providerOverrides || {};
}

function getWebSearchProviderPresetById(
  providerId: WebSearchProvider['id'],
): WebSearchProviderPreset {
  if (!Object.hasOwn(WEB_SEARCH_PROVIDER_PRESET_MAP, providerId)) {
    throw new WebSearchConfigError(
      'provider_unknown',
      `Unknown web search provider: ${providerId}`,
    );
  }

  return {
    id: providerId,
    ...WEB_SEARCH_PROVIDER_PRESET_MAP[providerId],
  };
}

export function mergeWebSearchProviderPreset(
  preset: WebSearchProviderPreset,
  override?: WebSearchProviderOverrides[WebSearchProvider['id']],
): WebSearchProvider {
  return {
    id: preset.id,
    name: preset.name,
    type: preset.type,
    apiKeys: override?.apiKeys ? trimStringList(override.apiKeys) : [],
    capabilities: preset.capabilities.map((capability) => {
      const apiHostOverride = override?.capabilities?.[capability.feature]?.apiHost;

      if (capability.apiHost === undefined || apiHostOverride === undefined) {
        return capability;
      }

      return {
        ...capability,
        apiHost: trimString(apiHostOverride),
      };
    }),
    engines: override?.engines ? trimStringList(override.engines) : [],
    basicAuthUsername: trimString(override?.basicAuthUsername ?? ''),
    basicAuthPassword: trimString(override?.basicAuthPassword ?? ''),
  };
}

export async function getRuntimeConfig(
  preferences: WebSearchPreferenceReader,
): Promise<WebSearchExecutionConfig> {
  const [maxResults, method, cutoffLimit] = await Promise.all([
    preferences.get('chat.web_search.max_results'),
    preferences.get('chat.web_search.compression.method'),
    preferences.get('chat.web_search.compression.cutoff_limit'),
  ]);

  return {
    maxResults: Math.max(1, maxResults),
    compression: {
      method,
      cutoffLimit: normalizeWebSearchCutoffLimit(cutoffLimit),
    },
  };
}

export async function getProviderById<TProviderId extends WebSearchProvider['id']>(
  providerId: TProviderId,
  preferences: WebSearchPreferenceReader,
): Promise<WebSearchProvider & { id: TProviderId }> {
  const providerOverrides = await getProviderOverrides(preferences);
  const override = providerOverrides[providerId];
  const preset = getWebSearchProviderPresetById(providerId);

  return mergeWebSearchProviderPreset(preset, override) as WebSearchProvider & { id: TProviderId };
}

export async function getProviderForCapability(
  requestedProviderId: WebSearchProvider['id'] | undefined,
  capability: WebSearchCapability,
  preferences: WebSearchPreferenceReader,
): Promise<WebSearchProvider> {
  const providerId =
    requestedProviderId ?? (await preferences.get(DEFAULT_PROVIDER_KEY_BY_CAPABILITY[capability]));

  if (!providerId) {
    throw new WebSearchConfigError(
      'provider_not_configured',
      `Default web search provider is not configured for capability ${capability}`,
    );
  }

  const provider = await getProviderById(providerId, preferences);

  if (
    !provider.capabilities.some((providerCapability) => providerCapability.feature === capability)
  ) {
    throw new WebSearchConfigError(
      'capability_unsupported',
      `Web search provider ${providerId} does not support capability ${capability}`,
    );
  }

  return provider;
}

/**
 * Permanent configuration failures are typed at their owning boundary so callers never infer
 * retryability from error-message text.
 */
export function isPermanentWebSearchConfigError(error: unknown): error is WebSearchConfigError {
  return error instanceof WebSearchConfigError;
}
