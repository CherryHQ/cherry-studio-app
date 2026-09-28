import type { ConversationOperation } from '@/frontend/appShell/conversation/remote';

/** Only uncertain outcomes need a card: not the in-flight submission, nor a start about to hand off. */
export function visibleRemoteOperations(
  starts: readonly ConversationOperation[],
  commands: readonly ConversationOperation[],
  context: { sessionId?: string; draftId?: string; submitting: boolean },
): ConversationOperation[] {
  return [
    ...starts.filter(
      (operation) =>
        (!context.sessionId || operation.conversation?.sessionId === context.sessionId) &&
        !(operation.draftId === context.draftId && operation.state === 'applied'),
    ),
    ...commands,
  ].filter((operation) => !(context.submitting && operation.state === 'pending'));
}
