import {
  type AiPlugin,
  generateImage as aiCoreGenerateImage,
  type RuntimeProviderCallEvent,
  type RuntimeProviderCallHandler,
} from '@cherrystudio/ai-core';
import type { AppProviderSettingsMap } from '@cherrystudio/ai-runtime/provider';
import type {
  AiBaseRequest,
  AiStreamRequest,
  ListModelsRequest,
} from '@cherrystudio/ai-runtime/runtime';
import {
  buildImageProviderOptions,
  createAiUsageCaptureContext,
  extractAiSdkStandardParams,
  getCustomParameters,
  mergeImageProviderOptions,
  splitImageParamValues,
} from '@cherrystudio/ai-runtime/utils';
import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import type { ServingCredentialReceipt } from '@cherrystudio/universal/data/types/aiUsageRecord';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import type { Model } from '@cherrystudio/universal/data/types/model';
import { parseUniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { type LanguageModelUsage, type ModelMessage, type UIMessageChunk } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import { application } from '@/backend/core/application/Application';
import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import {
  aiUsageRecordService,
  type AiUsageCaptureContext,
  type AiUsageRecordService,
  type MessageRef,
} from '@/backend/data/services/AiUsageRecordService';
import { assistantService, type AssistantService } from '@/backend/data/services/AssistantService';
import { modelService, type ModelService } from '@/backend/data/services/ModelService';
import {
  providerRegistryService,
  type ProviderRegistryService,
} from '@/backend/data/services/ProviderRegistryService';
import { providerService, type ProviderService } from '@/backend/data/services/ProviderService';
import { fileContent } from '@/backend/services/file/fileContent';
import { COPILOT_PROVIDER_ID } from '@/backend/services/oauth/authorization/adapters/CopilotOAuthAdapter';
import { devicePermissions } from '@/backend/services/permissions';

import { createAiUsagePlugin } from './hooks/billingHook';
import { resolveUIMessageFileUrls } from './messages/attachmentRouting';
import { listModels as listProviderModels } from './provider/listModels';
import { VertexAuthClient } from './provider/VertexAuthClient';
import { Agent, buildAgentParams } from './runtime/aiSdk';
import type { BuildAgentParamsDependencies } from './runtime/aiSdk/params/buildAgentParams';
import { ToolResolver } from './tools';

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
  inputImages?: string[];
  mode: ImageGenerationMode;
  paramValues: ParamValues;
  prompt: string;
}

export interface AiImageResult {
  images: {
    base64: string;
    mediaType: string;
  }[];
  usage?: unknown;
}

export interface AiServiceDependencies extends BuildAgentParamsDependencies {
  aiUsageRecord: Pick<AiUsageRecordService, 'recordInvocation'>;
  assistant: Pick<AssistantService, 'getById'>;
  fileContent: {
    getUri(id: FileEntryId): Promise<string | undefined>;
  };
  model: Pick<ModelService, 'getById'>;
  provider: BuildAgentParamsDependencies['provider'] &
    Pick<ProviderService, 'getByProviderId' | 'getRotatedApiKey'>;
  providerRegistry: Pick<ProviderRegistryService, 'listProviderRegistryModels'>;
  vertexAuth: Pick<VertexAuthClient, 'getAuthorizationHeaders'>;
}

function bareModelKey(model: Partial<Model>): string {
  const modelId = model.apiModelId ?? model.modelId ?? '';
  const afterSlash = modelId.includes('/') ? modelId.slice(modelId.lastIndexOf('/') + 1) : modelId;
  return afterSlash.toLowerCase();
}

export function mergeProviderModelsWithRegistry(
  remote: Partial<Model>[],
  registry: Model[],
): Partial<Model>[] {
  const seen = new Set(remote.map(bareModelKey));
  const missing = registry.filter((model) => !seen.has(bareModelKey(model)));
  return missing.length > 0 ? [...remote, ...missing] : remote;
}

/** `auto` is the picker's "let the model decide" sentinel, not a wire value. */
function resolveImageRequestSize(size: string | undefined): string | undefined {
  return size === 'auto' ? undefined : size;
}

function createCaptureContext(input: {
  provider: Provider;
  model: Model;
  sdkModelId: string;
  credentialReceipt: ServingCredentialReceipt;
  assistant?: Assistant;
  messageRef: MessageRef | null;
}): AiUsageCaptureContext {
  return createAiUsageCaptureContext({
    providerId: input.provider.id,
    providerName: input.provider.name,
    modelId: input.sdkModelId,
    modelName: input.model.name,
    pricing: input.model.pricing,
    trustProviderReportedCost: input.provider.apiFeatures.reportsActualCost,
    reportedCostCurrency: input.provider.reportedCostCurrency,
    credentialReceipt: input.credentialReceipt,
    source: input.assistant
      ? {
          type: 'assistant',
          id: input.assistant.id,
          name: input.assistant.name,
          icon: input.assistant.emoji,
        }
      : null,
    messageRef: input.messageRef,
  });
}

function createProviderCallHandler(
  context: AiUsageCaptureContext,
  recorder: AiServiceDependencies['aiUsageRecord'],
): RuntimeProviderCallHandler {
  return (event: RuntimeProviderCallEvent) => {
    void recorder.recordInvocation({
      requestId: event.requestId,
      context,
      modality: event.modality,
      ...(event.modality === 'image' && event.usage
        ? {
            usage: {
              ...(event.usage.inputTokens !== undefined
                ? { inputTokens: event.usage.inputTokens }
                : {}),
              ...(event.usage.outputTokens !== undefined
                ? { outputTokens: event.usage.outputTokens }
                : {}),
              ...(event.usage.totalTokens !== undefined
                ? { totalTokens: event.usage.totalTokens }
                : {}),
            },
          }
        : {}),
      ...(event.modality === 'image' ? { imageCount: event.imageCount } : {}),
      metrics: event.metrics,
      completedAt: event.completedAt,
    });
  };
}

/**
 * The two OAuth calls the AI runtime makes, bound to the installed host.
 *
 * Both services are resolved per call rather than captured, so a host
 * replacement cannot leave this port serving a dead generation. The Copilot id
 * lives here, with the consumer that needs a serving token, rather than in the
 * OAuth module — its README keeps the generic runtime and public contract free
 * of provider names.
 */
const hostOAuth: AiServiceDependencies['oauth'] = {
  authenticatedFetch: (providerId, buildRequest, doFetch, options) =>
    application
      .get('OAuthRuntimeService')
      .authenticatedFetch(providerId, buildRequest, doFetch, options),
  getCopilotServingToken: (headers, signal) =>
    application.get('ProviderOAuthService').getServingToken(COPILOT_PROVIDER_ID, headers, signal),
};

/**
 * Lifecycle AI service. See `docs/references/ai/core-architecture.md` in desktop.
 *
 * Mobile keeps the desktop service name but does not register IPC handlers
 * or depend on Electron main-process lifecycle services.
 *
 * It declares no `@DependsOn`. Its container-owned collaborators —
 * `PreferenceService`, `WebSearchService`, `McpRuntimeService`,
 * `OAuthRuntimeService`, `ProviderOAuthService` — are resolved inside methods
 * instead, because the single optional dependencies object is what every AI test
 * injects through and positional injection would take that argument slot. The
 * cost is that those edges do not appear in the graph; it is affordable because
 * this service initializes nothing and stops nothing, so no ordering depends on
 * them.
 */
@Injectable('AiService')
@ServicePhase(Phase.PostReady)
export class AiService extends BaseService {
  private toolResolver: ToolResolver | undefined;
  private vertexAuthClient: VertexAuthClient | undefined;

  /** Every entry is optional so the container can construct this with no arguments. */
  constructor(private readonly overrides: Partial<AiServiceDependencies> = {}) {
    super();
  }

  /**
   * Production defaults, per access. `??` keeps an overridden entry from
   * resolving anything, so a unit test needs no installed host for the services
   * it replaces.
   */
  private get services(): AiServiceDependencies {
    const { overrides } = this;
    return {
      aiUsageRecord: overrides.aiUsageRecord ?? aiUsageRecordService,
      assistant: overrides.assistant ?? assistantService,
      fileContent: overrides.fileContent ?? fileContent,
      model: overrides.model ?? modelService,
      oauth: overrides.oauth ?? hostOAuth,
      preference: overrides.preference ?? application.get('PreferenceService'),
      provider: overrides.provider ?? providerService,
      providerRegistry: overrides.providerRegistry ?? providerRegistryService,
      tools: overrides.tools ?? this.getToolResolver(),
      vertexAuth: overrides.vertexAuth ?? this.getVertexAuth(),
    };
  }

  /** Owns a built tool registry, so it is created once per service instance. */
  private getToolResolver(): ToolResolver {
    this.toolResolver ??= new ToolResolver({
      devicePermissions,
      mcpRuntime: application.get('McpRuntimeService'),
      preference: application.get('PreferenceService'),
      webSearch: application.get('WebSearchService'),
    });
    return this.toolResolver;
  }

  /** Caches minted service-account tokens, so it outlives a single request. */
  private getVertexAuth(): VertexAuthClient {
    this.vertexAuthClient ??= new VertexAuthClient({ fetch: expoFetch as typeof globalThis.fetch });
    return this.vertexAuthClient;
  }

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

    const repairUsagePlugins: { current?: AiPlugin[] } = {};
    const [built, preparedMessages] = await Promise.all([
      this.buildAgentParamsFor(request, true, () => repairUsagePlugins.current ?? []),
      resolveUIMessageFileUrls(request.messages ?? [], (fileEntryId) =>
        this.services.fileContent.getUri(fileEntryId),
      ),
    ]);
    const {
      assistant,
      context,
      credentialReceipt,
      model,
      nativeFileSupport,
      options,
      plugins,
      provider,
      repairToolCall,
      sdkConfig,
      system,
      tools,
    } = built;
    const usagePlugin = createAiUsagePlugin(
      createCaptureContext({
        provider,
        model,
        sdkModelId: sdkConfig.modelId,
        credentialReceipt,
        assistant,
        messageRef: request.messageId ? { kind: 'chat', id: request.messageId } : null,
      }),
      this.services.aiUsageRecord,
    );
    repairUsagePlugins.current = [usagePlugin];

    const agent = new Agent({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      messageId: request.messageId,
      mediaCapabilities: nativeFileSupport,
      plugins: [...plugins, usagePlugin],
      context,
      repairToolCall,
      system,
      tools,
      ...(request.runtimeTimingSink
        ? {
            toolExecutionHooks: {
              onToolExecutionStart: (event) =>
                request.runtimeTimingSink?.onToolExecutionStart(event),
              onToolExecutionEnd: (event) => request.runtimeTimingSink?.onToolExecutionEnd(event),
            },
          }
        : {}),
      options,
    });

    return agent.stream(preparedMessages, signal);
  }

  // ── Non-streaming text generation (agent.generate) ──

  async generateText(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const signal = request.requestOptions?.signal;

    const repairUsagePlugins: { current?: AiPlugin[] } = {};
    const {
      assistant,
      context,
      credentialReceipt,
      model,
      options,
      plugins,
      provider,
      repairToolCall,
      sdkConfig,
      system,
    } = await this.buildAgentParamsFor(request, false, () => repairUsagePlugins.current ?? []);
    const usagePlugin = createAiUsagePlugin(
      createCaptureContext({
        provider,
        model,
        sdkModelId: sdkConfig.modelId,
        credentialReceipt,
        assistant,
        messageRef: null,
      }),
      this.services.aiUsageRecord,
    );
    repairUsagePlugins.current = [usagePlugin];

    const agent = new Agent({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      plugins: [...plugins, usagePlugin],
      context,
      repairToolCall,
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
    const registryModels = this.services.providerRegistry.listProviderRegistryModels({
      presetProviderId: provider.presetProviderId ?? null,
      providerId: provider.id,
    });
    if (provider.modelListSource === 'registry') {
      return registryModels;
    }

    const remoteModels = await listProviderModels(
      provider,
      {
        getAuthConfig: async (providerId) =>
          (await this.services.provider.getAuthConfig(providerId)) ?? undefined,
        getCopilotToken: (headers, signal) =>
          this.services.oauth.getCopilotServingToken(headers, signal),
        getRotatedApiKey: (providerId) => this.services.provider.getRotatedApiKey(providerId),
        getVertexAuthHeaders: (input) => this.services.vertexAuth.getAuthorizationHeaders(input),
      },
      request.requestOptions?.signal,
      { throwOnError: request.throwOnError },
    );
    return mergeProviderModelsWithRegistry(remoteModels, registryModels);
  }

  // ── Image generation ──

  async generateImage(request: AiImageRequest): Promise<AiImageResult> {
    const signal = request.requestOptions?.signal;
    const { sdkConfig, credentialReceipt, model, assistant, options, provider } =
      await this.buildAgentParamsFor(request);
    const customParams = assistant ? getCustomParameters(assistant) : {};
    const split = extractAiSdkStandardParams(customParams);
    const { structured, vendorBag } = splitImageParamValues(request.paramValues);
    const imageProviderOptions = buildImageProviderOptions({
      aiSdkProviderId: sdkConfig.providerId,
      paramValues: request.paramValues,
      provider,
      vendorBag,
    });
    const mergedProviderOptions = mergeImageProviderOptions(
      options.providerOptions,
      imageProviderOptions,
    );
    const inputImages = request.inputImages ?? [];
    const hasInputImages = inputImages.length > 0;
    const providerSettings = hasInputImages
      ? { ...sdkConfig.providerSettings, fetch: expoFetch }
      : sdkConfig.providerSettings;
    const usageCaptureContext = createCaptureContext({
      provider,
      model,
      sdkModelId: sdkConfig.modelId,
      credentialReceipt,
      assistant,
      messageRef: null,
    });

    const result = await aiCoreGenerateImage<AppProviderSettingsMap>(
      sdkConfig.providerId,
      providerSettings as never,
      {
        model: sdkConfig.modelId,
        prompt: hasInputImages ? { images: inputImages, text: request.prompt } : request.prompt,
        n: structured.n ?? 1,
        size: resolveImageRequestSize(structured.size) as `${number}x${number}` | undefined,
        aspectRatio: structured.aspectRatio as `${number}:${number}` | undefined,
        seed: structured.seed,
        maxRetries: request.requestOptions?.maxRetries ?? 0,
        abortSignal: signal,
        ...(mergedProviderOptions && { providerOptions: mergedProviderOptions }),
        ...(request.requestOptions?.headers && {
          headers: stripUndefinedHeaders(request.requestOptions.headers),
        }),
        onProviderCall: createProviderCallHandler(usageCaptureContext, this.services.aiUsageRecord),
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

  /** Validates models supported by the mobile AI runtime with a short text generation. */
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
      const probe = this.generateText({ ...probeRequest, system: 'test', prompt: 'hi' });
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

  private async buildAgentParamsFor(
    request: AiBaseRequest & { apiKeyOverride?: string; chatId?: string; messageId?: string },
    shouldIncludeExternalTools = false,
    getRepairUsagePlugins?: () => AiPlugin[],
  ) {
    const { provider, model, assistant } = await this.getProviderAndModel(request);
    const built = await buildAgentParams({
      request,
      services: this.services,
      provider,
      model,
      assistant,
      shouldIncludeExternalTools,
      getRepairUsagePlugins,
    });
    return { ...built, provider, model, assistant };
  }

  /** Priority: explicit `uniqueModelId` > `assistant.modelId`. */
  private async getProviderAndModel(
    request: AiBaseRequest & { chatId?: string },
  ): Promise<{ provider: Provider; model: Model; assistant: Assistant | undefined }> {
    let assistant: Assistant | undefined;
    if (request.assistantId) {
      try {
        assistant = await this.services.assistant.getById(request.assistantId);
      } catch {
        assistant = undefined;
      }
    }

    const uniqueModelId = request.uniqueModelId ?? assistant?.modelId;
    if (!uniqueModelId) {
      throw new Error('Cannot resolve providerId: not in request and assistant has no model');
    }

    const { providerId, modelId } = parseUniqueModelId(uniqueModelId);
    const [provider, model] = await Promise.all([
      this.services.provider.getByProviderId(providerId),
      this.services.model.getById(uniqueModelId),
    ]);
    if (!model) {
      throw new Error(`Cannot resolve model: ${providerId}::${modelId}`);
    }

    return { provider, model, assistant };
  }
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
