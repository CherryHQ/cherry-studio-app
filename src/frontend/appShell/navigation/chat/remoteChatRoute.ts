import type { DesktopConversationDomain } from '@/frontend/appShell/conversation';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export type RemoteChatTarget = {
  /** Omitted only by legacy Agent links. */
  domain?: DesktopConversationDomain;
  connectionId?: string;
  agentId?: string;
  sessionId?: string;
  draftId?: string;
};

export type RemoteChatRouteParams = {
  [Key in keyof RemoteChatTarget]?: string | string[];
};

export function parseRemoteChatRoute(params: RemoteChatRouteParams): RemoteChatTarget | undefined {
  const domain = getSingleRouteParam(params.domain) ?? 'agent';
  if (domain !== 'agent' && domain !== 'assistant') return undefined;
  return {
    domain,
    connectionId: getSingleRouteParam(params.connectionId),
    agentId: getSingleRouteParam(params.agentId),
    sessionId: getSingleRouteParam(params.sessionId),
    draftId: getSingleRouteParam(params.draftId),
  };
}

export function remoteChatHref(target: RemoteChatTarget) {
  return { pathname: '/remote' as const, params: target };
}
