import type { ListAgentSessionsQueryParams } from '@/shared/data/api/schemas/agentSessions';

export const agentSessionQueryKeys = {
  all: () => ['/agent-sessions'] as const,
  detail: (sessionId: string) => [`/agent-sessions/${sessionId}`] as const,
  list: (params: ListAgentSessionsQueryParams = {}) => ['/agent-sessions', params] as const,
  messages: (sessionId: string) => [`/agent-sessions/${sessionId}/messages`] as const,
};
