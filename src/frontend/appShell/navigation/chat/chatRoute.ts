import * as z from 'zod';

import { getSingleRouteParam } from '@/frontend/utils/routeParams';

const ChatRouteParamsSchema = z.strictObject({
  agentId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  messageId: z.string().trim().min(1).optional(),
  messageRequestId: z.string().trim().min(1).optional(),
});

// Shared by every route entry that can open the chat surface.
export type ChatTarget =
  | { agentId: string; kind: 'draft' }
  | {
      kind: 'session';
      sessionId: string;
      messageId?: string;
      /** Distinguishes repeated selections of the same search result. */
      messageRequestId?: string;
    };

export type ChatRouteParamsInput = {
  agentId?: string | string[];
  sessionId?: string | string[];
  messageId?: string | string[];
  messageRequestId?: string | string[];
};

export type ParsedChatRoute =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'ready'; target: ChatTarget };

export function chatRouteParams(target: ChatTarget) {
  return target.kind === 'session'
    ? {
        agentId: undefined,
        sessionId: target.sessionId,
        messageId: target.messageId,
        messageRequestId: target.messageRequestId,
      }
    : {
        agentId: target.agentId,
        sessionId: undefined,
        messageId: undefined,
        messageRequestId: undefined,
      };
}

export function chatHref(target: ChatTarget) {
  return {
    params: chatRouteParams(target),
    pathname: '/' as const,
  };
}

/** Serializes complete chat identity for a return-to route parameter. */
export function chatReturnToHref(target: ChatTarget) {
  const [key, value] =
    target.kind === 'session' ? ['sessionId', target.sessionId] : ['agentId', target.agentId];
  return `/?${key}=${encodeURIComponent(value)}`;
}

export function parseChatRoute(input: ChatRouteParamsInput): ParsedChatRoute {
  const result = ChatRouteParamsSchema.safeParse({
    agentId: getSingleRouteParam(input.agentId),
    sessionId: getSingleRouteParam(input.sessionId),
    messageId: getSingleRouteParam(input.messageId),
    messageRequestId: getSingleRouteParam(input.messageRequestId),
  });

  if (!result.success) {
    return { status: 'invalid' };
  }

  const { agentId, sessionId, messageId, messageRequestId } = result.data;
  if (sessionId) {
    return {
      status: 'ready',
      target: {
        kind: 'session',
        sessionId,
        ...(messageId ? { messageId, messageRequestId } : {}),
      },
    };
  }
  if (agentId) {
    return { status: 'ready', target: { agentId, kind: 'draft' } };
  }

  return { status: 'empty' };
}
