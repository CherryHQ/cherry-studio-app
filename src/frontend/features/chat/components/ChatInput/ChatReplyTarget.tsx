import { createContext, use, useCallback, useMemo, useState } from 'react';

import type { UniqueModelId } from '@/shared/data/types/model';

/**
 * What the next send answers with and where it continues. Composer-local: it
 * never changes the Agent's default model and is cleared after a send.
 */
export type ChatReplyTarget = Readonly<{
  /** Models answering the next question in order; null uses the composer's model. */
  models: readonly UniqueModelId[] | null;
  /** Answer the next question continues from; null continues the shown branch. */
  continueFromMessageId: string | null;
  /** The multi-select model sheet is open. */
  isChoosingModels: boolean;
}>;

type ChatReplyTargetActions = {
  /** Opens model selection for the next question, optionally continuing from an answer. */
  chooseModels(input?: { continueFromMessageId?: string }): void;
  setModels(models: readonly UniqueModelId[] | null): void;
  closeModelChoice(): void;
  clear(): void;
};

const EMPTY_TARGET: ChatReplyTarget = Object.freeze({
  models: null,
  continueFromMessageId: null,
  isChoosingModels: false,
});

const ChatReplyTargetContext = createContext<{
  target: ChatReplyTarget;
  actions: ChatReplyTargetActions;
} | null>(null);

/**
 * Owned by the chat screen, which also previews the history a continuation will
 * use. A different conversation starts without a target.
 */
export function useChatReplyTargetState(conversationKey: string | number) {
  const [state, setState] = useState({ conversationKey, target: EMPTY_TARGET });
  if (state.conversationKey !== conversationKey)
    setState({ conversationKey, target: EMPTY_TARGET });
  const target = state.conversationKey === conversationKey ? state.target : EMPTY_TARGET;
  const setTarget = useCallback(
    (update: (current: ChatReplyTarget) => ChatReplyTarget) =>
      setState((current) => ({ ...current, target: update(current.target) })),
    [],
  );
  const actions = useMemo<ChatReplyTargetActions>(
    () => ({
      chooseModels: ({ continueFromMessageId } = {}) =>
        setTarget((current) => ({
          ...current,
          ...(continueFromMessageId ? { continueFromMessageId } : {}),
          isChoosingModels: true,
        })),
      setModels: (models) =>
        setTarget((current) => ({
          ...current,
          models: models?.length ? models : null,
          isChoosingModels: false,
        })),
      // Cancelling the sheet for a continuation that has no model yet abandons it.
      closeModelChoice: () =>
        setTarget((current) =>
          current.models ? { ...current, isChoosingModels: false } : EMPTY_TARGET,
        ),
      clear: () => setTarget(() => EMPTY_TARGET),
    }),
    [setTarget],
  );
  return useMemo(() => ({ target, actions }), [actions, target]);
}

export const ChatReplyTargetProvider = ChatReplyTargetContext;

/** Absent outside a local chat screen, where replies always use the composer's model. */
export function useChatReplyTarget() {
  return use(ChatReplyTargetContext);
}
