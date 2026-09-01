import * as z from 'zod';

import { getSingleRouteParam } from '@/frontend/utils/routeParams';

// Shared by every route entry that can open the chat surface.
const ChatTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    agentId: z.string().trim().min(1),
    kind: z.literal('draft'),
  }),
  z.strictObject({
    agentId: z.string().trim().min(1),
    kind: z.literal('session'),
    sessionId: z.string().trim().min(1),
  }),
]);

const ChatRouteParamsSchema = z.strictObject({
  agentId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
});

export type ChatTarget = z.infer<typeof ChatTargetSchema>;

export type ChatRouteParamsInput = {
  agentId?: string | string[];
  sessionId?: string | string[];
};

export type ParsedChatRoute =
  | { status: 'empty' }
  | { sessionId: string; status: 'partial-session' }
  | { status: 'invalid' }
  | { status: 'ready'; target: ChatTarget };

export function chatRouteParams(target: ChatTarget) {
  return {
    agentId: target.agentId,
    sessionId: target.kind === 'session' ? target.sessionId : undefined,
  };
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
  if (agentId && sessionId) {
    return { status: 'ready', target: { agentId, kind: 'session', sessionId } };
  }
  if (agentId) {
    return { status: 'ready', target: { agentId, kind: 'draft' } };
  }
  if (sessionId) {
    return { sessionId, status: 'partial-session' };
  }

  return { status: 'empty' };
}

export function parseStoredChatTarget(value: string | null | undefined): ChatTarget | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const result = ChatTargetSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function serializeChatTarget(target: ChatTarget) {
  return JSON.stringify(target);
}
