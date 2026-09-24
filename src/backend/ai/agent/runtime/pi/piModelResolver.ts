import { shouldAppendProviderApiVersion } from '@cherrystudio/ai-runtime/provider';
import { createAiUsageCaptureContext } from '@cherrystudio/ai-runtime/utils';
import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { isDeepSeekModel } from '@cherrystudio/universal/utils/model';
import type { FetchFunction, Model as PiModel, ModelThinkingLevel } from '@earendil-works/pi-ai';
import { fetch as expoFetch } from 'expo/fetch';

import { resolveProviderConnection } from '@/backend/ai/provider/providerConnection';
import { modelService } from '@/backend/data/services/ModelService';
import {
  projectRuntimeReasoning,
  providerRegistryService,
} from '@/backend/data/services/ProviderRegistryService';
import { providerService } from '@/backend/data/services/ProviderService';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { resolveEndpointDialect } from '@/shared/data/types/provider';
import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
} from '@/shared/utils/modelTokenLimits';

import type { RuntimeModel, RuntimeModelPreflight, RuntimeUsageContext } from '..';
import { bindPiStream, resolvePiApiAdapter, type SupportedPiApi } from './piApiAdapters';
import { withPiApiKeyFallback } from './piApiKeyFallback';
import { withPiDeepseekDsml } from './piDeepseekDsml';
import { requirePiLanguageBinding, resolvePiLanguageBinding } from './piLanguageBinding';
import type { PiModelResolution, PiRuntimeDependencies } from './PiRuntime';
import { withPiStreamIdleTimeout } from './piStreamIdleTimeout';

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
    async resolveModel(
      runtimeModel,
      runtimeOptions,
      sessionId,
      apiKeyOverride,
    ): Promise<PiModelResolution> {
      const { adapter, connection, model, preflight, provider } =
        await resolveConfiguredPiModel(runtimeModel);

      const selectedApiKey = await providerService.resolveApiKey(provider.id, apiKeyOverride);
      if (!selectedApiKey.value.trim()) {
        throw new PiModelResolutionError(
          'invalid_api_key',
          'Pi Runtime requires an API key from the selected provider.',
        );
      }

      let azureApiVersion: string | undefined;
      if (adapter.api === 'azure-openai-responses') {
        const authConfig = await providerService.getAuthConfig(provider.id);
        const configuredVersion =
          authConfig?.type === 'iam-azure' ? authConfig.apiVersion : provider.settings.apiVersion;
        azureApiVersion = configuredVersion?.trim() || undefined;
      }

      const modelId = connection.wireModelId;
      const headers = { ...connection.headers };
      if (
        (provider.id === 'opencode' || provider.presetProviderId === 'opencode') &&
        !Object.keys(headers).some((name) => name.toLowerCase() === 'x-opencode-session')
      ) {
        headers['x-opencode-session'] = sessionId;
      }
      const reasoningProfile = providerRegistryService.resolveReasoningProfile(
        provider,
        model,
        connection.endpointType,
      );
      const invocationModel = reasoningProfile.support
        ? {
            ...model,
            reasoning: projectRuntimeReasoning(reasoningProfile.support, reasoningProfile.wire),
          }
        : model;
      const piModel: PiModel<SupportedPiApi> = {
        api: adapter.api,
        baseUrl: adapter.formatBaseUrl(
          connection.baseUrl.trim(),
          shouldAppendProviderApiVersion(provider),
        ),
        ...(adapter.api === 'openai-completions' || adapter.api === 'openai-responses'
          ? {
              compat: {
                supportsDeveloperRole: false,
                ...(adapter.api === 'openai-completions'
                  ? {
                      maxTokensField:
                        connection.adapterFamily === 'openai'
                          ? 'max_completion_tokens'
                          : 'max_tokens',
                      supportsStore: connection.adapterFamily === 'openai',
                      supportsStrictMode: connection.adapterFamily === 'openai',
                      supportsUsageInStreaming: resolveEndpointDialect(
                        provider,
                        connection.endpointType,
                      ).streamOptions,
                    }
                  : {}),
              },
            }
          : {}),
        contextWindow: preflight.contextWindow,
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
        headers,
        id: modelId,
        input: preflight.inputModalities,
        maxTokens: preflight.maxOutputTokens,
        name: model.name,
        provider: provider.id,
        reasoning: invocationModel.reasoning !== undefined,
      };
      const streamBinding: Parameters<typeof bindPiStream>[1] = {
        apiKey: selectedApiKey.value,
        fetch: expoFetch as unknown as FetchFunction,
        headers,
        maxRetries: 0,
        maxTokens: runtimeOptions.maxOutputTokens ?? piModel.maxTokens,
        requestParameters: {
          model: invocationModel,
          profile: reasoningProfile.wire,
          selection: runtimeOptions.reasoningEffort,
          summary:
            typeof provider.settings.summaryText === 'string'
              ? provider.settings.summaryText
              : undefined,
        },
        temperature: runtimeOptions.temperature,
        azureApiVersion,
      };
      const primaryStream = await bindPiStream(adapter, streamBinding);
      const hasAuthHeader = Object.keys(headers).some((name) =>
        adapter.authHeaderNames.includes(name.toLowerCase()),
      );
      const capturedContext = createAiUsageCaptureContext({
        credentialReceipt: hasAuthHeader
          ? { attribution: 'unknown' }
          : selectedApiKey.apiKeySelection,
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

      const selectedKeyId =
        'id' in usageContext.credentialReceipt ? usageContext.credentialReceipt.id : undefined;
      const enabledKeys =
        apiKeyOverride === undefined &&
        selectedKeyId !== undefined &&
        provider.apiKeys.filter((key) => key.isEnabled).length > 1
          ? (await providerService.listApiKeys(provider.id, { enabled: true })).keys
          : [];
      const selectedIndex = enabledKeys.findIndex((key) => key.id === selectedKeyId);
      const fallbackKeys =
        selectedIndex < 0
          ? []
          : [...enabledKeys.slice(selectedIndex + 1), ...enabledKeys.slice(0, selectedIndex)];
      const primaryReceipt = usageContext.credentialReceipt;
      const streamFn =
        fallbackKeys.length === 0
          ? primaryStream
          : withPiApiKeyFallback([
              async () => {
                usageContext.credentialReceipt = primaryReceipt;
                return primaryStream;
              },
              ...fallbackKeys.map((key) => async () => {
                const selected = await providerService.resolveApiKey(provider.id, key.key);
                const stream = await bindPiStream(adapter, {
                  ...streamBinding,
                  apiKey: selected.value,
                });
                usageContext.credentialReceipt = selected.apiKeySelection;
                return stream;
              }),
            ]);

      const timedStream = withPiStreamIdleTimeout(streamFn);
      return {
        defaultThinkingLevel: resolveDefaultThinkingLevel(invocationModel),
        maxInputTokens: model.maxInputTokens,
        model: piModel,
        redactionValues: [
          ...collectRedactionValues(selectedApiKey.value, headers),
          ...fallbackKeys.map((key) => key.key),
        ],
        streamFn: isDeepSeekModel(model) ? withPiDeepseekDsml(timedStream) : timedStream,
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
  const adapter = resolvePiApiAdapter(piBinding.endpointType, connection.adapterFamily);

  return {
    adapter,
    connection,
    model,
    preflight: toPiModelPreflight(model),
    provider,
  };
}

export function toPiModelPreflight(model: Model): RuntimeModelPreflight {
  const contextWindow = model.contextWindow ?? DEFAULT_MODEL_CONTEXT_WINDOW;
  const maxOutputTokens = model.maxOutputTokens ?? DEFAULT_MODEL_MAX_OUTPUT_TOKENS;
  // These are model limits; the Runtime budgets input and output together for each request.
  const maxInputTokens = Math.max(
    0,
    Math.min(model.maxInputTokens ?? contextWindow, contextWindow),
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
