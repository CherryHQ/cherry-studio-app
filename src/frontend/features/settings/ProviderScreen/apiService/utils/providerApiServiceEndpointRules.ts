import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { EndpointType } from '@/shared/data/types/model';
import type {
  AuthType,
  EndpointConfig,
  EndpointConfigs,
  Provider,
} from '@/shared/data/types/provider';

export const CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
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
const CONFIGURABLE_ENDPOINT_TYPE_SET = new Set<EndpointType>(CONFIGURABLE_ENDPOINT_TYPES);
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

export function isConfigurableEndpointType(
  endpoint: EndpointType | null | undefined,
): endpoint is EndpointType {
  return (
    endpoint !== null && endpoint !== undefined && CONFIGURABLE_ENDPOINT_TYPE_SET.has(endpoint)
  );
}

export function isCustomProviderTextEndpointType(
  endpoint: EndpointType,
): endpoint is CustomProviderTextEndpoint {
  return CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPE_SET.has(endpoint);
}

export function canEditProviderEndpoint(provider?: Provider | null): boolean {
  return (
    provider !== null &&
    provider !== undefined &&
    ENDPOINT_EDITABLE_AUTH_TYPES.has(provider.authType)
  );
}

export function getConfigurableEndpointTypesForProvider(
  provider?: Provider | null,
): EndpointType[] {
  return canEditProviderEndpoint(provider) ? [...CONFIGURABLE_ENDPOINT_TYPES] : [];
}

export function resolveVisibleEndpointTypes(provider?: Provider | null): EndpointType[] {
  const primaryEndpoint = getPrimaryEndpoint(provider);
  const configured = Object.keys(provider?.endpointConfigs ?? {}) as EndpointType[];
  const secondaryEndpoints = configured.filter((endpoint) => endpoint !== primaryEndpoint).sort();

  return [primaryEndpoint, ...secondaryEndpoints];
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

  const defaultChatEndpoint =
    (preferredChatEndpoint &&
    isCustomProviderTextEndpointType(preferredChatEndpoint) &&
    endpointUrls[preferredChatEndpoint]?.trim()
      ? preferredChatEndpoint
      : CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.find((endpointType) =>
          endpointUrls[endpointType]?.trim(),
        )) ?? ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;

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

export function mergeEndpointConfigs(
  endpointConfigs: EndpointConfigs | undefined,
  baseUrlByEndpoint: Partial<Record<EndpointType, string>>,
  visibleEndpointTypes: readonly EndpointType[],
): EndpointConfigs {
  const nextEndpointConfigs: EndpointConfigs = { ...endpointConfigs };
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

    const currentConfig = { ...nextEndpointConfigs[endpoint] };
    delete currentConfig.baseUrl;
    if (Object.keys(currentConfig).length > 0) {
      nextEndpointConfigs[endpoint] = currentConfig;
    } else {
      delete nextEndpointConfigs[endpoint];
    }
  }

  return nextEndpointConfigs;
}
