import type {
  PersistedEndpointConfig,
  RegistryEndpointConfig,
} from '@cherrystudio/provider-registry';

import type { MobileProviderConfig } from './mobileProviderCatalog';

interface RuntimeEndpointConfig extends PersistedEndpointConfig {
  reasoningFormatType?: string;
}

export function buildRuntimeEndpointConfigs(
  registryConfigs: Record<string, RegistryEndpointConfig> | undefined,
): Record<string, RuntimeEndpointConfig> | null {
  if (!registryConfigs || Object.keys(registryConfigs).length === 0) return null;

  const configs: Record<string, RuntimeEndpointConfig> = {};

  for (const [key, registryConfig] of Object.entries(registryConfigs)) {
    const config: RuntimeEndpointConfig = {};
    if (registryConfig.baseUrl) config.baseUrl = registryConfig.baseUrl;
    if (registryConfig.modelsApiUrls) config.modelsApiUrls = registryConfig.modelsApiUrls;
    if (registryConfig.reasoningFormat?.type)
      config.reasoningFormatType = registryConfig.reasoningFormat.type;
    if (registryConfig.adapterFamily) config.adapterFamily = registryConfig.adapterFamily;
    if (registryConfig.dialect) config.dialect = registryConfig.dialect;
    if (Object.keys(config).length > 0) configs[key] = config;
  }

  return Object.keys(configs).length > 0 ? configs : null;
}

/**
 * Bridge new registry ownership into Mobile's persisted legacy feature flags.
 * Remove after user_provider no longer stores apiFeatures.
 */
export function projectLegacyApiFeatures(provider: MobileProviderConfig): {
  arrayContent?: boolean;
  reportsActualCost?: boolean;
  serviceTier?: boolean;
  streamOptions?: boolean;
  verbosity?: boolean;
} | null {
  const defaultEndpoint = provider.defaultChatEndpoint
    ? provider.endpointConfigs?.[provider.defaultChatEndpoint]
    : undefined;

  const features = {
    ...provider.apiFeatures,
    ...(provider.reportsActualCost ? { reportsActualCost: true } : {}),
    ...(defaultEndpoint?.requestControls?.serviceTier ? { serviceTier: true } : {}),
    ...(defaultEndpoint?.dialect?.streamOptions !== undefined
      ? { streamOptions: defaultEndpoint.dialect.streamOptions }
      : {}),
  };

  return Object.keys(features).length > 0 ? features : null;
}
