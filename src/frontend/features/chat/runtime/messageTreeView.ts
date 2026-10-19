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
 * The transcript keeps one child per message. Between selecting another answer and reading the
 * transcript again, history still holds the previous answer while live rows hold the selected
 * one; the child on the walk from the selected leaf wins, else the first, and rows below a
 * dropped child go with it. Returns `messages` itself when nothing is dropped.
 */
export function selectedBranchMessages(
  messages: readonly AgentMessageView[],
  activeNodeId: string | null | undefined,
): readonly AgentMessageView[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const chosen = new Map<string | null, string>();
  const walked = new Set<string>();
  let id = activeNodeId;
  while (id && byId.has(id) && !walked.has(id)) {
    walked.add(id);
    const message: AgentMessageView = byId.get(id)!;
    if (message.parentId === undefined) break;
    chosen.set(message.parentId, id);
    id = message.parentId;
  }
  const dropped = new Set<string>();
  const next = messages.filter((message) => {
    if (message.parentId === undefined) return true;
    const keep =
      !(message.parentId && dropped.has(message.parentId)) &&
      (chosen.get(message.parentId) ?? message.id) === message.id;
    if (keep) chosen.set(message.parentId, message.id);
    else dropped.add(message.id);
    return keep;
  });
  return dropped.size ? next : messages;
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

/** A message with its alternatives attached, kept while those alternatives read the same. */
export type LiveSiblingViews = WeakMap<AgentMessageView, AgentMessageView>;

/**
 * Answers stream before their persisted rows carry `siblings`, and settled history omits a
 * question's whole turn while one of its answers runs. A running answer's alternatives are the
 * answers last read for its question plus the live answers sharing it. Returns the same objects
 * when nothing changes, so row projections stay cached: another answer streaming text does not
 * change the alternatives of the one shown.
 */
export function withLiveSiblings(
  messages: readonly AgentMessageView[],
  live: readonly AgentMessageView[],
  readAnswers: ReadonlyMap<string, readonly AgentMessageSibling[]>,
  views: LiveSiblingViews = new WeakMap(),
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
    const list = [...siblings.values()];
    const previous = views.get(message);
    if (
      previous?.siblings?.length === list.length &&
      previous.siblings.every(
        (sibling, index) =>
          sibling.id === list[index]!.id &&
          sibling.status === list[index]!.status &&
          sibling.modelId === list[index]!.modelId &&
          sibling.siblingsGroupId === list[index]!.siblingsGroupId,
      )
    )
      return previous;
    const view = { ...message, siblings: list };
    views.set(message, view);
    return view;
  });
  return changed ? next : messages;
}
