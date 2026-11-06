import type { useApiClient } from '@/frontend/data';
import type { AgentMessageView } from '@/shared/contracts/agent';

type QuoteSourceStateReader = {
  getState(sessionId: string): { liveMessages: readonly AgentMessageView[] };
};

/** A durable row can lag a completed live sibling while another answer still runs. */
export function completeChatQuoteSource(
  source: AgentMessageView | undefined,
  client: QuoteSourceStateReader,
  sessionId: string,
): AgentMessageView | undefined {
  if (!source || source.sessionId !== sessionId) return undefined;
  if (source.status !== 'pending' && source.status !== 'streaming') return source;
  const live = client
    .getState(sessionId)
    .liveMessages.find((message) => message.id === source.id && message.sessionId === sessionId);
  return live?.status === 'success' ? live : source;
}

export async function readChatQuoteSource(
  api: ReturnType<typeof useApiClient>,
  client: QuoteSourceStateReader,
  sessionId: string,
  messageId: string,
  signal?: AbortSignal,
): Promise<AgentMessageView | undefined> {
  const page = await api.get(`/agent-sessions/${sessionId}/messages`, {
    query: { ids: [messageId] },
    signal,
  });
  return completeChatQuoteSource(
    page.items.find((item) => item.id === messageId),
    client,
    sessionId,
  );
}
