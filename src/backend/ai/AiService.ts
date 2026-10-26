import {
  generateImage as aiCoreGenerateImage,
  generateSpeech as aiCoreGenerateSpeech,
  transcribe as aiCoreTranscribe,
  type RuntimeProviderCallEvent,
  type RuntimeProviderCallHandler,
} from '@cherrystudio/ai-core';
import {
  buildImageProviderOptions,
  isImageTransportDescriptorSupported,
  splitImageParamValues,
} from '@cherrystudio/ai-runtime/image';
import {
  type AppProviderSettingsMap,
  resolveSpeechVoice,
  resolveVoiceCapabilities,
  resolveVoiceEndpoint,
  resolveVoiceModel,
  type VoiceAdapterFamily,
  type VoiceCapabilities,
  type VoiceOperation,
} from '@cherrystudio/ai-runtime/provider';
import type { AiBaseRequest, ListModelsRequest } from '@cherrystudio/ai-runtime/runtime';
import { createAiUsageCaptureContext } from '@cherrystudio/ai-runtime/utils';
import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
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
import { AiRequestError } from '@/shared/contracts/aiFailure';
import {
  VoiceError,
  type SpeechModelOptions,
  type VoiceModelSelection,
} from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import type { ServingCredentialReceipt } from '@/shared/data/types/aiUsageRecord';
import type { Model, UniqueModelId } from '@/shared/data/types/model';
import { createUniqueModelId, parseUniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { createAiFailure } from '@/shared/utils/createAiFailure';
import { isSpeechToTextModel, isTextToSpeechModel } from '@/shared/utils/modelPurpose';

import { listModels as listProviderModels } from './generation/listModels';
import { resolveAiSdkServing } from './generation/providerConfig';
import { VertexAuthClient } from './generation/VertexAuthClient';
import { normalizeAiError } from './normalizeAiError';

// ── Request types ──────────────────────────────────────────────────

export type AiUsageAttribution = Pick<AiUsageCaptureContext, 'source' | 'messageRef'>;
/** Read at call time by callers created before the attributed message exists. */
export type AiUsageAttributionResolver = () => AiUsageAttribution;

/** Image requests accept transport options only; text generation controls have no image meaning. */
export interface AiImageRequest extends Pick<AiBaseRequest, 'apiKeyOverride' | 'requestOptions'> {
  usageAttribution?: AiUsageAttribution;
  inputImages?: string[];
  mode: ImageGenerationMode;
  paramValues: ParamValues;
  prompt: string;
  uniqueModelId: UniqueModelId;
}

export interface AiImageResult {
  images: {
    base64: string;
    mediaType: string;
  }[];
  usage?: unknown;
}

export interface AiServiceDependencies {
  aiUsageRecord: Pick<AiUsageRecordService, 'recordInvocation'>;
  model: Pick<ModelService, 'getById'>;
  provider: Pick<
    ProviderService,
    'getAuthConfig' | 'getByProviderId' | 'getRotatedApiKey' | 'resolveApiKey'
  >;
  providerRegistry: Pick<
    ProviderRegistryService,
    'getImageGenerationSupport' | 'listProviderRegistryModels'
  >;
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
  usageAttribution?: AiUsageAttribution;
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
    source: input.usageAttribution?.source,
    messageRef: input.usageAttribution?.messageRef,
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
    const { provider, model } = await this.getProviderAndModel(request);
    const { sdkConfig, credentialReceipt } = await resolveAiSdkServing({
      provider,
      model,
      providerService: this.services.provider,
      apiKeyOverride: request.apiKeyOverride,
    });
    const { structured, vendorBag } = splitImageParamValues(request.paramValues);
    const registryProviderId = provider.presetProviderId ?? provider.id;
    const vendorTransport = this.services.providerRegistry.getImageGenerationSupport(
      registryProviderId,
      model.apiModelId ?? model.modelId,
    )?.modes?.[request.mode]?.vendorTransport;
    const modelDescriptor = vendorTransport?.endpoint
      ? { ...vendorTransport, id: sdkConfig.modelId, mode: request.mode }
      : undefined;
    if (!isImageTransportDescriptorSupported(sdkConfig.providerId, modelDescriptor)) {
      throw new Error(
        `Unsupported image generation route for ${registryProviderId}: ${sdkConfig.modelId}`,
      );
    }
    const transportVendorBag = vendorTransport?.endpoint
      ? {
          ...vendorBag,
          modelDescriptor,
        }
      : vendorBag;
    const imageProviderOptions = buildImageProviderOptions({
      aiSdkProviderId: sdkConfig.providerId,
      modelId: sdkConfig.modelId,
      paramValues: request.paramValues,
      provider,
      vendorBag: transportVendorBag,
    });
    const inputImages = request.inputImages ?? [];
    const hasInputImages = inputImages.length > 0;
    const providerSettings = hasInputImages
      ? { ...sdkConfig.providerSettings, fetch: expoFetch }
      : sdkConfig.providerSettings;
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
        ...(Object.keys(imageProviderOptions).length > 0 && {
          providerOptions: imageProviderOptions,
        }),
        ...(request.requestOptions?.headers && {
          headers: stripUndefinedHeaders(request.requestOptions.headers),
        }),
        onProviderCallStart: () =>
          createProviderCallHandler(
            createCaptureContext({
              provider,
              model,
              sdkModelId: sdkConfig.modelId,
              credentialReceipt,
              usageAttribution: request.usageAttribution,
            }),
            this.services.aiUsageRecord,
          ),
      },
    ).catch((error: unknown) => {
      if (signal?.aborted) throw error;
      const apiKey =
        sdkConfig.providerSettings && 'apiKey' in sdkConfig.providerSettings
          ? sdkConfig.providerSettings.apiKey
          : undefined;
      throw new AiRequestError(
        createAiFailure(
          normalizeAiError(error, typeof apiKey === 'string' ? [apiKey] : [], {
            providerId: provider.id,
            modelId: model.apiModelId ?? model.modelId,
          }),
        ),
      );
    });

    return {
      images: result.images.map((image) => ({
        base64: image.base64,
        mediaType: image.mediaType,
      })),
      usage: result.usage,
    };
  }

  async generateSpeech(
    input: VoiceModelSelection & { text: string; voice?: string },
    signal: AbortSignal,
  ) {
    return this.executeVoice(input, 'speech', signal, (config, capabilities) => {
      const { voice } = speechConfiguration(capabilities, input.voice);
      return aiCoreGenerateSpeech(
        resolveVoiceModel(config, 'speech'),
        input.text,
        { voice },
        signal,
      );
    });
  }

  async getSpeechModelOptions(
    selection: VoiceModelSelection,
    signal: AbortSignal,
  ): Promise<SpeechModelOptions> {
    const { capabilities } = await this.resolveVoiceSelection(selection, 'speech', signal);
    if (capabilities.operation !== 'speech')
      throw new VoiceError('not-configured', 'Select a speech model.');
    return {
      voices: capabilities.voices.map((id) => ({ id, name: id })),
      defaultVoice: capabilities.defaultVoice,
      acceptsCustomVoice: capabilities.acceptsCustomVoice,
    };
  }

  async resolveSpeechConfiguration(
    input: VoiceModelSelection & { voice?: string },
    signal: AbortSignal,
  ) {
    const { capabilities } = await this.resolveVoiceSelection(input, 'speech', signal);
    return speechConfiguration(capabilities, input.voice);
  }

  async getVoiceModelStatus(
    selection: VoiceModelSelection,
    operation: VoiceOperation,
    signal: AbortSignal,
  ) {
    try {
      await this.resolveVoiceSelection(selection, operation, signal);
      return 'ready' as const;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof VoiceError && error.code === 'not-configured')
        return 'needs-setup' as const;
      throw error;
    }
  }

  async transcribe(
    input: VoiceModelSelection & { audio: Uint8Array; mediaType: string },
    signal: AbortSignal,
  ) {
    return this.executeVoice(input, 'transcription', signal, (config) => {
      return aiCoreTranscribe(
        resolveVoiceModel(config, 'transcription', input.mediaType),
        input.audio,
        {},
        signal,
      );
    });
  }

  private async resolveVoiceSelection(
    selection: VoiceModelSelection,
    operation: VoiceOperation,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    if (!selection.providerId || !selection.modelId.trim() || selection.modelId.length > 256)
      throw new VoiceError('not-configured', 'A voice provider and model ID are required.');
    const provider = await this.services.provider
      .getByProviderId(selection.providerId)
      .catch((error: unknown) => {
        if (error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND)
          throw new VoiceError('not-configured', 'The selected voice account no longer exists.', {
            cause: error,
          });
        throw error;
      });
    const model = await this.services.model.getById(
      createUniqueModelId(provider.id, selection.modelId.trim()),
    );
    signal.throwIfAborted();
    if (
      !model ||
      !model.isEnabled ||
      model.isHidden ||
      !(operation === 'speech' ? isTextToSpeechModel(model) : isSpeechToTextModel(model))
    )
      throw new VoiceError('not-configured', 'Select an available model for this voice operation.');
    const endpointType = resolveVoiceEndpoint(provider, model, operation);
    if (!provider.isEnabled || !endpointType)
      throw new VoiceError('not-configured', 'This provider cannot serve the audio protocol.');
    const adapterFamily = provider.endpointConfigs?.[endpointType]?.adapterFamily;
    const capabilities = resolveVoiceCapabilities(
      adapterFamily,
      model.apiModelId ?? model.modelId,
      operation,
    );
    if (
      !capabilities ||
      (adapterFamily !== 'openai' &&
        adapterFamily !== 'openai-compatible' &&
        adapterFamily !== 'aihubmix')
    )
      throw new VoiceError('not-configured', 'This model cannot serve the audio protocol.');
    return { provider, model, endpointType, adapterFamily, capabilities };
  }

  private async executeVoice<TResult>(
    selection: VoiceModelSelection,
    operation: VoiceOperation,
    signal: AbortSignal,
    invoke: (
      config: Parameters<typeof resolveVoiceModel>[0],
      capabilities: VoiceCapabilities,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    const startedAt = Date.now();
    let phase = 'selection';
    let statusCode: number | undefined;
    let secrets: string[] = [];
    try {
      const { provider, model, endpointType, adapterFamily, capabilities } =
        await this.resolveVoiceSelection(selection, operation, signal);
      phase = 'credentials';
      const { sdkConfig } = await resolveAiSdkServing({
        provider,
        model: { ...model, endpointTypes: [endpointType] },
        providerService: this.services.provider,
      });
      const settings = sdkConfig.providerSettings;
      if (settings && 'apiKey' in settings && typeof settings.apiKey === 'string')
        secrets = [settings.apiKey];
      const configuredHeaders = settings?.headers;
      const headers = await (typeof configuredHeaders === 'function'
        ? configuredHeaders()
        : configuredHeaders);
      signal.throwIfAborted();
      phase = 'request';
      const result = await invoke(
        {
          adapterFamily: adapterFamily as VoiceAdapterFamily,
          modelId: sdkConfig.modelId,
          settings: {
            ...settings,
            headers: stripUndefinedHeaders(headers ?? {}),
            fetch: async (...args: Parameters<typeof expoFetch>) => {
              phase = 'transport';
              const response = await expoFetch(...args);
              phase = 'response';
              statusCode = response.status;
              return response;
            },
          },
        },
        capabilities,
      );
      signal.throwIfAborted();
      // ai-core's one-shot audio results contain no usage or price facts. Do not manufacture
      // language-token records or zero-cost receipts in AiUsageRecordService.
      return result;
    } catch (error) {
      signal.throwIfAborted();
      const failure = normalizeAiError(error, secrets, {
        providerId: selection.providerId,
        modelId: selection.modelId,
      });
      const detail = createAiFailure(failure);
      const uploadFailed = /^Unsupported FormData(?:Part)? implementation$/.test(failure.message);
      loggerService.withContext('AiService').error('Voice request failed', {
        operation,
        phase,
        elapsedMs: Date.now() - startedAt,
        providerId: selection.providerId,
        modelId: selection.modelId,
        code:
          error instanceof VoiceError
            ? error.code
            : uploadFailed
              ? 'upload-failed'
              : detail.failure.reasonCode,
        statusCode: failure.context?.statusCode ?? statusCode,
      });
      if (error instanceof VoiceError) throw error;
      if (uploadFailed)
        throw new VoiceError('upload-failed', 'The audio upload could not be encoded.', {
          cause: error,
        });
      throw new AiRequestError(detail);
    }
  }

  private async getProviderForListModels(request: ListModelsRequest): Promise<Provider> {
    if (!request.providerId) throw new Error('listModels requires providerId');
    return this.services.provider.getByProviderId(request.providerId);
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

function speechConfiguration(capabilities: VoiceCapabilities, selected?: string) {
  if (capabilities.operation !== 'speech')
    throw new VoiceError('not-configured', 'Select a speech model.');
  const voice = resolveSpeechVoice(capabilities, selected);
  if (!voice)
    throw new VoiceError(
      'invalid-voice',
      'Select a supported voice or a model with a default voice.',
    );
  return {
    voice,
    maxInputCharacters: capabilities.maxInputCharacters,
    mediaType: capabilities.outputMediaType,
  };
}

function stripUndefinedHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
