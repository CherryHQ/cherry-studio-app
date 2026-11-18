import { getBaseUrl } from '@cherrystudio/ai-runtime/provider';

import { providerService } from '@/backend/data/services/ProviderService';
import { deepseekServiceBaseUrl } from '@/backend/services/providers/deepseekConnection';
import { ErrorCode, isDataApiError } from '@/shared/data/api/errors';
import type { PreferenceSchema, PreferenceKeyType } from '@/shared/data/preference';
import {
  WEB_SEARCH_PROVIDER_PRESET_MAP,
  type WebSearchProviderPreset,
} from '@/shared/data/presets/webSearchProviders';
import type { Provider } from '@/shared/data/types/provider';
import type {
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderOverride,
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
  override?: WebSearchProviderOverride,
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

/**
 * `exa-mcp` and `exa` are the same service behind two presets, and only `exa` has a key field.
 * Without keys of its own, `exa-mcp` authenticates with the ones configured there.
 */
function inheritExaMcpApiKeys(
  provider: WebSearchProvider,
  providerOverrides: WebSearchProviderOverrides,
): WebSearchProvider {
  if (provider.id !== 'exa-mcp' || provider.apiKeys.length > 0) {
    return provider;
  }

  const exaKeys = trimStringList(providerOverrides.exa?.apiKeys ?? []);
  return exaKeys.length > 0 ? { ...provider, apiKeys: exaKeys } : provider;
}

async function inheritZhipuModelProviderApiKeys(
  provider: WebSearchProvider,
): Promise<WebSearchProvider> {
  if (provider.id !== 'zhipu') {
    return provider;
  }

  try {
    const { keys } = await providerService.listApiKeys('zhipu', { enabled: true });
    return { ...provider, apiKeys: trimStringList(keys.map((entry) => entry.key)) };
  } catch (error) {
    if (isDataApiError(error) && error.code === ErrorCode.NOT_FOUND) {
      return { ...provider, apiKeys: [] };
    }
    throw error;
  }
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

/** The DeepSeek model provider serves search once it is enabled with an API key. */
async function linkDeepseekModelProvider(
  provider: WebSearchProvider,
): Promise<WebSearchProvider | undefined> {
  let linked: Provider;
  try {
    linked = await providerService.getByProviderId('deepseek');
  } catch (error) {
    if (isDataApiError(error) && error.code === ErrorCode.NOT_FOUND) return undefined;
    throw error;
  }
  if (!linked.isEnabled || linked.authType !== 'api-key') return undefined;
  const { keys } = await providerService.listApiKeys('deepseek', { enabled: true });
  const apiKeys = trimStringList(keys.map((entry) => entry.key));
  if (apiKeys.length === 0) return undefined;
  const apiHost = deepseekServiceBaseUrl(getBaseUrl(linked));
  return {
    ...provider,
    credentialsProviderId: 'deepseek',
    apiKeys,
    capabilities: provider.capabilities.map((capability) => ({ ...capability, apiHost })),
  };
}

/**
 * `override` replaces independent settings so unsaved fields use the same lookup path.
 * DeepSeek prefers the model provider's credentials and address. Released search-only settings
 * remain the fallback until that provider has an enabled key; the page no longer edits them.
 */
export async function getProviderById<TProviderId extends WebSearchProvider['id']>(
  providerId: TProviderId,
  preferences: WebSearchPreferenceReader,
  override?: WebSearchProviderOverride,
): Promise<WebSearchProvider & { id: TProviderId }> {
  const providerOverrides = await getProviderOverrides(preferences);
  const preset = getWebSearchProviderPresetById(providerId);
  const provider = mergeWebSearchProviderPreset(
    preset,
    providerId === 'deepseek'
      ? providerOverrides.deepseek
      : (override ?? providerOverrides[providerId]),
  );

  if (providerId === 'deepseek') {
    const linked = await linkDeepseekModelProvider(provider);
    if (linked) return linked as WebSearchProvider & { id: TProviderId };
  }

  return (await inheritZhipuModelProviderApiKeys(
    inheritExaMcpApiKeys(provider, providerOverrides),
  )) as WebSearchProvider & { id: TProviderId };
}

export async function getProviderForCapability(
  requestedProviderId: WebSearchProvider['id'] | undefined,
  capability: WebSearchCapability,
  preferences: WebSearchPreferenceReader,
  override?: WebSearchProviderOverride,
): Promise<WebSearchProvider> {
  const providerId =
    requestedProviderId ?? (await preferences.get(DEFAULT_PROVIDER_KEY_BY_CAPABILITY[capability]));

  if (!providerId) {
    throw new WebSearchConfigError(
      'provider_not_configured',
      `Default web search provider is not configured for capability ${capability}`,
    );
  }

  const provider = await getProviderById(providerId, preferences, override);

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
