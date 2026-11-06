import {
  normalizeVertexCredentials,
  resolveVertexUrls,
  shouldAppendProviderApiVersion,
} from '@cherrystudio/ai-runtime/provider';
import {
  createAiUsageCaptureContext,
  resolveReasoningInvocation,
} from '@cherrystudio/ai-runtime/utils';
import {
  MODEL_CAPABILITY,
  normalizeModelId,
  supportsServerToolFunctionMixing,
} from '@cherrystudio/provider-registry';
import { isDeepSeekModel } from '@cherrystudio/universal/utils/model';
import type { FetchFunction, Model as PiModel, ModelThinkingLevel } from '@earendil-works/pi-ai';
import { fetch as expoFetch } from 'expo/fetch';

import { resolveProviderConnection } from '@/backend/ai/provider/providerConnection';
import { application } from '@/backend/core/application/Application';
import { modelService } from '@/backend/data/services/ModelService';
import {
  projectRuntimeReasoning,
  providerRegistryService,
} from '@/backend/data/services/ProviderRegistryService';
import { providerService } from '@/backend/data/services/ProviderService';
import { getProviderConfigurationIssue } from '@/backend/services/providers/providerConfiguration';
import type { VertexAuthClient } from '@/backend/services/providers/vertex';
import { ProviderAccountError } from '@/shared/contracts/providerAccounts';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { resolveEndpointDialect } from '@/shared/data/types/provider';
import type { Provider } from '@/shared/data/types/provider';
import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
} from '@/shared/utils/modelTokenLimits';

import type { RuntimeModel, RuntimeModelPreflight, RuntimeOptions, RuntimeUsageContext } from '..';
import { bindPiStream, resolvePiApiAdapter, type SupportedPiApi } from './piApiAdapters';
import { withPiApiKeyFallback } from './piApiKeyFallback';
import { withPiDeepseekDsml } from './piDeepseekDsml';
import { requirePiLanguageBinding, resolvePiLanguageBinding } from './piLanguageBinding';
import type { PiModelResolution, PiRuntimeDependencies } from './piModelTypes';
import {
  endpointForPiApi,
  requireOAuthEndpoint,
  resolveOAuthPiModel,
  type ResolvedPiOAuth,
} from './piOAuthModels';
import { resolvePiOutputReservation } from './piOutputReservation';
import { withPiStreamIdleTimeout } from './piStreamIdleTimeout';
import type { PiNativeWebTools, PiWebDialect } from './piWebTools';

class PiModelResolutionError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PiModelResolutionError';
  }
}

export function createPiModelResolver(
  accounts?: {
    resolveAuth(provider: Provider, signal?: AbortSignal): Promise<ResolvedPiOAuth | undefined>;
  },
  vertexAuth?: Pick<VertexAuthClient, 'getAccessToken'>,
): PiRuntimeDependencies {
  return {
    async preflightModel(runtimeModel): Promise<RuntimeModelPreflight> {
      return (await resolveConfiguredPiModel(runtimeModel)).preflight;
    },
    async nativeWebTools(runtimeModel, runtimeOptions) {
      const { adapter, connection, model, preflight, provider } =
        await resolveConfiguredPiModel(runtimeModel);
      const oauth = await accounts?.resolveAuth(provider);
      if (oauth && !OFFICIAL_API_ACCOUNTS.has(oauth.id)) return NO_NATIVE_WEB_TOOLS;
      return resolveNativeWebTools({
        api: adapter.api,
        connection,
        maxTokens: runtimeOptions.maxOutputTokens ?? preflight.maxOutputTokens,
        model,
        provider,
        runtimeOptions,
      });
    },
    async resolveModel(
      runtimeModel,
      runtimeOptions,
      sessionId,
      apiKeyOverride,
      signal,
    ): Promise<PiModelResolution> {
      const {
        adapter: configuredAdapter,
        connection,
        model,
        preflight,
        provider,
      } = await resolveConfiguredPiModel(runtimeModel);

      let vertex:
        | { accessToken: string; baseUrl: string; projectId: string; location: string }
        | undefined;
      if (provider.authType === 'iam-gcp') {
        if (apiKeyOverride !== undefined) {
          throw new PiModelResolutionError(
            'invalid_credentials',
            'Vertex uses a service account, not an API-key override.',
          );
        }
        const auth = await providerService.getAuthConfig(provider.id);
        if (auth?.type !== 'iam-gcp' || getProviderConfigurationIssue(provider, [], auth)) {
          throw new PiModelResolutionError(
            'invalid_credentials',
            'Vertex service-account configuration is incomplete or invalid.',
          );
        }
        const { privateKey, clientEmail } = normalizeVertexCredentials(auth.credentials);
        const projectId = auth.project.trim();
        const location = auth.location.trim();
        const urls = resolveVertexUrls(connection.baseUrl, projectId, location);
        const accessToken = await (
          vertexAuth ?? application.get('VertexAuthClient')
        ).getAccessToken(
          {
            providerId: provider.id,
            projectId,
            serviceAccount: { privateKey: privateKey!, clientEmail: clientEmail! },
          },
          signal,
        );
        vertex = {
          accessToken,
          baseUrl: configuredAdapter.api === 'anthropic-messages' ? urls.apiUrl : urls.resourceUrl,
          projectId,
          location,
        };
      }
      const oauth =
        !vertex && apiKeyOverride === undefined
          ? await accounts?.resolveAuth(provider, signal)
          : undefined;
      if (oauth) requireOAuthEndpoint(provider, oauth.id, connection.baseUrl);
      const oauthModel = oauth
        ? await resolveOAuthPiModel(oauth, connection.wireModelId)
        : undefined;
      if (
        !vertex &&
        !oauth &&
        provider.authMethods?.includes('oauth') &&
        !provider.authMethods.includes('api-key')
      ) {
        throw new ProviderAccountError('authorization');
      }
      const adapter = oauthModel
        ? resolvePiApiAdapter(
            endpointForPiApi(oauthModel.api),
            oauthModel.api === 'openai-codex-responses' ? 'openai-codex' : undefined,
          )
        : configuredAdapter;

      const selectedApiKey = vertex
        ? {
            value: '',
            apiKeySelection: { attribution: 'auth' as const, method: 'iam-gcp' as const },
          }
        : oauth
          ? { value: oauth.auth.apiKey ?? '', apiKeySelection: { attribution: 'unknown' as const } }
          : await providerService.resolveApiKey(provider.id, apiKeyOverride);
      if (!vertex && !oauth && !provider.authOptional && !selectedApiKey.value.trim()) {
        throw new PiModelResolutionError(
          'invalid_api_key',
          'Pi Runtime requires an API key from the selected provider.',
        );
      }

      let azureApiVersion: string | undefined;
      if (adapter.api === 'azure-openai-responses') {
        const authConfig = await providerService.getAuthConfig(provider.id);
        const configuredVersion =
          authConfig?.type === 'iam-azure' ? authConfig.apiVersion : provider.settings.apiVersion;
        azureApiVersion = configuredVersion?.trim() || undefined;
      }

      const modelId = connection.wireModelId;
      const isOpenRouter =
        provider.id === 'openrouter' ||
        provider.presetProviderId === 'openrouter' ||
        isProviderHost(connection.baseUrl, 'openrouter.ai');
      const headers = { ...connection.headers };
      if (vertex) {
        for (const name of Object.keys(headers)) {
          if (adapter.authHeaderNames.includes(name.toLowerCase())) delete headers[name];
        }
      }
      if (oauth) {
        for (const name of Object.keys(headers)) {
          if (['authorization', 'x-api-key', 'api-key'].includes(name.toLowerCase()))
            delete headers[name];
        }
        for (const [name, value] of Object.entries({
          ...oauthModel?.headers,
          ...oauth.auth.headers,
        })) {
          for (const existing of Object.keys(headers)) {
            if (existing.toLowerCase() === name.toLowerCase()) delete headers[existing];
          }
          if (value !== null) headers[name] = value;
        }
      }
      if (
        (provider.id === 'opencode' || provider.presetProviderId === 'opencode') &&
        !Object.keys(headers).some((name) => name.toLowerCase() === 'x-opencode-session')
      ) {
        headers['x-opencode-session'] = sessionId;
      }
      const reasoningProfile = providerRegistryService.resolveReasoningProfile(
        provider,
        model,
        connection.endpointType,
      );
      const invocationModel = reasoningProfile.support
        ? {
            ...model,
            reasoning: projectRuntimeReasoning(reasoningProfile.support, reasoningProfile.wire),
          }
        : model;
      const configuredPiModel: PiModel<SupportedPiApi> = {
        api: adapter.api,
        baseUrl: adapter.formatBaseUrl(
          vertex?.baseUrl ?? connection.baseUrl.trim(),
          shouldAppendProviderApiVersion(provider),
        ),
        ...(adapter.api === 'openai-completions' || adapter.api === 'openai-responses'
          ? {
              compat: {
                supportsDeveloperRole: false,
                ...(isProviderHost(connection.baseUrl, 'api.deepseek.com')
                  ? { supportsMidConvoSystemMessages: true }
                  : {}),
                ...(adapter.api === 'openai-completions'
                  ? {
                      ...(isOpenRouter
                        ? {
                            ...(modelId.startsWith('anthropic/')
                              ? { cacheControlFormat: 'anthropic' as const }
                              : {}),
                            sendSessionAffinityHeaders: true,
                            sessionAffinityFormat: 'openrouter' as const,
                          }
                        : {}),
                      maxTokensField:
                        connection.adapterFamily === 'openai'
                          ? 'max_completion_tokens'
                          : 'max_tokens',
                      supportsStore: connection.adapterFamily === 'openai',
                      supportsStrictMode: connection.adapterFamily === 'openai',
                      supportsUsageInStreaming: resolveEndpointDialect(
                        provider,
                        connection.endpointType,
                      ).streamOptions,
                    }
                  : {}),
              },
            }
          : {}),
        contextWindow: preflight.contextWindow,
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
        headers,
        id: vertex ? modelId.replace(/^(?:google|anthropic)\//, '') : modelId,
        input: preflight.inputModalities,
        maxTokens: preflight.maxOutputTokens,
        name: model.name,
        provider: oauth?.id ?? provider.id,
        reasoning: invocationModel.reasoning !== undefined,
      };
      const piModel: PiModel<SupportedPiApi> = oauthModel
        ? {
            ...oauthModel,
            compat: {
              ...oauthModel.compat,
              ...(oauthModel.api === 'openai-completions' || oauthModel.api === 'openai-responses'
                ? { supportsDeveloperRole: false }
                : {}),
            },
            baseUrl: oauth?.auth.baseUrl ?? oauthModel.baseUrl,
            headers,
            maxTokens: Math.min(preflight.maxOutputTokens, oauthModel.maxTokens),
          }
        : configuredPiModel;
      // Keep capability metadata intact while bounding the default request reservation.
      const outputReservation = resolvePiOutputReservation(
        piModel.maxTokens,
        piModel.contextWindow,
        runtimeOptions.maxOutputTokens,
      );
      const streamBinding: Parameters<typeof bindPiStream>[1] = {
        apiKey: vertex
          ? undefined
          : oauth
            ? oauth.auth.apiKey
            : selectedApiKey.value.trim()
              ? selectedApiKey.value
              : '',
        accessToken: vertex?.accessToken,
        ...(vertex && adapter.api === 'anthropic-messages'
          ? { vertex: { projectId: vertex.projectId, location: vertex.location } }
          : {}),
        cacheRetention: provider.settings.cacheControl?.enabled === false ? 'none' : 'short',
        sessionId,
        fetch: expoFetch as unknown as FetchFunction,
        headers,
        maxRetries: 0,
        maxTokens: oauth ? Math.min(outputReservation, piModel.maxTokens) : outputReservation,
        requestParameters: oauth
          ? undefined
          : {
              model: invocationModel,
              profile: reasoningProfile.wire,
              selection: runtimeOptions.reasoningEffort,
              summary:
                typeof provider.settings.summaryText === 'string'
                  ? provider.settings.summaryText
                  : undefined,
            },
        temperature:
          adapter.api === 'openai-codex-responses' ? undefined : runtimeOptions.temperature,
        azureApiVersion,
      };
      const primaryStream = await bindPiStream(adapter, streamBinding);
      const hasAuthHeader = Object.keys(headers).some((name) =>
        adapter.authHeaderNames.includes(name.toLowerCase()),
      );
      const capturedContext = createAiUsageCaptureContext({
        credentialReceipt:
          !vertex && hasAuthHeader ? { attribution: 'unknown' } : selectedApiKey.apiKeySelection,
        messageRef: null,
        modelId,
        modelName: model.name,
        pricing: model.pricing,
        providerId: provider.id,
        providerName: provider.name,
        reportedCostCurrency: provider.reportedCostCurrency,
        source: null,
        trustProviderReportedCost: provider.apiFeatures.reportsActualCost,
      });
      const usageContext: RuntimeUsageContext = {
        credentialReceipt: capturedContext.credentialReceipt,
        modelId: capturedContext.modelId,
        modelName: capturedContext.modelName,
        pricingSnapshot: capturedContext.pricingSnapshot,
        providerId: capturedContext.providerId,
        providerName: capturedContext.providerName,
        reportedCostCurrency: capturedContext.reportedCostCurrency,
        trustProviderReportedCost: capturedContext.trustProviderReportedCost,
      };

      const selectedKeyId =
        'id' in usageContext.credentialReceipt ? usageContext.credentialReceipt.id : undefined;
      const enabledKeys =
        apiKeyOverride === undefined &&
        selectedKeyId !== undefined &&
        provider.apiKeys.filter((key) => key.isEnabled).length > 1
          ? (await providerService.listApiKeys(provider.id, { enabled: true })).keys
          : [];
      const selectedIndex = enabledKeys.findIndex((key) => key.id === selectedKeyId);
      const fallbackKeys =
        selectedIndex < 0
          ? []
          : [...enabledKeys.slice(selectedIndex + 1), ...enabledKeys.slice(0, selectedIndex)];
      const primaryReceipt = usageContext.credentialReceipt;
      const streamFn =
        fallbackKeys.length === 0
          ? primaryStream
          : withPiApiKeyFallback([
              async () => {
                usageContext.credentialReceipt = primaryReceipt;
                return primaryStream;
              },
              ...fallbackKeys.map((key) => async () => {
                const selected = await providerService.resolveApiKey(provider.id, key.key);
                const stream = await bindPiStream(adapter, {
                  ...streamBinding,
                  apiKey: selected.value,
                });
                usageContext.credentialReceipt = selected.apiKeySelection;
                return stream;
              }),
            ]);

      const timedStream = withPiStreamIdleTimeout(streamFn);
      return {
        defaultThinkingLevel: resolveDefaultThinkingLevel(invocationModel),
        maxInputTokens: model.maxInputTokens,
        model: piModel,
        redactionValues: [
          ...(vertex ? [vertex.accessToken, `Bearer ${vertex.accessToken}`] : []),
          ...collectRedactionValues(selectedApiKey.value, headers),
          ...(oauth
            ? Object.values(oauth.auth.headers ?? {}).flatMap((value) => {
                if (value === null) return [];
                const token = /^Bearer\s+(.+)$/i.exec(value)?.[1];
                return token ? [token] : [];
              })
            : []),
          ...fallbackKeys.map((key) => key.key),
        ],
        streamFn: isDeepSeekModel(model) ? withPiDeepseekDsml(timedStream) : timedStream,
        supportsTools: preflight.supportsTools,
        nativeWebTools:
          oauth && !OFFICIAL_API_ACCOUNTS.has(oauth.id)
            ? NO_NATIVE_WEB_TOOLS
            : resolveNativeWebTools({
                api: adapter.api,
                connection,
                maxTokens: streamBinding.maxTokens ?? piModel.maxTokens,
                model,
                provider,
                runtimeOptions,
              }),
        usageContext,
      };
    },
  };
}

/**
 * Sign-ins that authenticate the provider's ordinary API. The others reach a subscription
 * endpoint, which has no reviewed native web tool.
 */
const OFFICIAL_API_ACCOUNTS: ReadonlySet<string> = new Set(['xai', 'openrouter']);

const NO_NATIVE_WEB_TOOLS: PiNativeWebTools = {
  search: false,
  fetch: false,
  functionToolMixing: false,
};

function resolveNativeWebTools({
  api,
  connection,
  maxTokens,
  model,
  provider,
  runtimeOptions,
}: {
  api: SupportedPiApi;
  connection: ReturnType<typeof resolveProviderConnection>;
  maxTokens: number;
  model: Model;
  provider: Provider;
  runtimeOptions: RuntimeOptions;
}): PiNativeWebTools {
  if (!connection.endpointType) return NO_NATIVE_WEB_TOOLS;
  const serverTools = providerRegistryService.resolveServerTools(
    provider,
    connection.wireModelId,
    connection.endpointType,
  );
  const dialect = resolveWebDialect(api, provider, connection.wireModelId);
  if (!serverTools.length || !dialect) return NO_NATIVE_WEB_TOOLS;
  const reasoningProfile = providerRegistryService.resolveReasoningProfile(
    provider,
    model,
    connection.endpointType,
  );
  // OpenAI rejects its search tool under minimal reasoning.
  const minimalReasoning =
    (dialect === 'openai-responses' || dialect === 'openai-preview') &&
    (runtimeOptions.reasoningEffort === 'minimal' ||
      resolveReasoningInvocation({
        model: reasoningProfile.support
          ? {
              ...model,
              reasoning: projectRuntimeReasoning(reasoningProfile.support, reasoningProfile.wire),
            }
          : model,
        profile: reasoningProfile.wire,
        selection:
          runtimeOptions.reasoningEffort === 'off' ? 'none' : runtimeOptions.reasoningEffort,
        maxTokens,
      }).emissions.some(
        ({ target, value }) => target === 'reasoningEffort' && value === 'minimal',
      ));
  return {
    search: serverTools.includes('web-search') && !minimalReasoning,
    fetch:
      serverTools.includes('url-context') &&
      (dialect === 'google' || dialect === 'anthropic' || dialect === 'qwen-anthropic'),
    // Gemini before 3 rejects functions beside its native tools.
    functionToolMixing:
      dialect !== 'google' || supportsServerToolFunctionMixing(connection.wireModelId),
    dialect,
  };
}

/** The adapter that serves a declared native tool on this endpoint, if one has been written. */
function resolveWebDialect(
  api: SupportedPiApi,
  provider: Provider,
  wireModelId: string,
): PiWebDialect | undefined {
  if (provider.authType === 'iam-gcp') return undefined;
  const preset = provider.presetProviderId ?? provider.id;
  const qwenFamily = preset === 'dashscope' || preset === 'qwencloud';
  const normalizedModelId = normalizeModelId(wireModelId);
  if (qwenFamily && api === 'anthropic-messages') {
    // Catalog normalization also matches undated aliases; these tools require the named SKUs.
    if (normalizedModelId === 'deepseek-v4-1-flash' && wireModelId !== 'deepseek-v4.1-flash-1017')
      return undefined;
    if (normalizedModelId === 'deepseek-v4-flash' && wireModelId !== 'deepseek-v4-flash-0731')
      return undefined;
  }
  const dashscopeHostedSearch = ['glm-5.2', 'kimi-k3', 'kimi/kimi-k3'].includes(wireModelId);
  switch (api) {
    case 'openai-responses':
      if (preset === 'grok') return 'xai';
      if (preset === 'poe') return 'openai-preview';
      // Mainland Qwen and the documented hosted SKUs serve Responses search.
      if (preset === 'dashscope' && !/^qwen3[.-]/.test(wireModelId) && !dashscopeHostedSearch)
        return undefined;
      if (
        preset === 'qwencloud' &&
        !/^(?:deepseek-v4-(?:pro(?:-0813)?|flash(?:-0731)?)|deepseek-v4[.-]1-flash(?:-1017)?|glm-5[.-]2|kimi-k3)$/.test(
          wireModelId,
        )
      )
        return undefined;
      return 'openai-responses';
    case 'azure-openai-responses':
      return 'openai-preview';
    case 'anthropic-messages':
      return qwenFamily ? 'qwen-anthropic' : 'anthropic';
    case 'google-generative-ai':
      return 'google';
    case 'openai-completions':
      // Hosted GLM/Kimi search uses Responses or Anthropic, never enable_search.
      if (preset === 'dashscope' && ['glm-5-2', 'kimi-k3'].includes(normalizedModelId))
        return undefined;
      return preset === 'zhipu' ||
        preset === 'dashscope' ||
        preset === 'qwencloud' ||
        preset === 'openrouter' ||
        preset === 'perplexity'
        ? preset
        : undefined;
    default:
      return undefined;
  }
}

async function resolveConfiguredPiModel(runtimeModel: RuntimeModel) {
  const uniqueModelId = createUniqueModelId(runtimeModel.providerId, runtimeModel.modelId);
  const [provider, model] = await Promise.all([
    providerService.getByProviderId(runtimeModel.providerId),
    modelService.getById(uniqueModelId),
  ]);
  if (!model) throw new Error(`Model is not configured: ${uniqueModelId}`);

  const connection = resolveProviderConnection(provider, model);
  const piBinding = requirePiLanguageBinding(resolvePiLanguageBinding(provider, connection));
  const adapter = resolvePiApiAdapter(
    piBinding.endpointType,
    (provider.presetProviderId ?? provider.id) === 'openai-codex'
      ? 'openai-codex'
      : connection.adapterFamily,
  );

  return {
    adapter,
    connection,
    model,
    preflight: toPiModelPreflight(model),
    provider,
  };
}

export function toPiModelPreflight(model: Model): RuntimeModelPreflight {
  const contextWindow = model.contextWindow ?? DEFAULT_MODEL_CONTEXT_WINDOW;
  const maxOutputTokens = model.maxOutputTokens ?? DEFAULT_MODEL_MAX_OUTPUT_TOKENS;
  // These are model limits; the Runtime budgets input and output together for each request.
  const maxInputTokens = Math.max(
    0,
    Math.min(model.maxInputTokens ?? contextWindow, contextWindow),
  );

  return {
    contextWindow,
    inputModalities: model.capabilities.includes(MODEL_CAPABILITY.IMAGE_RECOGNITION)
      ? ['text', 'image']
      : ['text'],
    maxInputTokens,
    maxOutputTokens,
    supportsTools: model.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL),
  };
}

function collectRedactionValues(apiKey: string, headers: Record<string, string>): string[] {
  return [
    apiKey,
    ...Object.entries(headers).flatMap(([name, value]) =>
      /authorization|api[-_]key|token|secret/i.test(name) ? [value] : [],
    ),
  ];
}

function isProviderHost(baseUrl: string, hostname: string): boolean {
  try {
    return new URL(baseUrl).hostname === hostname;
  } catch {
    return false;
  }
}

function resolveDefaultThinkingLevel(model: Model): ModelThinkingLevel {
  if (!model.reasoning) return 'off';
  const effort = model.reasoning.defaultEffort ?? 'medium';
  if (effort === 'none') return 'off';
  if (effort === 'auto' || effort === 'ultra') return 'medium';
  return effort;
}
