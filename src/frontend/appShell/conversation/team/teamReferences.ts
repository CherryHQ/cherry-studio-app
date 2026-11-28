import { TeamAgentError, type TeamSessionRef } from '@/shared/contracts/teamAgent';

export const teamSessionId = (ref: TeamSessionRef) => JSON.stringify([ref.agentId, ref.sessionId]);
export function teamSessionRef(value: string): TeamSessionRef {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed.every((part) => typeof part === 'string' && part.length > 0)
    )
      return { agentId: parsed[0], sessionId: parsed[1] };
  } catch {
    /* Closed reference format. */
  }
  throw new TeamAgentError('invalid-input');
}
