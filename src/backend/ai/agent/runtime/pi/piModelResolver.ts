import { createAiUsageCaptureContext } from '@cherrystudio/ai-runtime/utils';
import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { FetchFunction, Model as PiModel, ModelThinkingLevel } from '@earendil-works/pi-ai';
import { fetch as expoFetch } from 'expo/fetch';

import { resolveProviderConnection } from '@/backend/ai/provider/providerConnection';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import type { RuntimeModel, RuntimeModelPreflight, RuntimeUsageContext } from '..';
import { bindPiStream, resolvePiApiAdapter, type SupportedPiApi } from './piApiAdapters';
import { requirePiLanguageBinding, resolvePiLanguageBinding } from './piLanguageBinding';
import type { PiModelResolution, PiRuntimeDependencies } from './PiRuntime';

const DEFAULT_PI_CONTEXT_WINDOW = 128_000;
const DEFAULT_PI_MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_PI_TIMEOUT_MS = 10 * 60_000;

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

export function createPiModelResolver(): PiRuntimeDependencies {
  return {
    async preflightModel(runtimeModel): Promise<RuntimeModelPreflight> {
      return (await resolveConfiguredPiModel(runtimeModel)).preflight;
    },
    async resolveModel(runtimeModel, runtimeOptions): Promise<PiModelResolution> {
      const { adapter, connection, model, preflight, provider } =
        await resolveConfiguredPiModel(runtimeModel);

      const selectedApiKey = await providerService.resolveApiKey(provider.id);
      if (!selectedApiKey.value.trim()) {
        throw new PiModelResolutionError(
          'invalid_api_key',
          'Pi Runtime requires an API key from the selected provider.',
        );
      }

      const modelId = connection.wireModelId;
      const headers = connection.headers;
      const piModel: PiModel<SupportedPiApi> = {
        api: adapter.api,
        baseUrl: adapter.formatBaseUrl(connection.baseUrl.trim()),
        ...(adapter.api === 'openai-completions' || adapter.api === 'openai-responses'
          ? { compat: { supportsDeveloperRole: false } }
          : {}),
        contextWindow: preflight.contextWindow,
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
        headers,
        id: modelId,
        input: preflight.inputModalities,
        maxTokens: preflight.maxOutputTokens,
        name: model.name,
        provider: provider.id,
        reasoning: model.reasoning !== undefined,
      };
      const streamFn = await bindPiStream(adapter, {
        apiKey: selectedApiKey.value,
        fetch: expoFetch as unknown as FetchFunction,
        headers,
        maxRetries: 0,
        maxTokens: runtimeOptions.maxOutputTokens ?? piModel.maxTokens,
        temperature: runtimeOptions.temperature,
        timeoutMs: DEFAULT_PI_TIMEOUT_MS,
      });
      const capturedContext = createAiUsageCaptureContext({
        credentialReceipt: selectedApiKey.apiKeySelection,
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

      return {
        defaultThinkingLevel: resolveDefaultThinkingLevel(model),
        model: piModel,
        redactionValues: collectRedactionValues(selectedApiKey.value, headers),
        streamFn,
        supportsTools: preflight.supportsTools,
        usageContext,
      };
    },
  };
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
  const adapter = resolvePiApiAdapter(piBinding.endpointType);

  return {
    adapter,
    connection,
    model,
    preflight: toPiModelPreflight(model),
    provider,
  };
}

export function toPiModelPreflight(model: Model): RuntimeModelPreflight {
  const contextWindow = model.contextWindow ?? DEFAULT_PI_CONTEXT_WINDOW;
  const maxOutputTokens = model.maxOutputTokens ?? DEFAULT_PI_MAX_OUTPUT_TOKENS;
  const contextInputLimit = Math.max(0, contextWindow - maxOutputTokens);
  const maxInputTokens = Math.max(
    0,
    Math.min(model.maxInputTokens ?? contextInputLimit, contextInputLimit),
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

function resolveDefaultThinkingLevel(model: Model): ModelThinkingLevel {
  if (!model.reasoning) return 'off';
  const effort = model.reasoning.defaultEffort ?? 'medium';
  if (effort === 'none') return 'off';
  if (effort === 'auto') return 'medium';
  return effort;
}
