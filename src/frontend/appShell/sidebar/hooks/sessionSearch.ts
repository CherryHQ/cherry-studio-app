import type { AppSearchPage } from '@/frontend/appShell/search';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { SessionMessageContentSearchItem } from '@/shared/data/api/schemas/search';
import type { ApiClient } from '@/shared/data/api/types';

export type SessionSearchResult =
  | { kind: 'session'; item: AgentSessionEntity }
  | { kind: 'message'; item: SessionMessageContentSearchItem };

type SessionSearchCursor = { sessions: string | null; messages: string | null };

/** Each result group advances independently so neither is capped at its first page. */
export async function searchSessions(
  apiClient: ApiClient,
  input: { query: string; cursor?: string; signal: AbortSignal },
  labels: { sessions: string; messages: string },
): Promise<AppSearchPage<SessionSearchResult>> {
  const cursor = input.cursor ? (JSON.parse(input.cursor) as SessionSearchCursor) : undefined;
  if (input.signal.aborted) return { groups: [] };
  const [sessions, messages] = await Promise.all([
    cursor?.sessions === null
      ? undefined
      : apiClient.get('/agent-sessions', {
          query: { q: input.query, cursor: cursor?.sessions, limit: 50 },
        }),
    cursor?.messages === null
      ? undefined
      : apiClient.get('/search/contents', {
          query: { q: input.query, cursor: cursor?.messages, limit: 50 },
        }),
  ]);
  const nextCursor: SessionSearchCursor = {
    sessions: sessions?.nextCursor ?? null,
    messages: messages?.nextCursor ?? null,
  };
  return {
    groups: [
      {
        key: 'sessions',
        title: labels.sessions,
        items: (sessions?.items ?? []).map((item) => ({ kind: 'session' as const, item })),
      },
      {
        key: 'messages',
        title: labels.messages,
        items: (messages?.items ?? []).map((item) => ({ kind: 'message' as const, item })),
      },
    ].filter((group) => group.items.length > 0),
    nextCursor: nextCursor.sessions || nextCursor.messages ? JSON.stringify(nextCursor) : undefined,
  };
}
