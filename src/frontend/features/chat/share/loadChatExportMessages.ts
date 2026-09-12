import type { AgentMessageView } from '@/shared/contracts/agent';
import {
  DOCUMENT_EXPORT_MAX_SECTIONS,
  DocumentExportError,
} from '@/shared/contracts/documentExport';
import {
  AGENT_SESSION_MESSAGES_MAX_LIMIT,
  type AgentSessionMessagePage,
  type ListAgentSessionMessagesQueryParams,
} from '@/shared/data/api/schemas/agentSessionMessages';

import { isChatMessageExportable } from './toChatExportDocument';

export class ChatExportError extends Error {
  constructor(readonly code: 'empty' | 'unsettled' | 'missing') {
    super(`Chat export: ${code}`);
    this.name = 'ChatExportError';
  }
}

/** Resolve exactly the selected messages, independently of the visible history window. */
export async function loadChatExportMessages(
  messageIds: readonly string[],
  readPage: (query: ListAgentSessionMessagesQueryParams) => Promise<AgentSessionMessagePage>,
  signal: AbortSignal,
): Promise<AgentMessageView[]> {
  signal.throwIfAborted();
  const remaining = new Set(messageIds);
  if (!remaining.size) throw new ChatExportError('empty');
  if (remaining.size > DOCUMENT_EXPORT_MAX_SECTIONS) throw new DocumentExportError('size-limit');
  const messages: AgentMessageView[] = [];
  let cursor: string | undefined;
  do {
    signal.throwIfAborted();
    const page = await readPage({ cursor, limit: AGENT_SESSION_MESSAGES_MAX_LIMIT });
    signal.throwIfAborted();
    for (const message of page.items) {
      if (!remaining.has(message.id)) continue;
      if (message.role === 'system') throw new ChatExportError('missing');
      if (!isChatMessageExportable(message)) throw new ChatExportError('unsettled');
      messages.push(message);
      remaining.delete(message.id);
    }
    cursor = page.nextCursor;
  } while (cursor && remaining.size);
  if (remaining.size) throw new ChatExportError('missing');
  // Pages and their items are newest-first. Selection order never changes reading order.
  return messages.toReversed();
}
