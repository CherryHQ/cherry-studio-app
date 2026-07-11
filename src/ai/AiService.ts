import type { AiPlugin } from '@cherrystudio/ai-core';
import {
  embedMany as aiCoreEmbedMany,
  generateImage as aiCoreGenerateImage,
} from '@cherrystudio/ai-core';
import type { WebSearchPluginConfig } from '@cherrystudio/ai-core/built-in/plugins';
import { providerToolPlugin } from '@cherrystudio/ai-core/built-in/plugins';
import { extensionRegistry } from '@cherrystudio/ai-core/provider';
import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import {
  type LanguageModelUsage,
  type ModelMessage,
  stepCountIs,
  type ToolSet,
  type UIMessageChunk,
} from 'ai';
import type { AssistantService } from '@/data/services/AssistantService';
import type { ModelService } from '@/data/services/ModelService';
import type { PreferenceService } from '@/data/services/PreferenceService';
import type { ProviderService } from '@/data/services/ProviderService';
import type { Assistant } from '@/data/types/assistant';
import type { Model, UniqueModelId } from '@/data/types/model';
import { isUniqueModelId, parseUniqueModelId } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';
import type { WebSearchService } from '@/services/webSearch/WebSearchService';

import { createWebSearchTool, WEB_SEARCH_TOOL_NAME } from './createWebSearchTool';
import { resolveMediaCapabilities } from './messages/messageCapabilities';
import { resolveUIMessageFileUrls } from './messages/messageConverter';
import { providerToAiSdkConfig } from './provider/config';
import { listModels as listProviderModels } from './provider/listModels';
import { Agent } from './runtime/aiSdk/Agent';
import { createAnthropicCachePlugin } from './runtime/aiSdk/plugins/anthropicCache';
import { createGatewayUsageNormalizePlugin } from './runtime/aiSdk/plugins/gatewayUsageNormalize';
import { createOpenrouterReasoningPlugin } from './runtime/aiSdk/plugins/openrouterReasoning';
import {
  createReasoningExtractionPlugin,
  INLINE_REASONING_SDK_PROVIDER_IDS,
} from './runtime/aiSdk/plugins/reasoningExtraction';
import { createSimulateStreamingPlugin } from './runtime/aiSdk/plugins/simulateStreaming';
import type { AppProviderId, AppProviderSettingsMap } from './types';
import type { AiBaseRequest, AiStreamRequest, ListModelsRequest } from './types/requests';
import { addAnthropicHeaders } from './utils/anthropicHeaders';
import {
  isAnthropicModel,
  isForcedNativeWebSearchModel,
  isFunctionCallingModel,
  isGeminiModel,
  isGrokModel,
  isOpenAIModel,
} from './utils/model';
import {
  filterStandardParams,
  getMaxTokens,
  getTemperature,
  getTimeout,
  getTopP,
} from './utils/modelParameters';
import {
  buildCapabilityProviderOptions,
  extractAiSdkStandardParams,
  mergeCustomProviderParameters,
} from './utils/options';
import { replacePromptVariables } from './utils/promptVariables';
import { SystemProviderIds } from './utils/providerIds';
import { getReasoningTagName } from './utils/reasoning';
import { buildProviderBuiltinWebSearchConfig, type CherryWebSearchConfig } from './utils/websearch';

// ── Request types ──────────────────────────────────────────────────

/** Non-streaming text generation request — pure transport data. */
export interface AiGenerateRequest extends AiBaseRequest {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
}

// ── SDK extensions ─────────────────────────────────────────────────

/** Result of non-streaming text generation. */
export interface AiGenerateResult {
  text: string;
  usage?: LanguageModelUsage;
}

export interface AiImageRequest extends AiBaseRequest {
  prompt: string;
  n?: number;
  size?: `${number}x${number}`;
  aspectRatio?: `${number}:${number}`;
  seed?: number;
}

export interface AiImageResult {
  images: {
    base64: string;
    mediaType: string;
  }[];
  usage?: unknown;
}

export interface AiServiceDependencies {
  assistant: AssistantService;
  model: ModelService;
  preference: PreferenceService;
  provider: ProviderService;
  webSearch: WebSearchService;
}

/**
 * Lifecycle AI service. See `docs/references/ai/core-architecture.md` in desktop.
 *
 * Mobile keeps the desktop service name but does not register IPC handlers
 * or depend on Electron main-process lifecycle services.
 */
export class AiService {
  constructor(private readonly services: AiServiceDependencies) {}

  // ── Streaming chat (agent.stream) ──

  /**
   * Raw `UIMessageChunk` stream from `Agent.stream`. Caller owns
   * read/multicast/accumulation/terminal dispatch.
   * Pre-stream errors reject the Promise; mid-stream errors come through
   * the stream itself.
   */
  async streamText(request: AiStreamRequest): Promise<ReadableStream<UIMessageChunk>> {
    const signal = request.requestOptions?.signal;
    if (!signal) {
      throw new Error(
        'streamText requires requestOptions.signal — no AbortController was attached by the caller',
      );
    }

    const { sdkConfig, model, system, tools, plugins, options } = await this.buildAgentParamsFor(
      request,
      { shouldIncludeExternalTools: true },
    );
    const preparedMessages = await resolveUIMessageFileUrls(request.messages ?? []);

    const agent = new Agent({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      messageId: request.messageId,
      mediaCapabilities: resolveMediaCapabilities(model),
      plugins,
      system,
      tools,
      options,
    });

    return agent.stream(preparedMessages, signal);
  }

  // ── Non-streaming text generation (agent.generate) ──

  async generateText(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const signal = request.requestOptions?.signal;

    const { sdkConfig, system, plugins, options } = await this.buildAgentParamsFor(request);

    const agent = new Agent({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      plugins,
      system: request.system ?? system,
      options,
    });

    // prompt and messages are mutually exclusive in AI SDK; preserve that.
    return agent.generate(
      request.prompt ? { prompt: request.prompt } : { messages: request.messages ?? [] },
      signal,
    );
  }

  // ── Model listing ──

  async listModels(request: ListModelsRequest): Promise<Partial<Model>[]> {
    const provider = await this.getProviderForListModels(request);
    return listProviderModels(
      provider,
      {
        getRotatedApiKey: (providerId) => this.services.provider.getRotatedApiKey(providerId),
      },
      request.requestOptions?.signal,
      { throwOnError: request.throwOnError },
    );
  }

  // ── Image generation ──

  async generateImage(request: AiImageRequest): Promise<AiImageResult> {
    const signal = request.requestOptions?.signal;
    const { sdkConfig, model, assistant, options } = await this.buildAgentParamsFor(request);
    const customParams = assistant ? getCustomParameters(assistant) : {};
    const split = extractAiSdkStandardParams(customParams);

    const result = await aiCoreGenerateImage<AppProviderSettingsMap>(
      sdkConfig.providerId,
      sdkConfig.providerSettings as never,
      {
        model: model.modelId,
        prompt: request.prompt,
        n: request.n,
        size: request.size,
        aspectRatio: request.aspectRatio,
        seed: request.seed,
        maxRetries: request.requestOptions?.maxRetries ?? 0,
        abortSignal: signal,
        ...(options.providerOptions && { providerOptions: options.providerOptions }),
        ...(request.requestOptions?.headers && {
          headers: stripUndefinedHeaders(request.requestOptions.headers),
        }),
        ...split.standardParams,
      },
    );

    return {
      images: result.images.map((image) => ({
        base64: image.base64,
        mediaType: image.mediaType,
      })),
      usage: result.usage,
    };
  }

  // ── API validation ──

  /** Dispatches to `embedMany` for embedding models, `generateText` otherwise. */
  async checkModel(
    request: AiBaseRequest & { apiKeyOverride?: string; timeout?: number },
  ): Promise<{ latency: number }> {
    const start = performance.now();
    const timeout = request.timeout ?? 15000;
    const requestSignal = request.requestOptions?.signal;

    // AbortController on timeout so the HTTP work cancels too (otherwise tokens keep burning).
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    let abortPromise: Promise<never> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort(new Error('Check model timeout'));
        reject(new Error('Check model timeout'));
      }, timeout);
    });

    try {
      throwIfAiRequestAborted(requestSignal);
      if (requestSignal) {
        abortPromise = new Promise<never>((_, reject) => {
          abortListener = () => {
            const reason = getAiRequestAbortReason(requestSignal);
            controller.abort(reason);
            reject(reason);
          };
          requestSignal.addEventListener('abort', abortListener, { once: true });
        });
      }

      const probeRequest = {
        ...request,
        requestOptions: { ...request.requestOptions, signal: controller.signal },
      };
      const probe = this.runCheckModelProbe(probeRequest, controller.signal);
      const probes: Promise<unknown>[] = [probe, timeoutPromise];
      if (abortPromise) {
        probes.push(abortPromise);
      }

      await Promise.race(probes);
      return { latency: performance.now() - start };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (abortListener) {
        requestSignal?.removeEventListener('abort', abortListener);
      }
      if (requestSignal?.aborted) {
        if (!controller.signal.aborted) {
          controller.abort(requestSignal.reason);
        }
      }
    }
  }

  private async runCheckModelProbe(
    request: AiBaseRequest & { apiKeyOverride?: string },
    signal: AbortSignal,
  ): Promise<unknown> {
    const { sdkConfig, model, plugins, options } = await this.buildAgentParamsFor(request);

    if (isEmbeddingModel(model)) {
      return aiCoreEmbedMany<AppProviderSettingsMap>(
        sdkConfig.providerId,
        sdkConfig.providerSettings as never,
        {
          model: sdkConfig.modelId,
          values: ['test'],
          maxRetries: options.maxRetries,
          abortSignal: signal,
          ...(options.providerOptions && { providerOptions: options.providerOptions }),
          ...(options.headers && { headers: stripUndefinedHeaders(options.headers) }),
        },
      );
    }

    const agent = new Agent({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      plugins,
      system: 'test',
      options,
    });

    return agent.generate({ prompt: 'hi' }, signal);
  }

  // ── Shared agent parameter resolution ──

  private async buildAgentParamsFor(
    request: AiBaseRequest & { apiKeyOverride?: string; chatId?: string },
    buildOptions: { shouldIncludeExternalTools?: boolean } = {},
  ) {
    const { provider, model, assistant } = await this.getProviderAndModel(request);
    const sdkConfig = await providerToAiSdkConfig(provider, model, {
      getRotatedApiKey: async (providerId) =>
        request.apiKeyOverride ?? this.services.provider.getRotatedApiKey(providerId),
      getAuthConfig: (providerId) => this.services.provider.getAuthConfig(providerId),
    });
    const externalWebSearchProviderId =
      buildOptions.shouldIncludeExternalTools && assistant?.settings.enableWebSearch
        ? await this.services.preference.get('chat.web_search.default_search_keywords_provider')
        : null;
    const shouldForceNativeWebSearch = isForcedNativeWebSearchModel(model);
    const hasConfiguredExternalWebSearch = Boolean(
      externalWebSearchProviderId && isFunctionCallingModel(model) && !shouldForceNativeWebSearch,
    );
    const capabilities = assistant
      ? resolveCapabilities(
          model,
          provider,
          assistant,
          sdkConfig.providerId,
          this.services.preference,
          {
            webSearchProviderId: hasConfiguredExternalWebSearch
              ? (externalWebSearchProviderId ?? undefined)
              : undefined,
          },
        )
      : undefined;
    const shouldUseExternalWebSearch = Boolean(
      buildOptions.shouldIncludeExternalTools &&
        assistant?.settings.enableWebSearch &&
        isFunctionCallingModel(model) &&
        (hasConfiguredExternalWebSearch || !capabilities?.webSearchPluginConfig),
    );
    const providerOptions =
      assistant && capabilities
        ? buildCapabilityProviderOptions(assistant, model, provider, capabilities)
        : {};
    const standardParams = assistant
      ? this.getAssistantStandardParams(assistant, model, provider)
      : {};
    const customParams = assistant ? getCustomParameters(assistant) : {};
    const split = extractAiSdkStandardParams(customParams);
    const filteredStandardParams = filterStandardParams(split.standardParams, model);
    const mergedProviderOptions = mergeCustomProviderParameters(
      providerOptions,
      split.providerParams,
      sdkConfig.providerId,
    );
    const anthropicBetaHeaders =
      assistant && isAnthropicModel(model) ? addAnthropicHeaders(assistant, model, provider) : [];
    const headers =
      request.requestOptions?.headers || anthropicBetaHeaders.length > 0
        ? {
            ...request.requestOptions?.headers,
            ...(anthropicBetaHeaders.length > 0 && {
              'anthropic-beta': anthropicBetaHeaders.join(','),
            }),
          }
        : undefined;
    const plugins = buildAgentPlugins({
      aiSdkProviderId: sdkConfig.providerId,
      model,
      provider,
      streamOutput: capabilities?.streamOutput ?? true,
      webSearchPluginConfig: capabilities?.webSearchPluginConfig,
    });
    const tools =
      shouldUseExternalWebSearch && assistant?.settings.enableWebSearch
        ? ({
            [WEB_SEARCH_TOOL_NAME]: createWebSearchTool(this.services.webSearch),
          } satisfies ToolSet)
        : undefined;
    const system = assistant?.prompt
      ? await replacePromptVariables(assistant.prompt, model.name, this.services.preference)
      : undefined;

    return {
      sdkConfig: {
        ...sdkConfig,
        modelId: model.modelId,
      },
      provider,
      model,
      assistant,
      system,
      plugins,
      tools,
      options: {
        maxRetries: request.requestOptions?.maxRetries ?? 0,
        timeout: request.requestOptions?.timeout ?? getTimeout(model),
        ...(headers && { headers }),
        ...(Object.keys(mergedProviderOptions).length > 0 && {
          providerOptions: mergedProviderOptions,
        }),
        ...standardParams,
        ...filteredStandardParams,
        ...(tools && {
          stopWhen: stepCountIs(
            assistant?.settings.enableMaxToolCalls ? assistant.settings.maxToolCalls : 20,
          ),
        }),
      },
    };
  }

  private getAssistantStandardParams(assistant: Assistant, model: Model, provider: Provider) {
    const params: Record<string, number> = {};
    const temperature = getTemperature(assistant, model);
    const topP = getTopP(assistant, model);
    const maxOutputTokens = getMaxTokens(assistant, model, provider);

    if (temperature !== undefined) params.temperature = temperature;
    if (topP !== undefined) params.topP = topP;
    if (maxOutputTokens !== undefined) params.maxOutputTokens = maxOutputTokens;

    return params;
  }

  /**
   * Priority: explicit `uniqueModelId` > `assistant.modelId` > runtime default model.
   * Assistant-less topics resolve `chat.default_model_id` at send time.
   */
  private async getProviderAndModel(request: AiBaseRequest & { chatId?: string }) {
    let assistant: Assistant | undefined;
    if (request.assistantId) {
      assistant = await this.services.assistant.getById(request.assistantId);
    }

    let uniqueModelId: UniqueModelId | null | undefined;
    if (request.uniqueModelId) {
      uniqueModelId = request.uniqueModelId;
    } else if (request.assistantId) {
      if (!assistant?.modelId) {
        throw new Error(`Assistant ${request.assistantId} has no model configured`);
      }
      uniqueModelId = assistant.modelId;
    } else {
      const defaultModelId = await this.services.preference.get('chat.default_model_id');
      if (!defaultModelId) {
        uniqueModelId = null;
      } else if (!isUniqueModelId(defaultModelId)) {
        throw new Error(
          `Invalid default model configured for assistant-less topic: ${defaultModelId}`,
        );
      } else {
        uniqueModelId = defaultModelId;
      }
    }

    if (!uniqueModelId) {
      throw new Error('No default model configured for assistant-less topic');
    }

    const { providerId, modelId } = parseUniqueModelId(uniqueModelId);

    const provider = await this.services.provider.getByProviderId(providerId);
    const model = await this.services.model.getById(uniqueModelId);
    if (!model) {
      throw new Error(`Cannot resolve model: ${providerId}::${modelId}`);
    }

    return { provider, model, assistant };
  }

  private async getProviderForListModels(request: ListModelsRequest): Promise<Provider> {
    if (request.providerId) {
      return this.services.provider.getByProviderId(request.providerId);
    }

    if (!request.assistantId) {
      throw new Error('listModels requires providerId or assistantId');
    }

    const assistant = await this.services.assistant.getById(request.assistantId);
    if (!assistant.modelId) {
      throw new Error('Cannot resolve providerId: assistant has no model');
    }

    const { providerId } = parseUniqueModelId(assistant.modelId);
    return this.services.provider.getByProviderId(providerId);
  }
}

function resolveCapabilities(
  model: Model,
  provider: Provider,
  assistant: Assistant,
  aiSdkProviderId: string,
  preference: PreferenceService,
  options: { webSearchProviderId?: string } = {},
) {
  const enableReasoning = Boolean(
    model.reasoning && assistant.settings?.reasoning_effort !== undefined,
  );
  const enableWebSearch = Boolean(
    !options.webSearchProviderId &&
      ((assistant.settings?.enableWebSearch && model.capabilities.includes('web-search')) ||
        isForcedNativeWebSearchModel(model)),
  );
  const enableGenerateImage = model.capabilities.includes('image-generation');

  const streamOutput = assistant.settings.streamOutput !== false;

  const webSearchPluginConfig = enableWebSearch
    ? resolveWebSearchPluginConfig(model, provider, aiSdkProviderId, preference)
    : undefined;

  return {
    enableReasoning,
    enableWebSearch,
    enableUrlContext: false,
    enableGenerateImage,
    streamOutput,
    webSearchPluginConfig,
  };
}

/**
 * Ported from desktop's `resolveCapabilities`'s inline web-search-config
 * block (`runtime/aiSdk/params/capabilities.ts`) — provider-builtin search
 * config, with an AI Gateway fallback that infers the underlying vendor
 * from the model when the gateway provider itself isn't in the registry.
 */
function resolveWebSearchPluginConfig(
  model: Model,
  provider: Provider,
  aiSdkProviderId: string,
  preference: PreferenceService,
): WebSearchPluginConfig | undefined {
  const webSearchPreferences = preference.getMultipleRawCached([
    'chat.web_search.max_results',
    'chat.web_search.exclude_domains',
  ]);
  const webSearchConfig: CherryWebSearchConfig = {
    maxResults: webSearchPreferences['chat.web_search.max_results'],
    excludeDomains: webSearchPreferences['chat.web_search.exclude_domains'],
  };

  if (extensionRegistry.has(aiSdkProviderId)) {
    return buildProviderBuiltinWebSearchConfig(aiSdkProviderId, webSearchConfig, model);
  }

  if (
    provider.id === SystemProviderIds.gateway ||
    provider.presetProviderId === SystemProviderIds.gateway
  ) {
    const gatewayProviderId = mapVertexAIGatewayModelToProviderId(model);
    if (gatewayProviderId) {
      return buildProviderBuiltinWebSearchConfig(gatewayProviderId, webSearchConfig, model);
    }
  }

  return undefined;
}

function mapVertexAIGatewayModelToProviderId(model: Model): AppProviderId | undefined {
  if (isAnthropicModel(model)) return 'anthropic';
  if (isGeminiModel(model)) return 'google';
  if (isGrokModel(model)) return 'xai';
  if (isOpenAIModel(model)) return 'openai';
  return undefined;
}

/**
 * Ported from desktop's per-request `RequestFeature` registry
 * (`runtime/aiSdk/params/collectFromFeatures.ts`), minus the registry
 * itself — mobile has few enough conditions to just assemble them inline.
 */
function buildAgentPlugins(params: {
  aiSdkProviderId: string;
  model: Model;
  provider: Provider;
  streamOutput: boolean;
  webSearchPluginConfig?: WebSearchPluginConfig;
}): AiPlugin[] {
  const { aiSdkProviderId, model, provider, streamOutput, webSearchPluginConfig } = params;
  const plugins: AiPlugin[] = [];

  if (
    isAnthropicModel(model) &&
    provider.settings.cacheControl?.enabled &&
    provider.settings.cacheControl.tokenThreshold
  ) {
    plugins.push(createAnthropicCachePlugin(provider));
  }

  if (provider.id === SystemProviderIds.openrouter) {
    plugins.push(createOpenrouterReasoningPlugin());
  }

  if (webSearchPluginConfig) {
    plugins.push(providerToolPlugin('webSearch', webSearchPluginConfig));
  }

  if (!streamOutput) {
    plugins.push(createSimulateStreamingPlugin());
  }

  if (aiSdkProviderId === SystemProviderIds.gateway) {
    plugins.push(createGatewayUsageNormalizePlugin());
  }

  if (INLINE_REASONING_SDK_PROVIDER_IDS.has(aiSdkProviderId)) {
    plugins.push(createReasoningExtractionPlugin({ tagName: getReasoningTagName(model.modelId) }));
  }

  return plugins;
}

function isEmbeddingModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.EMBEDDING);
}

function getCustomParameters(assistant: Assistant): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const item of assistant.settings?.customParameters ?? []) {
    params[item.name] = item.value;
  }
  return params;
}

function stripUndefinedHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function throwIfAiRequestAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) {
    return;
  }

  throw getAiRequestAbortReason(signal);
}

function getAiRequestAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('AI request aborted');
}
