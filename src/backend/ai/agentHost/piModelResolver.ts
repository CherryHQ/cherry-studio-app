import { createAiUsageCaptureContext } from '@cherrystudio/ai-runtime/utils';
import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { FetchFunction, Model as PiModel, ModelThinkingLevel } from '@earendil-works/pi-ai';
import { fetch as expoFetch } from 'expo/fetch';

import type {
  PiModelResolution,
  PiRuntimeDependencies,
  RuntimeModel,
  RuntimeModelPreflight,
  RuntimeUsageContext,
} from '@/backend/ai/agent';
import {
  requirePiLanguageBinding,
  resolveLanguageServingPlan,
} from '@/backend/ai/provider/languageServingPlan';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { bindPiStream, resolvePiApiAdapter, type SupportedPiApi } from './piApiAdapters';

const DEFAULT_PI_CONTEXT_WINDOW = 128_000;
const DEFAULT_PI_MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_PI_TIMEOUT_MS = 10 * 60_000;

export function createPiModelResolver(): PiRuntimeDependencies {
  return {
    async preflightModel(runtimeModel): Promise<RuntimeModelPreflight> {
      return (await resolveConfiguredPiModel(runtimeModel)).preflight;
    },
    async resolveModel(runtimeModel, runtimeOptions): Promise<PiModelResolution> {
      const { adapter, configuredBaseUrl, connection, model, preflight, provider, servingPlan } =
        await resolveConfiguredPiModel(runtimeModel);

      const selectedApiKey = await providerService.resolveApiKey(provider.id);
      if (!selectedApiKey.value.trim()) {
        throw new Error('Pi Runtime requires an API key from the selected provider.');
      }

      const modelId = connection.wireModelId;
      const headers = connection.headers;
      const baseFetch = expoFetch as unknown as typeof globalThis.fetch;
      const providerFetch = servingPlan.transportPolicy?.wrapFetch(baseFetch) ?? baseFetch;
      const piModel: PiModel<SupportedPiApi> = {
        api: adapter.api,
        baseUrl: adapter.formatBaseUrl(configuredBaseUrl),
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
        fetch: providerFetch as FetchFunction,
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

  const servingPlan = resolveLanguageServingPlan(provider, model);
  const connection = servingPlan.connection;
  const piBinding = requirePiLanguageBinding(servingPlan);
  const adapter = resolvePiApiAdapter(piBinding.endpointType);
  const configuredBaseUrl = connection.baseUrl.trim();

  return {
    adapter,
    configuredBaseUrl,
    connection,
    model,
    preflight: toPiModelPreflight(model),
    provider,
    servingPlan,
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
