import { useGlobalSearchParams, usePathname } from 'expo-router';

import type { ConversationRef, ConversationSourceRef } from '@/frontend/appShell/conversation';

import { chatHref, parseChatRoute } from './chatRoute';
import {
  remoteChatHref,
  parseRemoteChatRoute,
  type RemoteChatRouteParams,
} from './remoteChatRoute';

/** Route encoding is confined to navigation; consumers hold source-independent addresses. */
export function conversationHref(ref: ConversationRef) {
  return ref.source.kind === 'local'
    ? chatHref({ kind: 'session', sessionId: ref.sessionId })
    : remoteChatHref({ connectionId: ref.source.connectionId, sessionId: ref.sessionId });
}
export function conversationShareHref(ref: ConversationRef, messageId: string, scope?: string) {
  return {
    pathname: '/chat-share' as const,
    params: {
      sessionId: ref.sessionId,
      messageId,
      scope,
      ...(ref.source.kind === 'desktop' ? { connectionId: ref.source.connectionId } : {}),
    },
  };
}

export function conversationRefFromRoute(
  sessionId: string,
  connectionId?: string,
): ConversationRef {
  return {
    source: connectionId ? { kind: 'desktop', connectionId } : { kind: 'local' },
    sessionId,
  };
}

/** Navigation is the only presentation boundary that encodes local/desktop routes. */
export function useConversationTarget(source: ConversationSourceRef) {
  const params = useGlobalSearchParams<RemoteChatRouteParams>();
  const pathname = usePathname();
  const local = parseChatRoute(params);
  const remote = parseRemoteChatRoute(params);
  const target =
    source.kind === 'local'
      ? pathname === '/' && local.status === 'ready'
        ? local.target
        : undefined
      : pathname === '/remote' && remote.connectionId === source.connectionId
        ? remote
        : undefined;
  return {
    sessionId: target && 'sessionId' in target ? target.sessionId : undefined,
    agentId: target && 'agentId' in target ? target.agentId : undefined,
  };
}
