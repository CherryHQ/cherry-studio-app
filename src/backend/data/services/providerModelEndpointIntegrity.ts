import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { EndpointType } from '@/shared/data/types/model';
import type { EndpointConfigs } from '@/shared/data/types/provider';
import {
  CHAT_ENDPOINT_TYPES,
  type ChatEndpointType,
  isChatEndpointType,
} from '@/shared/utils/providerEndpoints';

export function hasConfiguredChatEndpoint(
  endpointConfigs: EndpointConfigs | null | undefined,
  endpointType: EndpointType | null | undefined,
): endpointType is ChatEndpointType {
  return (
    isChatEndpointType(endpointType) && Boolean(endpointConfigs?.[endpointType]?.baseUrl?.trim())
  );
}

export function getRemovedConfiguredChatEndpoints(
  currentEndpointConfigs: EndpointConfigs | null | undefined,
  nextEndpointConfigs: EndpointConfigs | null | undefined,
): ChatEndpointType[] {
  return CHAT_ENDPOINT_TYPES.filter(
    (endpointType) =>
      hasConfiguredChatEndpoint(currentEndpointConfigs, endpointType) &&
      !hasConfiguredChatEndpoint(nextEndpointConfigs, endpointType),
  );
}

export function assertCustomProviderEndpointConfiguration({
  defaultChatEndpoint,
  endpointConfigs,
}: {
  defaultChatEndpoint: EndpointType | null | undefined;
  endpointConfigs: EndpointConfigs | null | undefined;
}): void {
  if (!hasConfiguredChatEndpoint(endpointConfigs, defaultChatEndpoint)) {
    throw DataApiErrorFactory.validation(
      {
        defaultChatEndpoint: [
          'Custom providers require a chat default endpoint with a configured Base URL',
        ],
      },
      'Custom provider endpoint configuration is invalid',
    );
  }
}

export function assertCustomProviderModelEndpointTypes({
  defaultChatEndpoint,
  endpointConfigs,
  endpointTypes,
}: {
  defaultChatEndpoint: EndpointType | null | undefined;
  endpointConfigs: EndpointConfigs | null | undefined;
  endpointTypes: readonly EndpointType[];
}): void {
  const endpointType = endpointTypes[0];

  if (endpointType === undefined) {
    assertCustomProviderEndpointConfiguration({ defaultChatEndpoint, endpointConfigs });
    return;
  }

  // Endpoints outside Mobile's configuration vocabulary remain opaque desktop-compatible data.
  // Validate chat routing references independently of the bound Runtime.
  if (
    isChatEndpointType(endpointType) &&
    !hasConfiguredChatEndpoint(endpointConfigs, endpointType)
  ) {
    throw DataApiErrorFactory.validation(
      {
        endpointTypes: [`Endpoint ${endpointType} has no configured Base URL on this provider`],
      },
      'Model endpoint configuration is invalid',
    );
  }
}
