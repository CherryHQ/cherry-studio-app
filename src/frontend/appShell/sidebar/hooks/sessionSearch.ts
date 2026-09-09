import type { AppSearchPage } from '@/frontend/appShell/search';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { SessionMessageContentSearchItem } from '@/shared/data/api/schemas/search';
import type { ApiClient } from '@/shared/data/api/types';

export type SessionSearchResult =
  | { kind: 'session'; item: AgentSessionEntity }
  | { kind: 'message'; item: SessionMessageContentSearchItem };

/** The initial query loads both groups; each continuation advances only its own source. */
export async function searchSessions(
  apiClient: ApiClient,
  input: { query: string; cursor?: string; groupKey?: string; signal: AbortSignal },
  labels: { sessions: string; messages: string },
): Promise<AppSearchPage<SessionSearchResult>> {
  if (input.signal.aborted) return { groups: [] };
  const [sessions, messages] = await Promise.all([
    input.groupKey && input.groupKey !== 'sessions'
      ? undefined
      : apiClient.get('/agent-sessions', {
          query: { q: input.query, cursor: input.cursor, limit: 50 },
          signal: input.signal,
        }),
    input.groupKey && input.groupKey !== 'messages'
      ? undefined
      : apiClient.get('/search/contents', {
          query: { q: input.query, cursor: input.cursor, limit: 50 },
          signal: input.signal,
        }),
  ]);
  input.signal.throwIfAborted();
  return {
    groups: [
      ...(sessions
        ? [
            {
              key: 'sessions',
              title: labels.sessions,
              items: sessions.items.map((item) => ({ kind: 'session' as const, item })),
              nextCursor: sessions.nextCursor,
            },
          ]
        : []),
      ...(messages
        ? [
            {
              key: 'messages',
              title: labels.messages,
              items: messages.items.map((item) => ({ kind: 'message' as const, item })),
              nextCursor: messages.nextCursor,
            },
          ]
        : []),
    ],
  };
}
