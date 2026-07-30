import {
  embedMany as aiCoreEmbedMany,
  generateImage as aiCoreGenerateImage,
} from '@cherrystudio/ai-core';
import {
  type ImageGenerationMode,
  MODEL_CAPABILITY,
  type ParamValues,
} from '@cherrystudio/provider-registry';
import { type LanguageModelUsage, type ModelMessage, type UIMessageChunk } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import type { FileEntryService } from '@/backend/infrastructure/services/FileEntryService';
import type { Model } from '@/shared/data/types/model';
import { parseUniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { resolveMediaCapabilities } from './messages/messageCapabilities';
import { resolveUIMessageFileUrls } from './messages/messageConverter';
import { listModels as listProviderModels } from './provider/listModels';
import { Agent, buildAgentParams } from './runtime/aiSdk';
import {
  type BuildAgentParamsDependencies,
  getCustomParameters,
} from './runtime/aiSdk/params/buildAgentParams';
import type { AppProviderSettingsMap } from './types';
import type { AiBaseRequest, AiStreamRequest, ListModelsRequest } from './types/requests';
import { splitImageParamValues } from './utils/imageOptions';
import { buildImageProviderOptions, mergeImageProviderOptions } from './utils/imageProviderOptions';
import { extractAiSdkStandardParams } from './utils/options';

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
  fileEntry: Pick<FileEntryService, 'resolveUri'>;
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

    const [
      { context, sdkConfig, model, repairToolCall, system, tools, plugins, options },
      preparedMessages,
    ] = await Promise.all([
      buildAgentParams({
        request,
        services: this.services,
        shouldIncludeExternalTools: true,
      }),
      resolveUIMessageFileUrls(request.messages ?? [], (fileEntryId) =>
        this.services.fileEntry.resolveUri(fileEntryId),
      ),
    ]);

    const agent = new Agent({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      messageId: request.messageId,
      mediaCapabilities: resolveMediaCapabilities(model),
      plugins,
      context,
      repairToolCall,
      system,
      tools,
      options,
    });

    return agent.stream(preparedMessages, signal);
  }

  // ── Non-streaming text generation (agent.generate) ──

  async generateText(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const signal = request.requestOptions?.signal;

    const { context, sdkConfig, system, plugins, repairToolCall, options } = await buildAgentParams(
      { request, services: this.services },
    );

    const agent = new Agent({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      plugins,
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
    const { sdkConfig, model, assistant, options, provider } = await buildAgentParams({
      request,
      services: this.services,
    });
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

    const result = await aiCoreGenerateImage<AppProviderSettingsMap>(
      sdkConfig.providerId,
      providerSettings as never,
      {
        model: model.modelId,
        prompt: hasInputImages ? { images: inputImages, text: request.prompt } : request.prompt,
        n: structured.n ?? 1,
        size: structured.size as `${number}x${number}` | undefined,
        aspectRatio: structured.aspectRatio as `${number}:${number}` | undefined,
        seed: structured.seed,
        maxRetries: request.requestOptions?.maxRetries ?? 0,
        abortSignal: signal,
        ...(mergedProviderOptions && { providerOptions: mergedProviderOptions }),
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
    const { context, sdkConfig, model, plugins, repairToolCall, options } = await buildAgentParams({
      request,
      services: this.services,
    });

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
      context,
      repairToolCall,
      system: 'test',
      options,
    });

    return agent.generate({ prompt: 'hi' }, signal);
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

function isEmbeddingModel(model: Model): boolean {
  return model.capabilities.includes(MODEL_CAPABILITY.EMBEDDING);
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
