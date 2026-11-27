import type { AgentSummary, ConversationSummary } from '@/frontend/appShell/conversation';

function sessionTimestamp(session: ConversationSummary): number | undefined {
  const raw = session.updatedAt ?? session.createdAt;
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function mergeCatalogAgents(
  local: readonly AgentSummary[],
  team: readonly AgentSummary[],
): AgentSummary[] {
  return [...local, ...team];
}

export function mergeCatalogSessions(
  local: readonly ConversationSummary[],
  team: readonly ConversationSummary[],
): ConversationSummary[] {
  const tagged = [
    ...local.map((session, index) => ({
      session,
      order: 0,
      index,
      timestamp: sessionTimestamp(session),
    })),
    ...team.map((session, index) => ({
      session,
      order: 1,
      index,
      timestamp: sessionTimestamp(session),
    })),
  ];

  return tagged
    .sort((left, right) => {
      if (left.timestamp !== undefined && right.timestamp !== undefined) {
        if (left.timestamp !== right.timestamp) return right.timestamp - left.timestamp;
        return left.order !== right.order ? left.order - right.order : left.index - left.index;
      }
      if (left.timestamp !== undefined) return -1;
      if (right.timestamp !== undefined) return 1;
      return left.order !== right.order ? left.order - right.order : left.index - left.index;
    })
    .map(({ session }) => session);
}
