import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/provider-registry';

/**
 * Mobile configuration vocabulary for the four standard hosted chat protocols.
 * Membership is not execution support: the bound Runtime owns that decision.
 */
export const CHAT_ENDPOINT_TYPES = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
] as const satisfies readonly EndpointType[];

export type ChatEndpointType = (typeof CHAT_ENDPOINT_TYPES)[number];

export function isChatEndpointType(
  endpointType: EndpointType | null | undefined,
): endpointType is ChatEndpointType {
  return CHAT_ENDPOINT_TYPES.some((candidate) => candidate === endpointType);
}
