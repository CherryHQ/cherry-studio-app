/**
 * Endpoint + AI SDK provider id resolution. See
 * `docs/references/ai/adapter-family.md` in desktop for design rationale.
 */

import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { EndpointType, Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import { type AppProviderId, appProviderIds } from '../types';
import { getBaseUrl } from '../utils/provider';

const appProviderIdMap = appProviderIds as Record<string, AppProviderId>;

export interface ResolvedEndpoint {
  /** `undefined` when neither model nor provider declares an endpoint. */
  endpointType: EndpointType | undefined;
  /** Empty string when no config matched. */
  baseUrl: string;
}

/**
 * Priority: `model.endpointTypes[0]` -> `provider.defaultChatEndpoint` -> `undefined`.
 * `getBaseUrl` applies its own fallback among `endpointConfigs`.
 */
export function resolveEffectiveEndpoint(provider: Provider, model: Model): ResolvedEndpoint {
  const modelEndpoint = model.endpointTypes?.[0];
  const providerDefault = provider.defaultChatEndpoint;
  const endpointType = modelEndpoint ?? providerDefault;
  return { endpointType, baseUrl: getBaseUrl(provider, endpointType) };
}

/** Maps base id -> variant id (`openai` + `openai-chat-completions` -> `openai-chat`). No-op when no variant exists. */
export function resolveProviderVariant(
  baseProviderId: AppProviderId,
  endpointType: EndpointType | undefined,
): AppProviderId {
  if (!endpointType) return baseProviderId;

  if (
    endpointType === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS ||
    endpointType === ENDPOINT_TYPE.OLLAMA_CHAT
  ) {
    const chatVariant = `${baseProviderId}-chat`;
    if (chatVariant in appProviderIdMap) return appProviderIdMap[chatVariant];
  }

  if (endpointType === ENDPOINT_TYPE.OPENAI_RESPONSES) {
    const responsesVariant = `${baseProviderId}-responses`;
    if (responsesVariant in appProviderIdMap) return appProviderIdMap[responsesVariant];
  }

  return baseProviderId;
}

export function resolveAiSdkProviderId(
  provider: Provider,
  endpointType: EndpointType | undefined,
): AppProviderId {
  const adapterFamily = endpointType
    ? provider.endpointConfigs?.[endpointType]?.adapterFamily
    : undefined;
  if (adapterFamily && adapterFamily in appProviderIdMap) {
    return resolveProviderVariant(appProviderIdMap[adapterFamily], endpointType);
  }

  const presetId = provider.presetProviderId ?? provider.id;
  const providerId = presetId in appProviderIdMap ? appProviderIdMap[presetId] : undefined;
  if (providerId) {
    return resolveProviderVariant(providerId, endpointType);
  }

  return appProviderIdMap['openai-compatible'];
}
