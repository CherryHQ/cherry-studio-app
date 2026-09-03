import { formatApiHost, withoutTrailingApiVersion } from '@cherrystudio/ai-runtime/provider';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { EndpointType } from '@/shared/data/types/model';
import type { AuthType, EndpointConfigs, Provider } from '@/shared/data/types/provider';

export const CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
] as const satisfies readonly EndpointType[];

export const CUSTOM_PROVIDER_IMAGE_ENDPOINT_TYPES = [
  ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION,
  ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
] as const satisfies readonly EndpointType[];

export const CONFIGURABLE_ENDPOINT_TYPES = [
  ...CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES,
  ...CUSTOM_PROVIDER_IMAGE_ENDPOINT_TYPES,
] as const satisfies readonly EndpointType[];

export type CustomProviderTextEndpoint = (typeof CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES)[number];
export type CustomProviderEndpoint = (typeof CONFIGURABLE_ENDPOINT_TYPES)[number];

export type CustomProviderCreationPayload = {
  defaultChatEndpoint: CustomProviderTextEndpoint;
  endpointConfigs: EndpointConfigs;
};

const defaultChatEndpoint = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
const CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPE_SET = new Set<EndpointType>(
  CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES,
);
const ENDPOINT_EDITABLE_AUTH_TYPES = new Set<AuthType>(['api-key', 'iam-azure']);

export function getPrimaryEndpoint(provider?: Provider | null): EndpointType {
  return provider?.defaultChatEndpoint ?? defaultChatEndpoint;
}

export function getProviderPrimaryBaseUrl(provider?: Provider | null): string {
  return provider?.endpointConfigs?.[getPrimaryEndpoint(provider)]?.baseUrl ?? '';
}

export function isCustomProviderTextEndpointType(
  endpoint: EndpointType | null | undefined,
): endpoint is CustomProviderTextEndpoint {
  return endpoint ? CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPE_SET.has(endpoint) : false;
}

export function isFullyCustomProvider(provider?: Provider | null): provider is Provider {
  return provider !== null && provider !== undefined && provider.presetProviderId == null;
}

export function canEditProviderEndpoint(provider?: Provider | null): boolean {
  return (
    provider !== null &&
    provider !== undefined &&
    ENDPOINT_EDITABLE_AUTH_TYPES.has(provider.authType)
  );
}

export function isValidEndpointBaseUrl(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || trimmed.endsWith('#') || /\s/.test(trimmed)) {
    return false;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getConfiguredCustomProviderTextEndpoints(
  endpointUrls: Partial<Record<EndpointType, string>>,
): CustomProviderTextEndpoint[] {
  return CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.filter((endpointType) =>
    Boolean(endpointUrls[endpointType]?.trim()),
  );
}

export function hasConfiguredCustomProviderTextEndpoint(
  endpointUrls: Partial<Record<EndpointType, string>>,
): boolean {
  return getConfiguredCustomProviderTextEndpoints(endpointUrls).length > 0;
}

export function normalizeCustomProviderDefaultEndpoint(
  endpointUrls: Partial<Record<EndpointType, string>>,
  preferredChatEndpoint?: EndpointType | null,
): CustomProviderTextEndpoint {
  return (
    (isCustomProviderTextEndpointType(preferredChatEndpoint) &&
    endpointUrls[preferredChatEndpoint]?.trim()
      ? preferredChatEndpoint
      : getConfiguredCustomProviderTextEndpoints(endpointUrls)[0]) ??
    ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS
  );
}

export function getCustomProviderEndpointRequestPreview(
  endpointType: CustomProviderTextEndpoint,
  baseUrl: string,
): string | null {
  if (!isValidEndpointBaseUrl(baseUrl)) {
    return null;
  }

  switch (endpointType) {
    case ENDPOINT_TYPE.ANTHROPIC_MESSAGES:
      return `${withoutTrailingApiVersion(formatApiHost(baseUrl, false))}/v1/messages`;
    case ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT:
      return `${formatApiHost(baseUrl, true, 'v1beta')}/models/{model}:generateContent`;
    case ENDPOINT_TYPE.OPENAI_RESPONSES:
      return `${formatApiHost(baseUrl)}/responses`;
    default:
      return `${formatApiHost(baseUrl)}/chat/completions`;
  }
}

export function buildCustomProviderCreationPayload({
  endpointUrls,
  preferredChatEndpoint,
}: {
  endpointUrls: Partial<Record<EndpointType, string>>;
  preferredChatEndpoint?: EndpointType;
}): CustomProviderCreationPayload {
  const endpointConfigs: EndpointConfigs = {};

  for (const endpointType of CONFIGURABLE_ENDPOINT_TYPES) {
    const baseUrl = endpointUrls[endpointType]?.trim();
    if (baseUrl) {
      endpointConfigs[endpointType] = { baseUrl };
    }
  }

  const defaultChatEndpoint = normalizeCustomProviderDefaultEndpoint(
    endpointUrls,
    preferredChatEndpoint,
  );

  return { defaultChatEndpoint, endpointConfigs };
}

export function findInvalidCustomProviderEndpointUrl(
  endpointUrls: Partial<Record<EndpointType, string>>,
): CustomProviderEndpoint | null {
  for (const endpointType of CONFIGURABLE_ENDPOINT_TYPES) {
    const value = endpointUrls[endpointType]?.trim();
    if (value && !isValidEndpointBaseUrl(value)) {
      return endpointType;
    }
  }

  return null;
}
