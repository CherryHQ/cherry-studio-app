import {
  type AiPlugin,
  generateImage as aiCoreGenerateImage,
  type RuntimeProviderCallEvent,
  type RuntimeProviderCallHandler,
} from '@cherrystudio/ai-core';
import {
  endpointImpliedCapability,
  type ImageGenerationMode,
  MODEL_CAPABILITY,
  type ParamValues,
} from '@cherrystudio/provider-registry';
import type { ServingCredentialReceipt } from '@cherrystudio/universal/data/types/aiUsageRecord';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import type { Model } from '@cherrystudio/universal/data/types/model';
import { parseUniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { type LanguageModelUsage, type ModelMessage, type UIMessageChunk } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import type {
  AiUsageCaptureContext,
  AiUsageRecordService,
  MessageRef,
} from '@/backend/data/services/AiUsageRecordService';
import type { AssistantService } from '@/backend/data/services/AssistantService';
import type { ModelService } from '@/backend/data/services/ModelService';
import type { ProviderService } from '@/backend/data/services/ProviderService';

import { createAiUsagePlugin } from './hooks/billingHook';
import { resolveUIMessageFileUrls } from './messages/messageConverter';
import { resolveEffectiveEndpoint } from './provider/endpoint';
import { listModels as listProviderModels } from './provider/listModels';
import { Agent, buildAgentParams } from './runtime/aiSdk';
import type { BuildAgentParamsDependencies } from './runtime/aiSdk/params/buildAgentParams';
import type { AppProviderSettingsMap } from './types';
import type { AiBaseRequest, AiStreamRequest, ListModelsRequest } from './types/requests';
import { splitImageParamValues } from './utils/imageOptions';
import { buildImageProviderOptions, mergeImageProviderOptions } from './utils/imageProviderOptions';
import { extractAiSdkStandardParams } from './utils/options';
import { getCustomParameters } from './utils/reasoning';
import { createAiUsageCaptureContext } from './utils/usageCapture';

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
    resolveRenderableUri(id: FileEntryId): Promise<string | undefined>;
  };
  model: Pick<ModelService, 'getById'>;
  provider: BuildAgentParamsDependencies['provider'] &
    Pick<ProviderService, 'getByProviderId' | 'getRotatedApiKey'>;
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

    const repairUsagePlugins: { current?: AiPlugin[] } = {};
    const [built, preparedMessages] = await Promise.all([
      this.buildAgentParamsFor(request, true, () => repairUsagePlugins.current ?? []),
      resolveUIMessageFileUrls(request.messages ?? [], (fileEntryId) =>
        this.services.fileContent.resolveRenderableUri(fileEntryId),
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
    const impliedCapability = endpointImpliedCapability(
      resolveEffectiveEndpoint(provider, model).endpointType,
    );
    if (
      model.capabilities.includes(MODEL_CAPABILITY.EMBEDDING) ||
      model.capabilities.includes(MODEL_CAPABILITY.RERANK) ||
      impliedCapability === MODEL_CAPABILITY.EMBEDDING ||
      impliedCapability === MODEL_CAPABILITY.RERANK
    ) {
      throw new Error(`Mobile AI runtime does not support embedding or rerank models: ${model.id}`);
    }
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
