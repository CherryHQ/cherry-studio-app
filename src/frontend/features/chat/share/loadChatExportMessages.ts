import type { AgentMessageView } from '@/shared/contracts/agent';
import type {
  AgentSessionMessagePage,
  ListAgentSessionMessagesQueryParams,
} from '@/shared/data/api/schemas/agentSessionMessages';

import { isChatMessageExportable } from './toChatExportDocument';

export async function loadChatExportMessages(
  selectedIds: readonly string[],
  readPage: (query: ListAgentSessionMessagesQueryParams) => Promise<AgentSessionMessagePage>,
  signal: AbortSignal,
): Promise<AgentMessageView[]> {
  const selected = new Set(selectedIds);
  if (!selected.size || selected.size > 128) throw new Error('Invalid selection size');
  const found = new Map<string, AgentMessageView>();
  for (const id of selected) {
    signal.throwIfAborted();
    if (found.has(id)) continue;
    const page = await readPage({ aroundMessageId: id, limit: 200 });
    signal.throwIfAborted();
    for (const message of page.items) {
      if (selected.has(message.id)) {
        if (!isChatMessageExportable(message)) throw new Error('Message is not settled');
        found.set(message.id, message);
      }
    }
    if (!found.has(id)) throw new Error('Selected message unavailable');
  }
  return [...found.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? compare(a.id, b.id) : compare(a.createdAt, b.createdAt),
  );
}

export function initialChatExportSelection(
  messages: readonly AgentMessageView[],
  messageId: string,
): ReadonlySet<string> {
  const answer = messages.find((message) => message.id === messageId);
  if (!answer || !isChatMessageExportable(answer)) return new Set();
  const question = answer.turnId
    ? messages.find(
        (message) =>
          message.role === 'user' &&
          message.turnId === answer.turnId &&
          isChatMessageExportable(message),
      )
    : undefined;
  return new Set(question ? [question.id, answer.id] : [answer.id]);
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
