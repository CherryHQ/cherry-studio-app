import type { AgentMessageView } from '@/shared/contracts/agent';
import type {
  AgentSessionMessagePage,
  ListAgentSessionMessagesQueryParams,
} from '@/shared/data/api/schemas/agentSessionMessages';

import { isChatMessageExportable } from './toChatExportDocument';

/** Read the clicked answer and its own question, without opening a history selector. */
export async function loadChatExportMessages(
  messageId: string,
  readPage: (query: ListAgentSessionMessagesQueryParams) => Promise<AgentSessionMessagePage>,
  signal: AbortSignal,
): Promise<AgentMessageView[]> {
  signal.throwIfAborted();
  const page = await readPage({ aroundMessageId: messageId, limit: 200 });
  signal.throwIfAborted();
  const answer = page.items.find((message) => message.id === messageId);
  if (!answer || answer.role !== 'assistant') throw new Error('Message unavailable');
  if (!isChatMessageExportable(answer)) throw new Error('Message is not settled');
  if (!answer.turnId) return [answer];
  const question = page.items.find(
    (message) => message.role === 'user' && message.turnId === answer.turnId,
  );
  if (!question || !isChatMessageExportable(question)) throw new Error('Question unavailable');
  return [question, answer];
}
