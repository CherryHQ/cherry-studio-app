import {
  getExtraHeaders,
  resolveEffectiveEndpoint,
  resolveWireModelId,
} from '@cherrystudio/ai-runtime/provider';
import { createAiUsageCaptureContext } from '@cherrystudio/ai-runtime/utils';
import { MODEL_CAPABILITY, type EndpointType } from '@cherrystudio/provider-registry';
import type { FetchFunction, Model as PiModel, ModelThinkingLevel } from '@earendil-works/pi-ai';
import { fetch as expoFetch } from 'expo/fetch';

import type {
  PiModelResolution,
  PiRuntimeDependencies,
  RuntimeUsageContext,
} from '@/backend/ai/agent';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { bindPiStream, resolvePiApiAdapter, type SupportedPiApi } from './piApiAdapters';

const DEFAULT_PI_CONTEXT_WINDOW = 128_000;
const DEFAULT_PI_MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_PI_TIMEOUT_MS = 10 * 60_000;

const NON_STANDARD_ADAPTER_FAMILIES = new Set([
  'azure',
  'azure-responses',
  'bedrock',
  'google-vertex',
  'google-vertex-anthropic',
]);

export function createPiModelResolver(): PiRuntimeDependencies {
  return {
    async resolveModel(runtimeModel, runtimeOptions): Promise<PiModelResolution> {
      const uniqueModelId = createUniqueModelId(runtimeModel.providerId, runtimeModel.modelId);
      const [provider, model] = await Promise.all([
        providerService.getByProviderId(runtimeModel.providerId),
        modelService.getById(uniqueModelId),
      ]);
      if (!model) throw new Error(`Model is not configured: ${uniqueModelId}`);

      const resolvedEndpoint = resolveEffectiveEndpoint(provider, model);
      const adapter = resolveSupportedAdapter(provider, resolvedEndpoint.endpointType);
      const configuredBaseUrl = resolvedEndpoint.baseUrl.trim();
      if (!configuredBaseUrl) {
        throw new Error('Pi Runtime requires a base URL from the selected provider.');
      }
      if (configuredBaseUrl.endsWith('#')) {
        throw new Error('Pi Runtime does not support a separate custom endpoint path.');
      }

      const selectedApiKey = await providerService.resolveApiKey(provider.id);
      if (!selectedApiKey.value.trim()) {
        throw new Error('Pi Runtime requires an API key from the selected provider.');
      }

      const modelId = resolveWireModelId(model, resolvedEndpoint.endpointType);
      const headers = { ...defaultAppHeaders(), ...getExtraHeaders(provider) };
      const piModel: PiModel<SupportedPiApi> = {
        api: adapter.api,
        baseUrl: adapter.formatBaseUrl(configuredBaseUrl),
        contextWindow: model.contextWindow ?? DEFAULT_PI_CONTEXT_WINDOW,
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
        headers,
        id: modelId,
        input: ['text'],
        maxTokens: model.maxOutputTokens ?? DEFAULT_PI_MAX_OUTPUT_TOKENS,
        name: model.name,
        provider: provider.id,
        reasoning: model.reasoning !== undefined,
      };
      const streamFn = await bindPiStream(adapter, {
        apiKey: selectedApiKey.value,
        fetch: expoFetch as FetchFunction,
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
        supportsTools: model.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL),
        usageContext,
      };
    },
  };
}

function resolveSupportedAdapter(provider: Provider, endpointType: EndpointType | undefined) {
  const adapterFamily = endpointType
    ? provider.endpointConfigs?.[endpointType]?.adapterFamily
    : undefined;
  if (adapterFamily && NON_STANDARD_ADAPTER_FAMILIES.has(adapterFamily)) {
    throw new Error(`Pi Runtime does not support provider adapter family: ${adapterFamily}.`);
  }

  const adapter = resolvePiApiAdapter(endpointType);
  if (!adapter) {
    throw new Error(
      `Pi Runtime does not support the selected endpoint: ${endpointType ?? 'unknown'}.`,
    );
  }
  if (provider.authType !== 'api-key') {
    throw new Error(
      `Pi Runtime does not support provider authentication type: ${provider.authType}.`,
    );
  }
  if (provider.authMethods?.length && !provider.authMethods.includes('api-key')) {
    throw new Error('Pi Runtime does not support this provider authentication flow.');
  }
  return adapter;
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
