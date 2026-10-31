import * as z from 'zod';

import { getSingleRouteParam } from '@/frontend/utils/routeParams';

const ChatRouteParamsSchema = z.strictObject({
  agentId: z.string().trim().min(1).optional(),
  composerHandoff: z.string().trim().min(1).optional(),
  selectionHandoff: z.string().trim().min(1).optional(),
  workspaceDraftId: z.uuid().optional(),
  sshDraftId: z.uuid().optional(),
  sessionId: z.string().trim().min(1).optional(),
  messageId: z.string().trim().min(1).optional(),
  messageRequestId: z.string().trim().min(1).optional(),
});

// Shared by every route entry that can open the chat surface.
export type ChatTarget =
  | {
      agentId: string;
      kind: 'draft';
      /** Seeds the composer from a handoff, such as an incoming system share. */
      composerHandoff?: string;
      /** Adds a preview selection to the mounted composer without replacing its draft. */
      selectionHandoff?: string;
      /** Identifies the unsent conversation's optional workspace selection. */
      workspaceDraftId?: string;
      sshDraftId?: string;
    }
  | {
      kind: 'session';
      sessionId: string;
      selectionHandoff?: string;
      messageId?: string;
      /** Distinguishes repeated selections of the same search result. */
      messageRequestId?: string;
    };

export type ChatRouteParamsInput = {
  agentId?: string | string[];
  composerHandoff?: string | string[];
  selectionHandoff?: string | string[];
  workspaceDraftId?: string | string[];
  sshDraftId?: string | string[];
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
        composerHandoff: undefined,
        selectionHandoff: target.selectionHandoff,
        workspaceDraftId: undefined,
        sshDraftId: undefined,
        sessionId: target.sessionId,
        messageId: target.messageId,
        messageRequestId: target.messageRequestId,
      }
    : {
        agentId: target.agentId,
        composerHandoff: target.composerHandoff,
        selectionHandoff: target.selectionHandoff,
        workspaceDraftId: target.workspaceDraftId,
        sshDraftId: target.sshDraftId,
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
    composerHandoff: getSingleRouteParam(input.composerHandoff),
    selectionHandoff: getSingleRouteParam(input.selectionHandoff),
    workspaceDraftId: getSingleRouteParam(input.workspaceDraftId),
    sshDraftId: getSingleRouteParam(input.sshDraftId),
    sessionId: getSingleRouteParam(input.sessionId),
    messageId: getSingleRouteParam(input.messageId),
    messageRequestId: getSingleRouteParam(input.messageRequestId),
  });

  if (!result.success) {
    return { status: 'invalid' };
  }

  const {
    agentId,
    composerHandoff,
    selectionHandoff,
    workspaceDraftId,
    sshDraftId,
    sessionId,
    messageId,
    messageRequestId,
  } = result.data;
  if (sessionId) {
    return {
      status: 'ready',
      target: {
        kind: 'session',
        sessionId,
        ...(selectionHandoff ? { selectionHandoff } : {}),
        ...(messageId ? { messageId, messageRequestId } : {}),
      },
    };
  }
  if (agentId) {
    return {
      status: 'ready',
      target: {
        agentId,
        kind: 'draft',
        ...(composerHandoff ? { composerHandoff } : {}),
        ...(selectionHandoff ? { selectionHandoff } : {}),
        ...(workspaceDraftId ? { workspaceDraftId } : {}),
        ...(sshDraftId ? { sshDraftId } : {}),
      },
    };
  }

  return { status: 'empty' };
}

/** A file preview carries only its source route identity, never draft text or file content. */
export function parseChatPreviewSource(source: string | undefined): ChatTarget | undefined {
  if (!source) return;
  try {
    const params = ChatRouteParamsSchema.parse(JSON.parse(source));
    const route = parseChatRoute(params);
    return route.status === 'ready' ? route.target : undefined;
  } catch {
    return undefined;
  }
}
