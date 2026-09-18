import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export type RemoteChatTarget = {
  connectionId?: string;
  agentId?: string;
  sessionId?: string;
  draftId?: string;
};

export type RemoteChatRouteParams = {
  [Key in keyof RemoteChatTarget]?: string | string[];
};

export function parseRemoteChatRoute(params: RemoteChatRouteParams): RemoteChatTarget {
  return {
    connectionId: getSingleRouteParam(params.connectionId),
    agentId: getSingleRouteParam(params.agentId),
    sessionId: getSingleRouteParam(params.sessionId),
    draftId: getSingleRouteParam(params.draftId),
  };
}

export function remoteChatHref(target: RemoteChatTarget) {
  return { pathname: '/remote' as const, params: target };
}
