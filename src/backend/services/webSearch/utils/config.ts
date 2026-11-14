import { providerService } from '@/backend/data/services/ProviderService';
import { DeepseekServicesSchema } from '@/shared/contracts/deepseek';
import { ErrorCode, isDataApiError } from '@/shared/data/api/errors';
import type { PreferenceSchema, PreferenceKeyType } from '@/shared/data/preference';
import {
  WEB_SEARCH_PROVIDER_PRESET_MAP,
  type WebSearchProviderPreset,
} from '@/shared/data/presets/webSearchProviders';
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

/**
 * `override` replaces independent settings so unsaved fields use the same lookup path.
 * An explicit live DeepSeek binding remains authoritative for its credentials and address.
 */
export async function getProviderById<TProviderId extends WebSearchProvider['id']>(
  providerId: TProviderId,
  preferences: WebSearchPreferenceReader,
  override?: WebSearchProviderOverride,
): Promise<WebSearchProvider & { id: TProviderId }> {
  const providerOverrides = await getProviderOverrides(preferences);
  const preset = getWebSearchProviderPresetById(providerId);
  const provider = mergeWebSearchProviderPreset(preset, override ?? providerOverrides[providerId]);

  const deepseek =
    providerId === 'deepseek' ? await preferences.get('feature.deepseek.services') : undefined;
  if (deepseek?.search && deepseek.providerId) {
    const linked = await providerService.getByProviderId(deepseek.providerId);
    const { keys } = await providerService.listApiKeys(deepseek.providerId, { enabled: true });
    return {
      ...provider,
      credentialsProviderId: deepseek.providerId,
      apiKeys:
        linked.isEnabled && linked.authType === 'api-key'
          ? trimStringList(keys.map((entry) => entry.key))
          : [],
      capabilities: provider.capabilities.map((capability) => ({
        ...capability,
        apiHost: DeepseekServicesSchema.shape.apiHost.parse(deepseek.apiHost),
      })),
    } as WebSearchProvider & { id: TProviderId };
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
