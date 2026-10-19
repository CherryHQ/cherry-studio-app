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

/** Each question's answers as last read, carried over from the previous reading. */
export function readQuestionAnswers(
  history: readonly AgentMessageView[],
  previous: ReadonlyMap<string, readonly AgentMessageSibling[]> = new Map(),
): ReadonlyMap<string, readonly AgentMessageSibling[]> {
  const byQuestion = new Map(previous);
  for (const message of history)
    if (message.role === 'assistant' && message.parentId && message.siblings)
      byQuestion.set(message.parentId, message.siblings);
  return byQuestion;
}

/**
 * Answers stream before their persisted rows carry `siblings`, and settled history omits a
 * question's whole turn while one of its answers runs. A running answer's alternatives are the
 * answers last read for its question plus the live answers sharing it. Returns the same objects
 * when nothing changes, so row projections stay cached.
 */
export function withLiveSiblings(
  messages: readonly AgentMessageView[],
  live: readonly AgentMessageView[],
  readAnswers: ReadonlyMap<string, readonly AgentMessageSibling[]>,
): readonly AgentMessageView[] {
  const answers = new Map<string, AgentMessageView[]>();
  for (const message of live)
    if (message.role === 'assistant' && message.parentId) {
      const list = answers.get(message.parentId) ?? [];
      list.push(message);
      answers.set(message.parentId, list);
    }
  if (answers.size === 0) return messages;
  let changed = false;
  const next = messages.map((message) => {
    const group = message.parentId ? answers.get(message.parentId) : undefined;
    if (!group?.some((answer) => answer.id === message.id)) return message;
    const siblings = new Map(
      (message.siblings ?? readAnswers.get(message.parentId!) ?? []).map((sibling) => [
        sibling.id,
        sibling,
      ]),
    );
    for (const answer of group)
      siblings.set(answer.id, {
        id: answer.id,
        modelId: answer.modelId,
        status: answer.status,
        // Live answers sharing a question were reserved as one multi-model group.
        siblingsGroupId: siblings.get(answer.id)?.siblingsGroupId ?? (group.length > 1 ? 1 : 0),
      } satisfies AgentMessageSibling);
    if (siblings.size < 2) return message;
    changed = true;
    return { ...message, siblings: [...siblings.values()] };
  });
  return changed ? next : messages;
}
