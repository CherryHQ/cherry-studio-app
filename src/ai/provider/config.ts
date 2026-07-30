/**
 * `Provider + Model` -> `ProviderConfig` for `@cherrystudio/ai-core`.
 * Always async because `providerService.getRotatedApiKey` is async.
 */

import { hasProviderConfig, type StringKeys } from '@cherrystudio/ai-core/provider';
import type { CherryInProviderSettings } from '@cherrystudio/ai-sdk-provider';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { defaultAppHeaders } from '@/config/constants';
import type { EndpointType, Model } from '@/data/types/model';
import type { AuthConfig, Provider } from '@/data/types/provider';
import { generateSignature } from '@/integration/cherryAi';
import {
  type AppProviderId,
  type AppProviderSettingsMap,
  appProviderIds,
  ProviderConfig,
} from '../types';
import {
  formatApiHost,
  formatOllamaApiHost,
  getExtraHeaders,
  isWithTrailingSharp,
  routeToEndpoint,
} from '../utils/provider';
import { resolveAiSdkProviderId, resolveEffectiveEndpoint } from './endpoint';

const appProviderIdMap = appProviderIds as Record<string, AppProviderId>;

interface BaseConfig {
  baseURL: string;
  apiKey: string;
}

interface ProviderConfigRuntime {
  getRotatedApiKey(providerId: string): Promise<string>;
  getAuthConfig(providerId: string): Promise<AuthConfig | null>;
}

interface BuilderContext {
  actualProvider: Provider;
  model: Model;
  baseConfig: BaseConfig;
  endpoint?: string;
  endpointType?: EndpointType;
  aiSdkProviderId: StringKeys<AppProviderSettingsMap>;
  runtime: ProviderConfigRuntime;
}

/** Applies endpoint-/provider-specific formatting (API version, Ollama/Gemini paths). */
function formatBaseURL(baseURL: string, provider: Provider, endpointType?: EndpointType): string {
  if (!baseURL) return '';

  const appendApiVersion = !isWithTrailingSharp(baseURL);

  // Endpoint-driven formatting
  if (
    endpointType === ENDPOINT_TYPE.OLLAMA_CHAT ||
    endpointType === ENDPOINT_TYPE.OLLAMA_GENERATE
  ) {
    return formatOllamaApiHost(baseURL);
  }
  if (endpointType === ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT) {
    return formatApiHost(baseURL, appendApiVersion, 'v1beta');
  }

  // Provider-driven formatting (for providers without endpoint type info)
  if (isOllamaProvider(provider)) return formatOllamaApiHost(baseURL);
  if (isGeminiProvider(provider)) return formatApiHost(baseURL, appendApiVersion, 'v1beta');

  // Providers that don't append API version
  const noVersionProviders = [
    'github',
    'cherryai',
    'perplexity',
    'newapi',
    'new-api',
    'azure-openai',
  ];
  if (
    noVersionProviders.includes(provider.id) ||
    noVersionProviders.includes(provider.presetProviderId ?? '')
  ) {
    return formatApiHost(baseURL, false);
  }

  return formatApiHost(baseURL, appendApiVersion);
}

// ── SDK Config Building ──

type ConfigBuilderEntry = {
  match: (provider: Provider, aiSdkProviderId: AppProviderId) => boolean;
  build: (ctx: BuilderContext) => ProviderConfig | Promise<ProviderConfig>;
};

/** Endpoint priority: `model.endpointTypes[0]` > `provider.defaultChatEndpoint` > fallback. */
export async function providerToAiSdkConfig(
  provider: Provider,
  model: Model,
  runtime: ProviderConfigRuntime,
): Promise<ProviderConfig> {
  const { endpointType, baseUrl } = resolveEffectiveEndpoint(provider, model);

  const aiSdkProviderId = appProviderIdMap[
    resolveAiSdkProviderId(provider, endpointType)
  ] as StringKeys<AppProviderSettingsMap>;

  const formattedBaseUrl = formatBaseURL(baseUrl, provider, endpointType);
  const { baseURL, endpoint } = routeToEndpoint(formattedBaseUrl);
  const apiKey = await runtime.getRotatedApiKey(provider.id);

  const ctx: BuilderContext = {
    actualProvider: provider,
    model,
    baseConfig: { baseURL, apiKey },
    endpoint,
    endpointType,
    aiSdkProviderId,
    runtime,
  };

  const builders: ConfigBuilderEntry[] = [
    { match: (p) => isCherryAIProvider(p), build: buildCherryAIConfig },
    { match: (p) => isAzureOpenAIProvider(p), build: buildAzureConfig },
    { match: (_, id) => id === 'cherryin', build: buildRoutedGatewayConfig },
    { match: (_, id) => id === 'newapi', build: buildRoutedGatewayConfig },
    { match: (_, id) => id === 'aihubmix', build: buildGenericProviderConfig },
    { match: (_, id) => id === 'gateway', build: buildGenericProviderConfig },
  ];

  const builder = builders.find((b) => b.match(provider, aiSdkProviderId));
  if (builder) {
    return builder.build(ctx);
  }

  if (hasProviderConfig(aiSdkProviderId) && aiSdkProviderId !== 'openai-compatible') {
    return buildGenericProviderConfig(ctx);
  }
  return buildOpenAICompatibleConfig(ctx);
}

// ── Config Builders ──

function buildCommonOptions(ctx: BuilderContext) {
  const options: Record<string, any> = {
    headers: {
      ...defaultAppHeaders(),
      ...getExtraHeaders(ctx.actualProvider),
    },
  };
  if (ctx.aiSdkProviderId === 'openai') {
    options.headers['X-Api-Key'] = ctx.baseConfig.apiKey;
  }
  return options;
}

function mapGatewayEndpointType(
  endpointType: EndpointType | undefined,
): CherryInProviderSettings['endpointType'] {
  if (!endpointType) return undefined;

  switch (endpointType) {
    case ENDPOINT_TYPE.ANTHROPIC_MESSAGES:
      return 'anthropic';
    case ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT:
      return 'gemini';
    case ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS:
    case ENDPOINT_TYPE.OLLAMA_CHAT:
      return 'openai';
    case ENDPOINT_TYPE.OPENAI_RESPONSES:
      return 'openai-response';
    case ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION:
      return 'image-generation';
    case ENDPOINT_TYPE.JINA_RERANK:
      return 'jina-rerank';
    default:
      return 'openai';
  }
}

function buildRoutedGatewayConfig(ctx: BuilderContext): ProviderConfig {
  return {
    providerId: ctx.aiSdkProviderId,
    endpoint: ctx.endpoint,
    providerSettings: {
      ...ctx.baseConfig,
      endpointType: mapGatewayEndpointType(ctx.endpointType ?? ctx.model.endpointTypes?.[0]),
      headers: { ...defaultAppHeaders(), ...getExtraHeaders(ctx.actualProvider) },
    },
  };
}

function buildCherryAIConfig(ctx: BuilderContext): ProviderConfig<'openai-compatible'> {
  return {
    providerId: 'openai-compatible',
    endpoint: ctx.endpoint,
    providerSettings: {
      ...ctx.baseConfig,
      headers: { ...defaultAppHeaders(), ...getExtraHeaders(ctx.actualProvider) },
      includeUsage: ctx.actualProvider.apiFeatures.streamOptions,
      name: ctx.actualProvider.id,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const signature = generateSignature({
          method: 'POST',
          path: '/chat/completions',
          query: '',
          body: getJsonBody(init?.body),
        });
        return fetch(input, { ...init, headers: { ...init?.headers, ...signature } });
      },
    },
  };
}

function getJsonBody(body: BodyInit | null | undefined): Record<string, unknown> | undefined {
  if (typeof body !== 'string') {
    return undefined;
  }

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function formatAzureBaseURL(baseURL: string, forAnthropic: boolean): string {
  const normalized = baseURL.replace(/\/v1$/, '').replace(/\/openai$/, '');
  return forAnthropic ? normalized : `${normalized}/openai`;
}

async function buildAzureConfig(
  ctx: BuilderContext,
): Promise<
  ProviderConfig<'azure'> | ProviderConfig<'azure-anthropic'> | ProviderConfig<'azure-responses'>
> {
  const authConfig = await ctx.runtime.getAuthConfig(ctx.actualProvider.id);
  const apiVersion =
    authConfig?.type === 'iam-azure'
      ? authConfig.apiVersion.trim()
      : ctx.actualProvider.settings?.apiVersion?.trim();
  const modelId = ctx.model.modelId;
  const endpointType = ctx.model.endpointTypes?.[0];

  // Azure + Claude model -> azure-anthropic
  if (modelId.startsWith('claude') || endpointType === ENDPOINT_TYPE.ANTHROPIC_MESSAGES) {
    return {
      providerId: 'azure-anthropic',
      endpoint: ctx.endpoint,
      providerSettings: {
        ...ctx.baseConfig,
        baseURL: formatAzureBaseURL(ctx.baseConfig.baseURL, true),
        headers: { ...defaultAppHeaders(), ...getExtraHeaders(ctx.actualProvider) },
      },
    };
  }

  const isResponsesVariant = ctx.aiSdkProviderId === 'azure-responses';

  const providerSettings: AppProviderSettingsMap['azure'] & {
    apiVersion?: string;
    useDeploymentBasedUrls?: boolean;
  } = {
    ...ctx.baseConfig,
    baseURL: formatAzureBaseURL(ctx.baseConfig.baseURL, false),
    headers: { ...defaultAppHeaders(), ...getExtraHeaders(ctx.actualProvider) },
  };

  if (apiVersion) {
    providerSettings.apiVersion = apiVersion;
    if (!isResponsesVariant) {
      providerSettings.useDeploymentBasedUrls = true;
    }
  }

  if (isResponsesVariant) {
    return {
      providerId: 'azure-responses',
      endpoint: ctx.endpoint,
      providerSettings,
    };
  }

  return {
    providerId: 'azure',
    endpoint: ctx.endpoint,
    providerSettings,
  };
}

function buildOpenAICompatibleConfig(ctx: BuilderContext): ProviderConfig<'openai-compatible'> {
  const commonOptions = buildCommonOptions(ctx);

  return {
    providerId: 'openai-compatible',
    endpoint: ctx.endpoint,
    providerSettings: {
      ...ctx.baseConfig,
      ...commonOptions,
      name: ctx.actualProvider.id,
      includeUsage: ctx.actualProvider.apiFeatures.streamOptions,
    },
  };
}

function buildGenericProviderConfig(ctx: BuilderContext): ProviderConfig {
  const commonOptions = buildCommonOptions(ctx);

  return {
    providerId: ctx.aiSdkProviderId,
    endpoint: ctx.endpoint,
    providerSettings: {
      ...ctx.baseConfig,
      ...commonOptions,
      includeUsage: ctx.actualProvider.apiFeatures.streamOptions,
    },
  };
}

function isPreset(provider: Provider, presetId: string): boolean {
  return provider.id === presetId || provider.presetProviderId === presetId;
}

function isOllamaProvider(provider: Provider): boolean {
  return isPreset(provider, 'ollama');
}

function isGeminiProvider(provider: Provider): boolean {
  return isPreset(provider, 'gemini') || isPreset(provider, 'google');
}

function isCherryAIProvider(provider: Provider): boolean {
  return isPreset(provider, 'cherryai');
}

function isAzureOpenAIProvider(provider: Provider): boolean {
  return provider.authType === 'iam-azure' || isPreset(provider, 'azure-openai');
}
