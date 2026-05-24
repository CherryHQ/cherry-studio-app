import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { EndpointType } from '@/data/types/model';
import type { AuthType, EndpointConfig, EndpointConfigs, Provider } from '@/data/types/provider';

export const configurableEndpointTypes: EndpointType[] = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
];

const defaultChatEndpoint = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
const endpointEditableAuthTypes: AuthType[] = ['api-key', 'iam-azure'];

export function getPrimaryEndpoint(provider?: Provider | null): EndpointType {
  return provider?.defaultChatEndpoint ?? defaultChatEndpoint;
}

export function isConfigurableEndpointType(
  endpoint: EndpointType | null | undefined,
): endpoint is EndpointType {
  return (
    endpoint !== null && endpoint !== undefined && configurableEndpointTypes.includes(endpoint)
  );
}

export function canEditProviderEndpoint(provider?: Provider | null): boolean {
  return (
    provider !== null &&
    provider !== undefined &&
    endpointEditableAuthTypes.includes(provider.authType)
  );
}

export function getConfigurableEndpointTypesForProvider(
  provider?: Provider | null,
): EndpointType[] {
  return canEditProviderEndpoint(provider) ? configurableEndpointTypes : [];
}

export function resolveVisibleEndpointTypes(provider?: Provider | null): EndpointType[] {
  const primaryEndpoint = getPrimaryEndpoint(provider);
  const configured = Object.keys(provider?.endpointConfigs ?? {}) as EndpointType[];
  const secondaryEndpoints = configured.filter((endpoint) => endpoint !== primaryEndpoint).sort();

  return [primaryEndpoint, ...secondaryEndpoints];
}

export function buildAddableEndpointOptions(
  provider: Provider | null | undefined,
  visibleEndpointTypes: readonly EndpointType[] = [],
): EndpointType[] {
  const visible = new Set(visibleEndpointTypes);
  return getConfigurableEndpointTypesForProvider(provider).filter(
    (endpoint) => !visible.has(endpoint),
  );
}

export function isValidEndpointBaseUrl(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function mergeEndpointConfigs(
  endpointConfigs: EndpointConfigs | undefined,
  baseUrlByEndpoint: Partial<Record<EndpointType, string>>,
  primaryEndpoint: EndpointType,
  visibleEndpointTypes: readonly EndpointType[],
): EndpointConfigs {
  const nextEndpointConfigs: EndpointConfigs = { ...(endpointConfigs ?? {}) };
  const endpoints = new Set<EndpointType>([
    ...(Object.keys(endpointConfigs ?? {}) as EndpointType[]),
    ...visibleEndpointTypes,
  ]);
  const visible = new Set(visibleEndpointTypes);

  for (const endpoint of endpoints) {
    const value = visible.has(endpoint) ? (baseUrlByEndpoint[endpoint] ?? '').trim() : '';

    if (value) {
      const currentConfig: EndpointConfig = nextEndpointConfigs[endpoint] ?? {};
      nextEndpointConfigs[endpoint] = { ...currentConfig, baseUrl: value };
      continue;
    }

    if (endpoint === primaryEndpoint) {
      const currentConfig = { ...nextEndpointConfigs[endpoint] };
      delete currentConfig.baseUrl;
      if (Object.keys(currentConfig).length > 0) {
        nextEndpointConfigs[endpoint] = currentConfig;
      } else {
        delete nextEndpointConfigs[endpoint];
      }
    } else {
      delete nextEndpointConfigs[endpoint];
    }
  }

  return nextEndpointConfigs;
}

export function getEndpointLabel(endpoint: EndpointType): string {
  switch (endpoint) {
    case 'openai-chat-completions':
      return 'OpenAI Chat Completions';
    case 'openai-responses':
      return 'OpenAI Responses';
    case 'anthropic-messages':
      return 'Anthropic Messages';
    case 'google-generate-content':
      return 'Google Gemini';
    case 'ollama-chat':
      return 'Ollama Chat';
    case 'ollama-generate':
      return 'Ollama Generate';
    case 'openai-text-completions':
      return 'OpenAI Text Completions';
    default:
      return endpoint;
  }
}
