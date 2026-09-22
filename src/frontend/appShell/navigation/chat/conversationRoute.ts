import type { ConversationRef } from '@/frontend/appShell/conversation';

import { chatHref } from './chatRoute';
import { remoteChatHref } from './remoteChatRoute';

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
