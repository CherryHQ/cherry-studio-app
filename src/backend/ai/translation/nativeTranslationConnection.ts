import {
  formatApiHost,
  isWithTrailingSharp,
  routeToEndpoint,
  shouldAppendProviderApiVersion,
} from '@cherrystudio/ai-runtime/provider';
import {
  encodeChatCompletionsReasoning,
  type GatedSampling,
  getTemperature,
  getTopP,
  normalizeRequestedSelection,
  resolveReasoningInvocation,
} from '@cherrystudio/ai-runtime/utils';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

import {
  projectRuntimeReasoning,
  providerRegistryService,
} from '@/backend/data/services/ProviderRegistryService';
import type { Model } from '@/shared/data/types/model';
import type { AuthConfig, Provider } from '@/shared/data/types/provider';

import { resolveProviderConnection } from '../provider/providerConnection';

/** A deliberately small protocol surface; never infer support from a provider's display name. */
export function resolveNativeTranslationConnection(
  provider: Provider,
  model: Model,
  auth: AuthConfig | null,
  settings: { reasoningEffort: ReasoningEffortOption; sampling: GatedSampling },
): { endpoint: string; wireModelId: string; requestParameters: Record<string, unknown> } | null {
  const connection = resolveProviderConnection(provider, model);
  if (
    connection.endpointType !== ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS ||
    !['openai', 'openai-compatible'].includes(connection.adapterFamily ?? 'openai-compatible') ||
    provider.authType !== 'api-key' ||
    (auth && auth.type !== 'api-key') ||
    (auth?.type === 'api-key' &&
      auth.headerName &&
      auth.headerName.toLowerCase() !== 'authorization') ||
    (auth?.type === 'api-key' && auth.prefix !== undefined && auth.prefix.trim() !== 'Bearer') ||
    Object.keys(provider.settings.extraHeaders ?? {}).length > 0 ||
    provider.settings.serviceTier != null ||
    provider.settings.verbosity != null
  ) {
    return null;
  }
  const formatted = formatApiHost(
    connection.baseUrl,
    shouldAppendProviderApiVersion(provider) && !isWithTrailingSharp(connection.baseUrl),
  );
  const { baseURL, endpoint } = routeToEndpoint(formatted);
  if (endpoint && endpoint !== 'chat/completions') return null;
  try {
    const url = new URL(`${baseURL}/chat/completions`);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return null;
    const profile = providerRegistryService.resolveReasoningProfile(
      provider,
      model,
      connection.endpointType,
    );
    const invocationModel = profile.support
      ? { ...model, reasoning: projectRuntimeReasoning(profile.support, profile.wire) }
      : model;
    const reasoning = resolveReasoningInvocation({
      selection: normalizeRequestedSelection(settings.reasoningEffort, invocationModel),
      model: invocationModel,
      profile: profile.wire,
      maxTokens: model.maxOutputTokens,
      assistantSummary:
        typeof provider.settings.summaryText === 'string'
          ? provider.settings.summaryText
          : undefined,
    });
    const requestParameters = encodeChatCompletionsReasoning(reasoning);
    if (!requestParameters) return null;
    const temperature = getTemperature(settings.sampling, invocationModel, reasoning);
    const topP = getTopP(settings.sampling, invocationModel, reasoning);
    if (temperature !== undefined) requestParameters.temperature = temperature;
    if (topP !== undefined) requestParameters.top_p = topP;
    return { endpoint: url.toString(), wireModelId: connection.wireModelId, requestParameters };
  } catch {
    return null;
  }
}
