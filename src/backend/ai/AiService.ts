import {
  type AiPlugin,
  generateImage as aiCoreGenerateImage,
  type RuntimeProviderCallEvent,
  type RuntimeProviderCallHandler,
} from '@cherrystudio/ai-core';
import type { AppProviderSettingsMap } from '@cherrystudio/ai-runtime/provider';
import type { AiBaseRequest, ListModelsRequest } from '@cherrystudio/ai-runtime/runtime';
import {
  buildImageProviderOptions,
  createAiUsageCaptureContext,
  mergeImageProviderOptions,
  splitImageParamValues,
} from '@cherrystudio/ai-runtime/utils';
import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import type { LanguageModelUsage, ModelMessage } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import {
  aiUsageRecordService,
  type AiUsageCaptureContext,
  type AiUsageRecordService,
} from '@/backend/data/services/AiUsageRecordService';
import { modelService, type ModelService } from '@/backend/data/services/ModelService';
import {
  providerRegistryService,
  type ProviderRegistryService,
} from '@/backend/data/services/ProviderRegistryService';
import { providerService, type ProviderService } from '@/backend/data/services/ProviderService';
import type { ServingCredentialReceipt } from '@/shared/data/types/aiUsageRecord';
import type { Model, UniqueModelId } from '@/shared/data/types/model';
import { parseUniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { AiSdkGenerator, buildAgentParams } from './generation';
import { createAiUsagePlugin } from './generation/aiUsagePlugin';
import type { BuildAgentParamsDependencies } from './generation/buildAgentParams';
import { listModels as listProviderModels } from './generation/listModels';
import { VertexAuthClient } from './generation/VertexAuthClient';

// ── Request types ──────────────────────────────────────────────────

/** Non-streaming text generation request — pure transport data. */
export interface AiGenerateRequest extends AiBaseRequest {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  uniqueModelId: UniqueModelId;
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
  uniqueModelId: UniqueModelId;
}

export interface AiCheckModelRequest extends AiBaseRequest {
  timeout?: number;
  uniqueModelId: UniqueModelId;
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
    source: null,
    messageRef: null,
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
 * It declares no `@DependsOn`: its data collaborators are module singletons,
 * and this service initializes and stops no runtime of its own.
 */
@Injectable('AiService')
@ServicePhase(Phase.PostReady)
export class AiService extends BaseService {
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
      model: overrides.model ?? modelService,
      provider: overrides.provider ?? providerService,
      providerRegistry: overrides.providerRegistry ?? providerRegistryService,
      vertexAuth: overrides.vertexAuth ?? this.getVertexAuth(),
    };
  }

  /** Caches minted service-account tokens, so it outlives a single request. */
  private getVertexAuth(): VertexAuthClient {
    this.vertexAuthClient ??= new VertexAuthClient({ fetch: expoFetch as typeof globalThis.fetch });
    return this.vertexAuthClient;
  }

  // ── Non-streaming text generation (agent.generate) ──

  async generateText(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const signal = request.requestOptions?.signal;

    const repairUsagePlugins: { current?: AiPlugin[] } = {};
    const {
      context,
      credentialReceipt,
      model,
      options,
      plugins,
      provider,
      repairToolCall,
      sdkConfig,
      tools,
    } = await this.buildAgentParamsFor(request, () => repairUsagePlugins.current ?? []);
    const usagePlugin = createAiUsagePlugin(
      createCaptureContext({
        provider,
        model,
        sdkModelId: sdkConfig.modelId,
        credentialReceipt,
      }),
      this.services.aiUsageRecord,
    );
    repairUsagePlugins.current = [usagePlugin];

    const generator = new AiSdkGenerator({
      providerId: sdkConfig.providerId,
      providerSettings: sdkConfig.providerSettings,
      modelId: sdkConfig.modelId,
      plugins: [...plugins, usagePlugin],
      context,
      repairToolCall,
      system: request.system,
      tools,
      options,
    });

    // prompt and messages are mutually exclusive in AI SDK; preserve that.
    return generator.generate(
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
    const { sdkConfig, credentialReceipt, model, options, provider } =
      await this.buildAgentParamsFor(request);
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
  async checkModel(request: AiCheckModelRequest): Promise<{ latency: number }> {
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
    if (!request.providerId) throw new Error('listModels requires providerId');
    return this.services.provider.getByProviderId(request.providerId);
  }

  private async buildAgentParamsFor(
    request: AiBaseRequest,
    getRepairUsagePlugins?: () => AiPlugin[],
  ) {
    const { provider, model } = await this.getProviderAndModel(request);
    const built = await buildAgentParams({
      request,
      services: this.services,
      provider,
      model,
      getRepairUsagePlugins,
    });
    return { ...built, provider, model };
  }

  private async getProviderAndModel(
    request: AiBaseRequest,
  ): Promise<{ provider: Provider; model: Model }> {
    const { uniqueModelId } = request;
    if (!uniqueModelId) throw new Error('AiService requires uniqueModelId');

    const { providerId, modelId } = parseUniqueModelId(uniqueModelId);
    const [provider, model] = await Promise.all([
      this.services.provider.getByProviderId(providerId),
      this.services.model.getById(uniqueModelId),
    ]);
    if (!model) {
      throw new Error(`Cannot resolve model: ${providerId}::${modelId}`);
    }

    return { provider, model };
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
