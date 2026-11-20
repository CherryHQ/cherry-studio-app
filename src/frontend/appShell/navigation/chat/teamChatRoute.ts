import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export type TeamChatTarget = { bindingId?: string; agentId?: string; sessionId?: string };
export type TeamChatRouteParams = { [Key in keyof TeamChatTarget]?: string | string[] };
export function parseTeamChatRoute(params: TeamChatRouteParams): TeamChatTarget {
  return {
    bindingId: getSingleRouteParam(params.bindingId),
    agentId: getSingleRouteParam(params.agentId),
    sessionId: getSingleRouteParam(params.sessionId),
  };
}
export const teamChatHref = (target: TeamChatTarget) => ({
  pathname: '/team' as const,
  params: target,
});
