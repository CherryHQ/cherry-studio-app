import type { AgentMessageSibling, AgentMessageView } from '@/shared/contracts/agent';

/**
 * Live rows on the selected branch. Persisted history is already the selected
 * branch; a live row is shown when the walk from the Session's selected leaf
 * reaches it before re-entering persisted history. Without a known or loaded
 * leaf every live row is shown, as before the message tree.
 */
export function selectedLiveMessages(
  live: readonly AgentMessageView[],
  persisted: readonly AgentMessageView[],
  activeNodeId: string | null | undefined,
): readonly AgentMessageView[] {
  if (!activeNodeId || live.length === 0) return live;
  const persistedIds = new Set(persisted.map((message) => message.id));
  const liveById = new Map(live.map((message) => [message.id, message]));
  // A queued answer is selected before it streams; until then the live rows are its ancestors.
  if (!liveById.has(activeNodeId) && !persistedIds.has(activeNodeId)) return live;
  const visible = new Set<string>();
  let id: string | null | undefined = activeNodeId;
  while (id && !persistedIds.has(id) && !visible.has(id)) {
    const message = liveById.get(id);
    if (!message) break;
    visible.add(id);
    id = message.parentId;
  }
  return live.filter((message) => persistedIds.has(message.id) || visible.has(message.id));
}

/**
 * Parallel answers stream before their persisted rows carry `siblings`: derive
 * them from the live answers that share a question. Returns the same objects
 * when nothing changes, so row projections stay cached.
 */
export function withLiveSiblings(
  messages: readonly AgentMessageView[],
  live: readonly AgentMessageView[],
): readonly AgentMessageView[] {
  const answers = new Map<string, AgentMessageView[]>();
  for (const message of live)
    if (message.role === 'assistant' && message.parentId) {
      const list = answers.get(message.parentId) ?? [];
      list.push(message);
      answers.set(message.parentId, list);
    }
  if (![...answers.values()].some((list) => list.length > 1)) return messages;
  return messages.map((message) => {
    const group = message.parentId ? answers.get(message.parentId) : undefined;
    if (!group || group.length < 2 || !group.some((answer) => answer.id === message.id))
      return message;
    const known = new Map((message.siblings ?? []).map((sibling) => [sibling.id, sibling]));
    for (const answer of group)
      known.set(answer.id, {
        id: answer.id,
        modelId: answer.modelId,
        status: answer.status,
        // Live answers sharing a question were reserved as one multi-model group.
        siblingsGroupId: known.get(answer.id)?.siblingsGroupId ?? 1,
      } satisfies AgentMessageSibling);
    return { ...message, siblings: [...known.values()] };
  });
}
