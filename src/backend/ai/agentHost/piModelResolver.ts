import { resolveEffectiveEndpoint } from '@cherrystudio/ai-runtime/provider';
import { createAiUsageCaptureContext } from '@cherrystudio/ai-runtime/utils';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { FetchFunction, ModelThinkingLevel } from '@earendil-works/pi-ai';
import { fetch as expoFetch } from 'expo/fetch';

import type {
  PiModelResolution,
  PiRuntimeDependencies,
  RuntimeUsageContext,
} from '@/backend/ai/agent';
import { resolveProviderAiSdkConfig } from '@/backend/ai/provider/config';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

const DEFAULT_PI_CONTEXT_WINDOW = 128_000;
const DEFAULT_PI_MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_PI_TIMEOUT_MS = 10 * 60_000;

type PiProviderSettings = {
  apiKey: string;
  baseURL: string;
  fetch?: FetchFunction;
  headers?: Record<string, string | undefined>;
  organization?: string;
  project?: string;
};

export function createPiModelResolver(): PiRuntimeDependencies {
  return {
    async resolveModel(runtimeModel): Promise<PiModelResolution> {
      const uniqueModelId = createUniqueModelId(runtimeModel.providerId, runtimeModel.modelId);
      const [provider, model] = await Promise.all([
        providerService.getByProviderId(runtimeModel.providerId),
        modelService.getById(uniqueModelId),
      ]);
      if (!model) throw new Error(`Model is not configured: ${uniqueModelId}`);

      assertPiModelSupported(provider, model);
      const { config, credentialReceipt } = await resolveProviderAiSdkConfig(provider, model, {
        fetch: expoFetch as FetchFunction,
        getAuthConfig: (providerId) => providerService.getAuthConfig(providerId),
        resolveApiKey: (providerId, override) =>
          providerService.resolveApiKey(providerId, override),
      });
      if (config.endpoint) {
        throw new Error('Pi Runtime does not support a separate custom endpoint path.');
      }
      const settings = readPiProviderSettings(config.providerSettings);
      const modelId = model.apiModelId ?? model.modelId;
      const capturedContext = createAiUsageCaptureContext({
        credentialReceipt,
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
        apiKey: settings.apiKey,
        defaultThinkingLevel: resolveDefaultThinkingLevel(model),
        fetch: settings.fetch ?? (expoFetch as FetchFunction),
        headers: mergeHeaders(settings),
        maxRetries: 0,
        model: {
          api: 'openai-responses',
          baseUrl: settings.baseURL,
          contextWindow: model.contextWindow ?? DEFAULT_PI_CONTEXT_WINDOW,
          cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
          headers: mergeHeaders(settings),
          id: modelId,
          input: ['text'],
          maxTokens: model.maxOutputTokens ?? DEFAULT_PI_MAX_OUTPUT_TOKENS,
          name: model.name,
          provider: provider.id,
          reasoning: model.reasoning !== undefined,
        },
        supportsTools: model.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL),
        timeoutMs: DEFAULT_PI_TIMEOUT_MS,
        usageContext,
      };
    },
  };
}

function assertPiModelSupported(provider: Provider, model: Model): void {
  const endpointType = resolveEffectiveEndpoint(provider, model).endpointType;
  if (endpointType !== ENDPOINT_TYPE.OPENAI_RESPONSES) {
    throw new Error(
      `Pi Runtime currently supports the OpenAI Responses endpoint; received ${endpointType ?? 'unknown'}.`,
    );
  }
  if (provider.authType !== 'api-key') {
    throw new Error(
      `Pi Runtime does not support provider authentication type: ${provider.authType}`,
    );
  }
  if (provider.authMethods?.length && !provider.authMethods.includes('api-key')) {
    throw new Error('Pi Runtime does not support this provider authentication flow.');
  }
}

function readPiProviderSettings(value: unknown): PiProviderSettings {
  if (!isRecord(value)) throw new Error('Pi Runtime requires plain provider settings.');
  if (typeof value.apiKey !== 'string' || value.apiKey.length === 0) {
    throw new Error('Pi Runtime requires an API key from the selected provider.');
  }
  if (typeof value.baseURL !== 'string' || value.baseURL.trim().length === 0) {
    throw new Error('Pi Runtime requires a base URL from the selected provider.');
  }
  if (value.headers !== undefined && !isStringRecord(value.headers)) {
    throw new Error('Pi Runtime requires plain string provider headers.');
  }
  if (value.organization !== undefined && typeof value.organization !== 'string') {
    throw new Error('Pi Runtime requires a string OpenAI organization.');
  }
  if (value.project !== undefined && typeof value.project !== 'string') {
    throw new Error('Pi Runtime requires a string OpenAI project.');
  }
  if (value.fetch !== undefined && typeof value.fetch !== 'function') {
    throw new Error('Pi Runtime requires a callable provider transport.');
  }

  return {
    apiKey: value.apiKey,
    baseURL: value.baseURL,
    ...(typeof value.fetch === 'function' ? { fetch: value.fetch as FetchFunction } : {}),
    ...(value.headers ? { headers: value.headers } : {}),
    ...(value.organization ? { organization: value.organization } : {}),
    ...(value.project ? { project: value.project } : {}),
  };
}

function mergeHeaders(settings: PiProviderSettings): Record<string, string> | undefined {
  const headers = Object.fromEntries(
    Object.entries({
      ...settings.headers,
      ...(settings.organization ? { 'OpenAI-Organization': settings.organization } : {}),
      ...(settings.project ? { 'OpenAI-Project': settings.project } : {}),
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function resolveDefaultThinkingLevel(model: Model): ModelThinkingLevel {
  if (!model.reasoning) return 'off';
  const effort = model.reasoning.defaultEffort ?? 'medium';
  if (effort === 'none') return 'off';
  if (effort === 'auto') return 'medium';
  return effort;
}

function isStringRecord(value: unknown): value is Record<string, string | undefined> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
