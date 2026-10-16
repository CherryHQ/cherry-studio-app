import {
  AgentProtocolError,
  answerChoiceKey,
  conversationSelections,
  createConversationState,
  multiModelResultFromParts,
  visibleConversationMessages,
  type AgentConversationState,
  type AgentMessageView,
} from '@/shared/contracts/agent';

export type ChangeConversationPathInput = {
  sessionId: string;
} & (
  | { action: 'select'; messageId: string; candidateId: string }
  | { action: 'continue'; messageId: string; candidateId?: string }
  | { action: 'restore'; pathId: string }
);

/** The transcript is immutable here: only adoption and the active continuation change. */
export function changeConversationPath(
  stored: AgentConversationState | undefined,
  allMessages: AgentMessageView[],
  input: ChangeConversationPathInput,
  newPathId: string,
): AgentConversationState {
  const state = structuredClone(stored ?? createConversationState());
  if (input.action === 'restore') {
    if (!state.paths.some((path) => path.id === input.pathId)) unavailable();
    state.activePathId = input.pathId;
    visibleConversationMessages(allMessages, state);
    return state;
  }
  const messages = visibleConversationMessages(allMessages, state);
  const index = messages.findIndex((message) => message.id === input.messageId);
  const message = messages[index];
  if (
    !message ||
    message.role !== 'assistant' ||
    message.status === 'pending' ||
    message.status === 'streaming'
  )
    unavailable();
  const group = multiModelResultFromParts(message.parts);
  if (!group && message.status !== 'success') unavailable();
  const selections = conversationSelections(state);
  const candidateId = input.candidateId ?? selections[message.id];
  if (
    group &&
    !group.candidates.some(
      (candidate) => candidate.id === candidateId && candidate.status === 'completed',
    )
  )
    unavailable();
  if (!group && input.candidateId) unavailable();
  const key = answerChoiceKey(message.id, candidateId);
  const previous = selections[message.id];
  if (input.action === 'select' && previous === candidateId) return state;

  // Remember the original suffix before leaving it, including the root path.
  if (previous !== undefined || !group)
    state.choices[answerChoiceKey(message.id, previous)] = state.activePathId;
  if (input.action === 'select' && state.choices[key]) {
    state.activePathId = state.choices[key];
    visibleConversationMessages(allMessages, state);
    return state;
  }
  // With no suffix yet, adoption needs no separate continuation or Pi conversation.
  if (input.action === 'select' && previous === undefined && index === messages.length - 1) {
    const path = state.paths.find((entry) => entry.id === state.activePathId)!;
    path.adopted[message.id] = candidateId!;
    return state;
  }
  state.paths.push({
    id: newPathId,
    parentPathId: state.activePathId,
    sourceMessageId: message.id,
    sourcePathId: message.pathId ?? 'root',
    candidateId: candidateId ?? null,
    adopted: candidateId ? { [message.id]: candidateId } : {},
  });
  state.activePathId = newPathId;
  state.choices[key] = newPathId;
  return state;
}

function unavailable(): never {
  throw new AgentProtocolError({
    code: 'MESSAGE_NOT_FOUND',
    message: 'The selected answer or continuation is unavailable.',
    retryable: false,
  });
}
