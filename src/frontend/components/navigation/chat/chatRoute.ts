import * as z from 'zod';

import { getSingleRouteParam } from '@/frontend/utils/routeParams';

const ChatRouteParamsSchema = z.strictObject({
  agentId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
});

// Shared by every route entry that can open the chat surface.
export type ChatTarget =
  | { agentId: string; kind: 'draft' }
  | { kind: 'session'; sessionId: string };

export type ChatRouteParamsInput = {
  agentId?: string | string[];
  sessionId?: string | string[];
};

export type ParsedChatRoute =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'ready'; target: ChatTarget };

export function chatRouteParams(target: ChatTarget) {
  return target.kind === 'session'
    ? { agentId: undefined, sessionId: target.sessionId }
    : { agentId: target.agentId, sessionId: undefined };
}

export function chatHref(target: ChatTarget) {
  return {
    params: chatRouteParams(target),
    pathname: '/' as const,
  };
}

export function parseChatRoute(input: ChatRouteParamsInput): ParsedChatRoute {
  const result = ChatRouteParamsSchema.safeParse({
    agentId: getSingleRouteParam(input.agentId),
    sessionId: getSingleRouteParam(input.sessionId),
  });

  if (!result.success) {
    return { status: 'invalid' };
  }

  const { agentId, sessionId } = result.data;
  if (sessionId) {
    return { status: 'ready', target: { kind: 'session', sessionId } };
  }
  if (agentId) {
    return { status: 'ready', target: { agentId, kind: 'draft' } };
  }

  return { status: 'empty' };
}
