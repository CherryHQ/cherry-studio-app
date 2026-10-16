import { and, or, sql, type SQL } from 'drizzle-orm';

import { agentSessionMessageTable } from '@/backend/data/db/schemas';
import {
  conversationPathChain,
  conversationSelections,
  ROOT_CONVERSATION_PATH,
  type AgentConversationState,
  type AgentMessageView,
} from '@/shared/contracts/agent';

/** Apply before keyset pagination, so hidden continuations cannot enter a page. */
export function activeConversationCondition(
  state: AgentConversationState | null | undefined,
  aliased = false,
): SQL | undefined {
  if (!state) return undefined;
  const data = aliased ? sql`message.data` : sql`${agentSessionMessageTable.data}`;
  const createdAt = aliased ? sql`message.created_at` : sql`${agentSessionMessageTable.createdAt}`;
  const id = aliased ? sql`message.id` : sql`${agentSessionMessageTable.id}`;
  const segments: { id: string; through?: string }[] = [];
  for (const path of conversationPathChain(state)) {
    if (path.sourceMessageId) {
      const owner = segments.findIndex((segment) => segment.id === path.sourcePathId);
      if (owner < 0) throw new Error('The continuation source path is unavailable.');
      // A fork at an inherited ancestor drops all intervening suffix segments.
      segments.length = owner + 1;
      segments[owner].through = path.sourceMessageId;
    }
    segments.push({ id: path.id });
  }
  return or(
    ...segments.map((segment) =>
      and(
        sql`coalesce(json_extract(${data}, '$.pathId'), ${ROOT_CONVERSATION_PATH}) = ${segment.id}`,
        segment.through
          ? sql`(${createdAt}, ${id}) <= (
      SELECT anchor.created_at, anchor.id FROM agent_session_message AS anchor
      WHERE anchor.id = ${segment.through}
    )`
          : undefined,
      ),
    ),
  );
}

export function withConversationSelections(
  messages: AgentMessageView[],
  state: AgentConversationState | null | undefined,
): AgentMessageView[] {
  if (!state) return messages;
  const adopted = conversationSelections(state);
  return messages.map((message) => ({ ...message, selectedCandidateId: adopted[message.id] }));
}
