import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { EndpointType } from '@/shared/data/types/model';
import type { EndpointConfigs } from '@/shared/data/types/provider';

export const PI_TEXT_ENDPOINT_TYPES = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
] as const satisfies readonly EndpointType[];

export type PiTextEndpointType = (typeof PI_TEXT_ENDPOINT_TYPES)[number];

const PI_TEXT_ENDPOINT_TYPE_SET = new Set<EndpointType>(PI_TEXT_ENDPOINT_TYPES);

export function isPiTextEndpointType(
  endpointType: EndpointType | null | undefined,
): endpointType is PiTextEndpointType {
  return endpointType !== null && endpointType !== undefined
    ? PI_TEXT_ENDPOINT_TYPE_SET.has(endpointType)
    : false;
}

export function hasConfiguredPiTextEndpoint(
  endpointConfigs: EndpointConfigs | null | undefined,
  endpointType: EndpointType | null | undefined,
): endpointType is PiTextEndpointType {
  return (
    isPiTextEndpointType(endpointType) && Boolean(endpointConfigs?.[endpointType]?.baseUrl?.trim())
  );
}

export function getRemovedPiTextEndpoints(
  currentEndpointConfigs: EndpointConfigs | null | undefined,
  nextEndpointConfigs: EndpointConfigs | null | undefined,
): PiTextEndpointType[] {
  return PI_TEXT_ENDPOINT_TYPES.filter(
    (endpointType) =>
      hasConfiguredPiTextEndpoint(currentEndpointConfigs, endpointType) &&
      !hasConfiguredPiTextEndpoint(nextEndpointConfigs, endpointType),
  );
}

export function assertCustomProviderEndpointConfiguration({
  defaultChatEndpoint,
  endpointConfigs,
}: {
  defaultChatEndpoint: EndpointType | null | undefined;
  endpointConfigs: EndpointConfigs | null | undefined;
}): void {
  if (!hasConfiguredPiTextEndpoint(endpointConfigs, defaultChatEndpoint)) {
    throw DataApiErrorFactory.validation(
      {
        defaultChatEndpoint: [
          'Custom providers require a Pi text default endpoint with a configured Base URL',
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

  // Unknown or non-Pi endpoint values are retained as opaque desktop-compatible
  // data. Only explicit Pi routing claims are constrained here.
  if (
    isPiTextEndpointType(endpointType) &&
    !hasConfiguredPiTextEndpoint(endpointConfigs, endpointType)
  ) {
    throw DataApiErrorFactory.validation(
      {
        endpointTypes: [`Endpoint ${endpointType} has no configured Base URL on this provider`],
      },
      'Model endpoint configuration is invalid',
    );
  }
}
