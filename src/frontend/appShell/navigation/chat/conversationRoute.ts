import { useGlobalSearchParams, usePathname } from 'expo-router';

import type { ConversationRef, ConversationSourceRef } from '@/frontend/appShell/conversation';

import { chatHref, parseChatRoute } from './chatRoute';
import {
  remoteChatHref,
  parseRemoteChatRoute,
  type RemoteChatRouteParams,
} from './remoteChatRoute';
import { parseTeamChatRoute, teamChatHref, type TeamChatRouteParams } from './teamChatRoute';

/** Route encoding is confined to navigation; consumers hold source-independent addresses. */
export function conversationHref(ref: ConversationRef) {
  if (ref.source.kind === 'team')
    return teamChatHref({ bindingId: ref.source.bindingId, sessionId: ref.sessionId });
  return ref.source.kind === 'local'
    ? chatHref({ kind: 'session', sessionId: ref.sessionId })
    : remoteChatHref({ connectionId: ref.source.connectionId, sessionId: ref.sessionId });
}
/** Navigation is the only presentation boundary that encodes conversation routes. */
export function useConversationTarget(source: ConversationSourceRef) {
  const params = useGlobalSearchParams<RemoteChatRouteParams & TeamChatRouteParams>();
  const pathname = usePathname();
  const local = parseChatRoute(params);
  const remote = parseRemoteChatRoute(params);
  const team = parseTeamChatRoute(params);
  const target =
    source.kind === 'local'
      ? pathname === '/' && local.status === 'ready'
        ? local.target
        : undefined
      : source.kind === 'team'
        ? pathname === '/team' && team.bindingId === source.bindingId
          ? team
          : undefined
        : pathname === '/remote' && remote.connectionId === source.connectionId
          ? remote
          : undefined;
  return {
    sessionId: target && 'sessionId' in target ? target.sessionId : undefined,
    agentId: target && 'agentId' in target ? target.agentId : undefined,
  };
}
