/**
 * `Provider + Model` -> `ProviderConfig` for `@cherrystudio/ai-core`.
 * Always async because serving credential selection is async.
 */

import {
  formatPrivateKey,
  hasProviderConfig,
  type StringKeys,
} from '@cherrystudio/ai-core/provider';
import {
  type AppProviderId,
  type AppProviderSettingsMap,
  appendDashScopeWebExtractor,
  appProviderIds,
  dmxapiUsesCustomTransport,
  formatApiHost,
  formatOllamaApiHost,
  getBaseUrl,
  isVertexMaasModelId,
  isWithTrailingSharp,
  normalizeVertexCredentials,
  type ProviderConfig,
  registerProviderExtensions,
  resolveProviderVariant,
  type ResolvedEndpoint,
  routeToEndpoint,
  stripArkUnsupportedIncludes,
  transformZhipuRequestBody,
  withoutTrailingApiVersion,
} from '@cherrystudio/ai-runtime/provider';
import type { CherryInProviderSettings } from '@cherrystudio/ai-sdk-provider';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import {
  resolveProviderConnection,
  type ResolvedProviderConnection,
} from '@/backend/ai/provider/providerConnection';
import type { ResolvedProviderApiKey } from '@/backend/data/services/ProviderService';
import type { ServingCredentialReceipt } from '@/shared/data/types/aiUsageRecord';
import type { EndpointType, Model } from '@/shared/data/types/model';
import type { AuthConfig, Provider } from '@/shared/data/types/provider';

// Config dispatch reads the extension registry before Agent construction.
registerProviderExtensions();

const appProviderIdMap = appProviderIds as Record<string, AppProviderId>;

interface BaseConfig {
  baseURL: string;
  apiKey: string;
}

interface ProviderConfigRuntime {
  fetch?: typeof globalThis.fetch;
  getAuthConfig(providerId: string): Promise<AuthConfig | null>;
  resolveApiKey(providerId: string, override?: string): Promise<ResolvedProviderApiKey>;
}

interface BuilderContext {
  actualProvider: Provider;
  model: Model;
  connection: ResolvedProviderConnection;
  baseConfig: BaseConfig;
  endpoint?: string;
  endpointType?: EndpointType;
  aiSdkProviderId: StringKeys<AppProviderSettingsMap>;
  apiKeyOverride?: string;
  runtime: ProviderConfigRuntime;
  sessionId?: string;
}

type ApiKeyBuilderContext = BuilderContext & {
  apiKeySelection: ResolvedProviderApiKey['apiKeySelection'];
};

interface ProviderToAiSdkConfigOptions {
  apiKeyOverride?: string;
  resolvedConnection?: ResolvedProviderConnection;
  resolvedEndpoint?: ResolvedEndpoint;
  sessionId?: string;
}

export interface ResolvedProviderAiSdkConfig {
  config: ProviderConfig;
  credentialReceipt: ServingCredentialReceipt;
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
  const noVersionProviders = new Set([
    'github',
    'copilot',
    'perplexity',
    'newapi',
    'new-api',
    'azure-openai',
  ]);
  if (
    noVersionProviders.has(provider.id) ||
    noVersionProviders.has(provider.presetProviderId ?? '')
  ) {
    return formatApiHost(baseURL, false);
  }

  return formatApiHost(baseURL, appendApiVersion);
}

// ── SDK Config Building ──

type ProviderConfigBuilder = (ctx: BuilderContext) => ProviderConfig | Promise<ProviderConfig>;

type ResolvedProviderConfigBuild = {
  config: ProviderConfig;
  credentialReceipt: ServingCredentialReceipt;
};

type ConfigBuilderEntry = {
  match: (provider: Provider, aiSdkProviderId: AppProviderId) => boolean;
  build: (ctx: BuilderContext) => Promise<ResolvedProviderConfigBuild>;
};

async function selectApiKey(ctx: BuilderContext): Promise<ApiKeyBuilderContext> {
  const selected = await ctx.runtime.resolveApiKey(ctx.actualProvider.id, ctx.apiKeyOverride);
  return {
    ...ctx,
    baseConfig: { ...ctx.baseConfig, apiKey: selected.value },
    apiKeySelection: selected.apiKeySelection,
  };
}

function withSelectedApiKey(build: ProviderConfigBuilder): ConfigBuilderEntry['build'] {
  return async (ctx) => {
    const selected = await selectApiKey(ctx);
    return {
      config: await build(selected),
      credentialReceipt: selected.apiKeySelection,
    };
  };
}

/** Endpoint priority: `model.endpointTypes[0]` > `provider.defaultChatEndpoint` > fallback. */
export async function providerToAiSdkConfig(
  provider: Provider,
  model: Model,
  runtime: ProviderConfigRuntime,
  options?: ProviderToAiSdkConfigOptions,
): Promise<ProviderConfig> {
  return (await resolveProviderAiSdkConfig(provider, model, runtime, options)).config;
}

export async function resolveProviderAiSdkConfig(
  provider: Provider,
  model: Model,
  runtime: ProviderConfigRuntime,
  options?: ProviderToAiSdkConfigOptions,
): Promise<ResolvedProviderAiSdkConfig> {
  const resolvedConnection =
    options?.resolvedConnection ??
    resolveProviderConnection(provider, model, { resolvedEndpoint: options?.resolvedEndpoint });
  const connection = resolvedConnection;
  const { endpointType, baseUrl } = connection;

  const aiSdkProviderId = resolveConnectionAiSdkProviderId(connection);

  const formattedBaseUrl = formatBaseURL(baseUrl, provider, endpointType);
  const { baseURL, endpoint } = routeToEndpoint(formattedBaseUrl);

  const ctx: BuilderContext = {
    actualProvider: provider,
    model,
    connection,
    baseConfig: { baseURL, apiKey: '' },
    apiKeyOverride: options?.apiKeyOverride,
    endpoint,
    endpointType,
    aiSdkProviderId,
    runtime,
    sessionId: options?.sessionId,
  };

  const builders: ConfigBuilderEntry[] = [
    { match: (p) => isPreset(p, 'opencode'), build: withSelectedApiKey(buildOpenCodeConfig) },
    { match: (p) => isOllamaProvider(p), build: withSelectedApiKey(buildOllamaConfig) },
    { match: (p) => isAzureOpenAIProvider(p), build: withSelectedApiKey(buildAzureConfig) },
    {
      match: (p, id) => isPreset(p, 'dashscope') && id === 'openai-compatible',
      build: withSelectedApiKey(buildDashScopeConfig),
    },
    {
      match: (p, id) => isPreset(p, 'zhipu') && id === 'openai-compatible',
      build: withSelectedApiKey((builderContext) => {
        const config = buildOpenAICompatibleConfig(builderContext);
        config.providerSettings.transformRequestBody = transformZhipuRequestBody;
        return config;
      }),
    },
    {
      match: (p, id) => isPreset(p, 'moonshot') && id === 'openai-compatible',
      build: withSelectedApiKey((builderContext) => ({
        providerId: 'moonshot',
        endpoint: builderContext.endpoint,
        providerSettings: {
          ...builderContext.baseConfig,
          ...buildCommonOptions(builderContext),
          includeUsage: builderContext.actualProvider.apiFeatures.streamOptions,
        },
      })),
    },
    {
      match: (p, id) => isPreset(p, 'doubao') && id === 'openai',
      build: withSelectedApiKey((builderContext) => {
        const config = buildGenericProviderConfig(builderContext);
        config.providerSettings.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
          (builderContext.runtime.fetch ?? globalThis.fetch)(input, {
            ...init,
            body: stripArkUnsupportedIncludes(init?.body),
          });
        return config;
      }),
    },
    {
      match: (p, id) => isPreset(p, 'dashscope') && id === 'openai',
      build: withSelectedApiKey((builderContext) => {
        const config = buildGenericProviderConfig(builderContext);
        config.providerSettings.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
          (builderContext.runtime.fetch ?? globalThis.fetch)(input, {
            ...init,
            body: appendDashScopeWebExtractor(init?.body),
          });
        return config;
      }),
    },
    {
      match: (p, id) =>
        id === 'openai-compatible' &&
        isImageGenerationModel(model) &&
        (['modelscope', 'ppio', 'silicon', 'doubao', 'ovms'].some((providerId) =>
          isPreset(p, providerId),
        ) ||
          (isPreset(p, 'dmxapi') && dmxapiUsesCustomTransport(model.apiModelId ?? model.id))),
      build: withSelectedApiKey((builderContext) => ({
        providerId: (builderContext.actualProvider.presetProviderId ??
          builderContext.actualProvider.id) as
          | 'modelscope'
          | 'ppio'
          | 'silicon'
          | 'doubao'
          | 'ovms'
          | 'dmxapi',
        endpoint: builderContext.endpoint,
        providerSettings: {
          ...builderContext.baseConfig,
          headers: { ...builderContext.connection.headers },
        },
      })),
    },
    {
      match: (p, id) =>
        id === 'openai-compatible' && isImageGenerationModel(model) && isPreset(p, 'minimax'),
      build: withSelectedApiKey((builderContext) => ({
        providerId: 'minimax',
        endpoint: builderContext.endpoint,
        providerSettings: {
          ...builderContext.baseConfig,
          headers: { ...builderContext.connection.headers },
        },
      })),
    },
    { match: (p) => isPreset(p, 'cherryin'), build: withSelectedApiKey(buildCherryInConfig) },
    { match: (_, id) => id === 'newapi', build: withSelectedApiKey(buildNewApiConfig) },
    { match: (_, id) => id === 'aihubmix', build: withSelectedApiKey(buildAiHubMixConfig) },
    { match: (_, id) => id === 'dmxapi', build: withSelectedApiKey(buildDmxapiConfig) },
    { match: (_, id) => id === 'gateway', build: withSelectedApiKey(buildGenericProviderConfig) },
    { match: (_, id) => id === 'bedrock', build: buildBedrockConfig },
    {
      match: (_, id) =>
        id === 'google-vertex' || id === 'google-vertex-anthropic' || id === 'google-vertex-maas',
      build: buildVertexConfig,
    },
  ];

  const builder = builders.find((b) => b.match(provider, aiSdkProviderId));
  let resolved: ResolvedProviderConfigBuild;
  if (builder) {
    resolved = await builder.build(ctx);
  } else if (hasProviderConfig(aiSdkProviderId) && aiSdkProviderId !== 'openai-compatible') {
    resolved = await withSelectedApiKey(buildGenericProviderConfig)(ctx);
  } else {
    resolved = await withSelectedApiKey(buildOpenAICompatibleConfig)(ctx);
  }

  resolved.config.providerSettings.fetch ??= runtime.fetch;
  return resolved;
}

function resolveConnectionAiSdkProviderId(
  connection: ResolvedProviderConnection,
): StringKeys<AppProviderSettingsMap> {
  const baseProviderId =
    connection.adapterFamily && connection.adapterFamily in appProviderIdMap
      ? appProviderIdMap[connection.adapterFamily]
      : appProviderIdMap['openai-compatible'];
  return resolveProviderVariant(
    baseProviderId,
    connection.endpointType,
  ) as StringKeys<AppProviderSettingsMap>;
}

// ── Config Builders ──

function buildOpenCodeConfig(ctx: BuilderContext): ProviderConfig {
  const config =
    ctx.aiSdkProviderId === 'openai-compatible'
      ? buildOpenAICompatibleConfig(ctx)
      : buildGenericProviderConfig(ctx);
  const settings = config.providerSettings as { headers?: Record<string, string | undefined> };
  const hasExplicitSession = Object.keys(settings.headers ?? {}).some(
    (name) => name.toLowerCase() === 'x-opencode-session',
  );
  if (ctx.sessionId && !hasExplicitSession) {
    settings.headers = { 'x-opencode-session': ctx.sessionId, ...settings.headers };
  }
  return config;
}

function buildCommonOptions(ctx: BuilderContext) {
  const options: Record<string, any> = {
    headers: { ...ctx.connection.headers },
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
    case ENDPOINT_TYPE.JINA_RERANK:
      return 'jina-rerank';
    default:
      return 'openai';
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
        headers: { ...ctx.connection.headers },
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
    headers: { ...ctx.connection.headers },
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

function buildOllamaConfig(ctx: BuilderContext): ProviderConfig<'ollama'> {
  const headers = { ...ctx.connection.headers };
  if (ctx.baseConfig.apiKey) {
    headers.Authorization = `Bearer ${ctx.baseConfig.apiKey}`;
  }

  return {
    providerId: 'ollama',
    endpoint: ctx.endpoint,
    providerSettings: { ...ctx.baseConfig, headers },
  };
}

async function buildBedrockConfig(ctx: BuilderContext): Promise<ResolvedProviderConfigBuild> {
  const authConfig = await ctx.runtime.getAuthConfig(ctx.actualProvider.id);
  const base = { endpoint: ctx.endpoint, providerId: 'bedrock' as const };
  const baseURL = ctx.baseConfig.baseURL || undefined;

  if (authConfig?.type === 'iam-aws') {
    const region = authConfig.region?.trim() || undefined;
    return {
      config: {
        ...base,
        providerSettings: {
          baseURL,
          region,
          ...(authConfig.accessKeyId && { accessKeyId: authConfig.accessKeyId }),
          ...(authConfig.secretAccessKey && { secretAccessKey: authConfig.secretAccessKey }),
        },
      },
      credentialReceipt: { attribution: 'auth', method: 'iam-aws' },
    };
  }

  const selected = await selectApiKey(ctx);
  return {
    config: {
      ...base,
      providerSettings: { ...selected.baseConfig, baseURL },
    },
    credentialReceipt: selected.apiKeySelection,
  };
}

async function buildVertexConfig(ctx: BuilderContext): Promise<ResolvedProviderConfigBuild> {
  const authConfig = await ctx.runtime.getAuthConfig(ctx.actualProvider.id);
  if (authConfig?.type !== 'iam-gcp') {
    throw new Error('VertexAI requires iam-gcp auth configuration.');
  }

  const { credentials, location, project } = authConfig;
  const googleCredentials = credentials as Record<string, unknown> | undefined;
  const { clientEmail, privateKey } = normalizeVertexCredentials(googleCredentials);
  const normalizedCredentials = googleCredentials
    ? {
        ...googleCredentials,
        clientEmail,
        privateKey: formatPrivateKey(privateKey ?? ''),
      }
    : undefined;
  const modelId = ctx.model.apiModelId ?? ctx.model.modelId;
  const isAnthropic =
    ctx.aiSdkProviderId === 'google-vertex-anthropic' || modelId.startsWith('claude');

  let config: ProviderConfig;
  if (!isAnthropic && isVertexMaasModelId(modelId)) {
    config = {
      providerId: 'google-vertex-maas',
      endpoint: ctx.endpoint,
      providerSettings: {
        project,
        location,
        ...(ctx.baseConfig.baseURL && { baseURL: ctx.baseConfig.baseURL }),
        ...(normalizedCredentials && { googleCredentials: normalizedCredentials }),
        headers: { ...ctx.connection.headers },
      },
    };
  } else {
    const baseURL = ctx.baseConfig.baseURL
      ? `${ctx.baseConfig.baseURL}${
          isAnthropic ? '/publishers/anthropic/models' : '/publishers/google'
        }`
      : undefined;
    config = {
      providerId: isAnthropic ? 'google-vertex-anthropic' : 'google-vertex',
      endpoint: ctx.endpoint,
      providerSettings: {
        baseURL,
        project,
        location,
        ...(normalizedCredentials && { googleCredentials: normalizedCredentials }),
      },
    };
  }

  return {
    config,
    credentialReceipt: { attribution: 'auth', method: 'iam-gcp' },
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

function buildEndpointBaseURLs(provider: Provider): Partial<Record<EndpointType, string>> {
  const entries = Object.entries(provider.endpointConfigs ?? {}).flatMap(
    ([endpointType, config]) => {
      if (!config?.baseUrl) return [];
      const formatted = formatBaseURL(config.baseUrl, provider, endpointType as EndpointType);
      return [[endpointType, routeToEndpoint(formatted).baseURL] as const];
    },
  );
  return Object.fromEntries(entries);
}

function buildAiHubMixConfig(ctx: BuilderContext): ProviderConfig<'aihubmix'> {
  return {
    providerId: 'aihubmix',
    endpoint: ctx.endpoint,
    providerSettings: {
      ...ctx.baseConfig,
      endpointBaseURLs: buildEndpointBaseURLs(ctx.actualProvider),
      headers: { ...ctx.connection.headers },
    },
  };
}

function buildDmxapiConfig(ctx: BuilderContext): ProviderConfig<'dmxapi'> {
  return {
    providerId: 'dmxapi',
    endpoint: ctx.endpoint,
    providerSettings: {
      ...ctx.baseConfig,
      endpointBaseURLs: buildEndpointBaseURLs(ctx.actualProvider),
      headers: { ...ctx.connection.headers },
    },
  };
}

function buildDashScopeConfig(ctx: BuilderContext): ProviderConfig<'dashscope'> {
  return {
    providerId: 'dashscope',
    endpoint: ctx.endpoint,
    providerSettings: {
      ...ctx.baseConfig,
      headers: { ...ctx.connection.headers },
      includeUsage: ctx.actualProvider.apiFeatures.streamOptions,
    },
  };
}

function buildCherryInConfig(ctx: BuilderContext): ProviderConfig {
  const anthropicBaseURL = formatApiHost(
    getBaseUrl(ctx.actualProvider, ENDPOINT_TYPE.ANTHROPIC_MESSAGES),
  );
  const geminiBaseURL = formatApiHost(
    getBaseUrl(ctx.actualProvider, ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT),
    true,
    'v1beta',
  );

  return {
    providerId: ctx.aiSdkProviderId,
    endpoint: ctx.endpoint,
    providerSettings: {
      ...ctx.baseConfig,
      anthropicBaseURL,
      endpointType: mapGatewayEndpointType(ctx.endpointType),
      geminiBaseURL,
      headers: { ...ctx.connection.headers },
    },
  };
}

function formatNewApiBaseURL(baseURL: string, endpointType: EndpointType | undefined): string {
  const host = withoutTrailingApiVersion(baseURL);
  return endpointType === ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT
    ? formatApiHost(host, true, 'v1beta')
    : formatApiHost(host, true);
}

function buildNewApiConfig(ctx: BuilderContext): ProviderConfig<'newapi'> {
  const rawBaseURL =
    ctx.endpointType === ENDPOINT_TYPE.ANTHROPIC_MESSAGES
      ? getBaseUrl(ctx.actualProvider, ctx.endpointType) || ctx.baseConfig.baseURL
      : ctx.baseConfig.baseURL;

  return {
    providerId: 'newapi',
    endpoint: ctx.endpoint,
    providerSettings: {
      ...ctx.baseConfig,
      baseURL: formatNewApiBaseURL(rawBaseURL, ctx.endpointType),
      endpointType: mapGatewayEndpointType(ctx.endpointType),
      headers: { ...ctx.connection.headers },
    },
  };
}

function isPreset(provider: Provider, presetId: string): boolean {
  return provider.id === presetId || provider.presetProviderId === presetId;
}

function isOllamaProvider(provider: Provider): boolean {
  return isPreset(provider, 'ollama') || provider.defaultChatEndpoint === ENDPOINT_TYPE.OLLAMA_CHAT;
}

function isGeminiProvider(provider: Provider): boolean {
  return isPreset(provider, 'gemini') || isPreset(provider, 'google');
}

function isImageGenerationModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.IMAGE_GENERATION);
}

function isAzureOpenAIProvider(provider: Provider): boolean {
  return provider.authType === 'iam-azure' || isPreset(provider, 'azure-openai');
}
