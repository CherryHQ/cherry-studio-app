import {
  type AiPlugin,
  generateImage as aiCoreGenerateImage,
  type RuntimeProviderCallEvent,
  type RuntimeProviderCallHandler,
} from '@cherrystudio/ai-core';
import {
  type AppProviderSettingsMap,
  resolveEffectiveEndpoint,
} from '@cherrystudio/ai-runtime/provider';
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
import {
  ENDPOINT_TYPE,
  type ImageGenerationMode,
  type ParamValues,
} from '@cherrystudio/provider-registry';
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
import { paintingFileStorage } from '@/backend/services/paintings/paintingFileStorage';
import { devicePermissions } from '@/backend/services/permissions';
import type { ServingCredentialReceipt } from '@/shared/data/types/aiUsageRecord';
import type { Assistant } from '@/shared/data/types/assistant';
import type { FileEntryId } from '@/shared/data/types/file';
import type { Model } from '@/shared/data/types/model';
import { parseUniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { createAiUsagePlugin } from './hooks/billingHook';
import { resolveUIMessageFileUrls } from './messages/attachmentRouting';
import { listModels as listProviderModels } from './provider/listModels';
import { VertexAuthClient } from './provider/VertexAuthClient';
import { Agent, buildAgentParams } from './runtime/aiSdk';
import type { BuildAgentParamsDependencies } from './runtime/aiSdk/params/buildAgentParams';
import { getChatRuntime } from './runtime/chatRuntime';
import type { PiChatThinkingLevel } from './runtime/pi/PiChatStreamAdapter';
import { ToolResolver } from './tools';

const DEFAULT_PI_CONTEXT_WINDOW = 128_000;
const DEFAULT_PI_MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_PI_TIMEOUT_MS = 10 * 60_000;
type PiChatStreamAdapterModule = typeof import('./runtime/pi/PiChatStreamAdapter');
const piChatRuntime = {
  load: (): Promise<PiChatStreamAdapterModule> => import('./runtime/pi/PiChatStreamAdapter'),
};

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
  piChatRuntime: { load(): Promise<PiChatStreamAdapterModule> };
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
 * Lifecycle AI service. See `docs/references/ai/core-architecture.md` in desktop.
 *
 * Mobile keeps the desktop service name but does not register IPC handlers
 * or depend on Electron main-process lifecycle services.
 *
 * It declares no `@DependsOn`. Its container-owned collaborators —
 * `PreferenceService`, `WebSearchService`, `McpRuntimeService` — are resolved
 * inside methods
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
      piChatRuntime: overrides.piChatRuntime ?? piChatRuntime,
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
      ai: { generateImage: (request) => this.generateImage(request) },
      devicePermissions,
      files: {
        createInternalEntry: paintingFileStorage.createInternalEntry,
        discard: paintingFileStorage.discard,
        readDataUrl: paintingFileStorage.readDataUrl,
        resolve: fileContent.resolve,
      },
      mcpRuntime: application.get('McpRuntimeService'),
      preference: application.get('PreferenceService'),
      providerRegistry: providerRegistryService,
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
    if (getChatRuntime() === 'pi') return this.streamTextWithPi(request, signal);

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

  private async streamTextWithPi(
    request: AiStreamRequest,
    signal: AbortSignal,
  ): Promise<ReadableStream<UIMessageChunk>> {
    assertPiRequestSupported(request);
    const { assistant, credentialReceipt, model, options, provider, sdkConfig, system } =
      await this.buildAgentParamsFor(request);
    assertPiBuiltConfigSupported(provider, model, assistant, sdkConfig);
    const providerSettings = readPiProviderSettings(sdkConfig.providerSettings);
    const usageContext = createCaptureContext({
      provider,
      model,
      sdkModelId: sdkConfig.modelId,
      credentialReceipt,
      assistant,
      messageRef: request.messageId ? { kind: 'chat', id: request.messageId } : null,
    });

    // TODO(pi-runtime-migration): This transitional bridge intentionally reuses AI SDK
    // message/config shapes. Rework history hydration, per-turn Pi ownership, provider
    // coverage, tools/attachments, and Message/Assistant persistence together.
    const { PiChatStreamAdapter } = await this.services.piChatRuntime.load();
    const adapter = new PiChatStreamAdapter({
      apiKey: providerSettings.apiKey,
      baseUrl: providerSettings.baseURL,
      contextWindow: model.contextWindow ?? DEFAULT_PI_CONTEXT_WINDOW,
      headers: mergePiHeaders(providerSettings, options.headers),
      maxOutputTokens:
        options.maxOutputTokens ?? model.maxOutputTokens ?? DEFAULT_PI_MAX_OUTPUT_TOKENS,
      maxRetries: options.maxRetries ?? 0,
      messageId: request.messageId,
      modelId: sdkConfig.modelId,
      modelName: model.name,
      providerId: provider.id,
      providerName: provider.name,
      sessionId: request.chatId,
      supportsReasoning: model.reasoning !== undefined,
      system,
      temperature: options.temperature,
      thinkingLevel: resolvePiThinkingLevel(request, assistant, model),
      timeoutMs: options.timeout ?? DEFAULT_PI_TIMEOUT_MS,
      usageCapture: { context: usageContext, recorder: this.services.aiUsageRecord },
    });

    return adapter.stream(request.messages ?? [], signal);
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

type PiProviderSettings = {
  apiKey: string;
  baseURL: string;
  headers?: Record<string, string | undefined>;
  organization?: string;
  project?: string;
};

function assertPiRequestSupported(request: AiStreamRequest): void {
  if (
    request.callOverrides?.toolChoice !== undefined ||
    Object.keys(request.callOverrides?.tools ?? {}).length > 0
  ) {
    throw new Error('Pi chat runtime does not support request tools in this transition stage');
  }
  if ((request.mcpToolIds?.length ?? 0) > 0) {
    throw new Error('Pi chat runtime does not support MCP in this transition stage');
  }
  if ((request.knowledgeBaseIds?.length ?? 0) > 0) {
    throw new Error(
      'Pi chat runtime does not support knowledge-base input in this transition stage',
    );
  }
}

function assertPiBuiltConfigSupported(
  provider: Provider,
  model: Model,
  assistant: Assistant | undefined,
  sdkConfig: { endpoint?: string; providerSettings: unknown },
): void {
  const endpointType = resolveEffectiveEndpoint(provider, model).endpointType;
  if (endpointType !== ENDPOINT_TYPE.OPENAI_RESPONSES) {
    throw new Error(
      `Pi chat runtime only supports the OpenAI Responses endpoint; received ${endpointType ?? 'unknown'}`,
    );
  }
  if (provider.authType !== 'api-key') {
    throw new Error(
      `Pi chat runtime does not support provider authentication type: ${provider.authType}`,
    );
  }
  if (provider.authMethods?.length && !provider.authMethods.includes('api-key')) {
    throw new Error('Pi chat runtime does not support this provider authentication flow');
  }
  if (sdkConfig.endpoint) {
    throw new Error(
      'Pi chat runtime does not support custom endpoint paths in this transition stage',
    );
  }
  if (isRecord(sdkConfig.providerSettings) && sdkConfig.providerSettings.fetch !== undefined) {
    throw new Error(
      'Pi chat runtime does not support custom provider transports in this transition stage',
    );
  }
  if (assistant?.settings.enableWebSearch) {
    throw new Error('Pi chat runtime does not support web search in this transition stage');
  }
  if (assistant && assistant.settings.mcpMode !== 'disabled' && assistant.mcpServerIds.length > 0) {
    throw new Error('Pi chat runtime does not support MCP in this transition stage');
  }
}

function readPiProviderSettings(value: unknown): PiProviderSettings {
  if (!isRecord(value)) throw new Error('Pi chat runtime requires plain provider settings');
  if (typeof value.apiKey !== 'string') {
    throw new Error('Pi chat runtime requires an API key from the selected provider');
  }
  if (typeof value.baseURL !== 'string' || value.baseURL.trim().length === 0) {
    throw new Error('Pi chat runtime requires a base URL from the selected provider');
  }
  if (value.headers !== undefined && !isStringRecord(value.headers)) {
    throw new Error('Pi chat runtime requires plain string provider headers');
  }
  if (value.organization !== undefined && typeof value.organization !== 'string') {
    throw new Error('Pi chat runtime requires a string OpenAI organization');
  }
  if (value.project !== undefined && typeof value.project !== 'string') {
    throw new Error('Pi chat runtime requires a string OpenAI project');
  }

  return {
    apiKey: value.apiKey,
    baseURL: value.baseURL,
    ...(value.headers ? { headers: value.headers } : {}),
    ...(value.organization ? { organization: value.organization } : {}),
    ...(value.project ? { project: value.project } : {}),
  };
}

function mergePiHeaders(
  providerSettings: PiProviderSettings,
  requestHeaders: Record<string, string | undefined> | undefined,
): Record<string, string> | undefined {
  const headers = stripUndefinedHeaders({
    ...providerSettings.headers,
    ...(providerSettings.organization
      ? { 'OpenAI-Organization': providerSettings.organization }
      : {}),
    ...(providerSettings.project ? { 'OpenAI-Project': providerSettings.project } : {}),
    ...requestHeaders,
  });
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function resolvePiThinkingLevel(
  request: AiStreamRequest,
  assistant: Assistant | undefined,
  model: Model,
): PiChatThinkingLevel {
  if (!model.reasoning) return 'off';
  const selection = request.reasoningEffort ?? assistant?.settings.reasoning_effort ?? 'default';
  const resolved =
    selection === 'default' || selection === 'auto'
      ? (model.reasoning.defaultEffort ?? 'medium')
      : selection;
  if (resolved === 'none') return 'off';
  if (resolved === 'auto') return 'medium';
  return resolved;
}

function isStringRecord(value: unknown): value is Record<string, string | undefined> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
