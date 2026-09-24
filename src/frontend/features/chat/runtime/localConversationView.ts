import {
  type ConversationAction,
  type ConversationInteraction,
  type ConversationInteractionResponse,
  type ConversationMessage,
  type ConversationRef,
  type ConversationSnapshot,
  type OperationOutcome,
  ConversationReadError,
  localConversationFailure,
} from '@/frontend/appShell/conversation';
import type { AgentMessageView } from '@/shared/contracts/agent';

import {
  type AgentMessageListProjectionCache,
  createAgentMessageListProjectionCache,
  toAgentMessageListItem,
} from './agentMessageProjection';
import {
  type AgentSessionChatClient,
  type AgentSessionChatState,
  isAgentSessionBusy,
} from './AgentSessionChatClient';
import { localImageResult } from './localImageResult';

export const LOCAL_CONVERSATION_SOURCE = { kind: 'local' } as const;

/** Rows shown without a Session client, such as the share selector; they carry no actions. */
export function projectLocalTranscriptMessage(
  message: AgentMessageView,
  cache?: AgentMessageListProjectionCache,
): ConversationMessage {
  return {
    key: message.id,
    state: message.status,
    completeness: 'complete',
    display: toAgentMessageListItem(message, cache) ?? {
      id: message.id,
      role: message.role,
      status: 'success',
      data: {},
      createdAt: message.createdAt,
    },
    imageResult: localImageResult(message),
    actions: {},
  };
}

/**
 * Projects one local Session's client state into the shared read model. Local execution settles
 * in-process, so every action resolves to applied or rejected; the client remains the only owner
 * of observation and admission.
 */
export function createLocalConversationProjector(input: {
  client: Pick<
    AgentSessionChatClient,
    | 'getState'
    | 'cancelTurn'
    | 'respondApproval'
    | 'respondQuestion'
    | 'retryMessage'
    | 'forkSession'
    | 'deleteTurn'
  >;
  sessionId: string;
  onSessionChanged?: (sessionId: string) => void;
}) {
  const { client, sessionId } = input;
  const cache = createAgentMessageListProjectionCache();
  const messages = new WeakMap<AgentMessageView, { busy: boolean; message: ConversationMessage }>();
  const outcome = async <T>(run: () => Promise<T>): Promise<OperationOutcome<T>> => {
    try {
      return { state: 'applied', value: await run() };
    } catch (error) {
      return { state: 'rejected', failure: localConversationFailure(error) };
    }
  };
  function action<Input, Output>(
    state: AgentSessionChatState,
    requiresIdle: boolean,
    run: (value: Input) => Promise<Output>,
  ): ConversationAction<Input, Output> {
    const availability: ConversationAction<Input, Output>['availability'] =
      requiresIdle && isAgentSessionBusy(state)
        ? { state: 'disabled', reason: 'busy' }
        : state.status === 'error'
          ? { state: 'disabled', reason: 'synchronizing' }
          : { state: 'enabled' };
    return {
      availability,
      execute: (value) => {
        const current = client.getState(sessionId);
        if (requiresIdle && isAgentSessionBusy(current))
          return Promise.resolve({
            state: 'rejected',
            failure: { code: 'conflict', retry: 'read-again' },
          });
        return outcome(() => run(value));
      },
    };
  }
  return {
    message(message: AgentMessageView, state: AgentSessionChatState): ConversationMessage {
      const busy = isAgentSessionBusy(state) || state.status === 'error';
      const cached = messages.get(message);
      if (cached && cached.busy === busy) return cached.message;
      const isSettled = message.status !== 'pending' && message.status !== 'streaming';
      const canModify = isSettled && message.role !== 'system';
      const projected: ConversationMessage = {
        ...projectLocalTranscriptMessage(message, cache),
        actions: {
          ...(canModify && message.turnId
            ? {
                remove: action<void, void>(state, true, () =>
                  client.deleteTurn(sessionId, message.turnId!),
                ),
              }
            : {}),
          ...(canModify && message.role === 'assistant'
            ? {
                retry: action<void, void>(state, true, () =>
                  client.retryMessage({ sessionId, messageId: message.id }),
                ),
                fork: action<{ title?: string }, ConversationRef>(
                  state,
                  true,
                  async ({ title }) => {
                    const fork = await client.forkSession(sessionId, message.id, title);
                    input.onSessionChanged?.(fork.id);
                    return { source: LOCAL_CONVERSATION_SOURCE, sessionId: fork.id };
                  },
                ),
              }
            : {}),
        },
      };
      messages.set(message, { busy, message: projected });
      return projected;
    },
    snapshot(state: AgentSessionChatState, title: string | undefined): ConversationSnapshot {
      const turn = state.activeTurn;
      const interactions: ConversationInteraction[] = state.pendingApprovals.map((approval) => {
        const inputKey = JSON.stringify(approval.input);
        return {
          id: approval.id,
          execution: approval.turnId,
          kind: 'decision',
          title: approval.displayName,
          state: 'pending',
          input: { kind: 'inline', value: { kind: 'json', value: approval.input, complete: true } },
          respond: action<ConversationInteractionResponse, void>(state, false, async (decision) => {
            if (
              (decision.kind !== 'approve' && decision.kind !== 'deny') ||
              (decision.kind === 'deny' && decision.reason)
            )
              throw new ConversationReadError({ code: 'unsupported', retry: 'none' });
            // A replaced payload under the same id is a different decision.
            const current = client
              .getState(sessionId)
              .pendingApprovals.find((candidate) => candidate.id === approval.id);
            if (
              !current ||
              current.turnId !== approval.turnId ||
              JSON.stringify(current.input) !== inputKey
            )
              throw new ConversationReadError({ code: 'conflict', retry: 'read-again' });
            await client.respondApproval(sessionId, approval.id, decision.kind);
          }),
        };
      });
      const question = state.pendingQuestion;
      if (question) {
        const key = JSON.stringify(question);
        interactions.push({
          id: question.toolCallId,
          execution: question.turnId,
          kind: 'question',
          title: question.question.question,
          state: 'pending',
          input: { kind: 'inline', value: { kind: 'user-question', question: question.question } },
          respond: action<ConversationInteractionResponse, void>(state, false, async (response) => {
            if (response.kind !== 'user-answer')
              throw new ConversationReadError({ code: 'unsupported', retry: 'none' });
            if (JSON.stringify(client.getState(sessionId).pendingQuestion) !== key)
              throw new ConversationReadError({ code: 'conflict', retry: 'read-again' });
            await client.respondQuestion(sessionId, question.toolCallId, response.answer);
          }),
        });
      }
      return {
        agentId: state.snapshot?.agent.id,
        title: state.snapshot?.session.title ?? title ?? '',
        freshness:
          state.status === 'error'
            ? { state: 'unavailable', failure: localConversationFailure(state.error) }
            : state.status === 'ready'
              ? { state: 'current' }
              : { state: 'loading' },
        liveMessages: state.liveMessages.map((message) => this.message(message, state)),
        interactions,
        executions: turn
          ? [
              {
                id: turn.id,
                state: turn.status === 'cancelling' ? 'finalizing' : turn.status,
                ...(isAgentSessionBusy(state)
                  ? {
                      cancel: action<void, void>(state, false, async () => {
                        if (client.getState(sessionId).activeTurn?.id !== turn.id)
                          throw new ConversationReadError({
                            code: 'conflict',
                            retry: 'read-again',
                          });
                        await client.cancelTurn(sessionId);
                      }),
                    }
                  : {}),
              },
            ]
          : [],
        enteringMessageKey: state.enteringUserMessageId,
        retryingMessageKey: state.retryingMessageId,
        hasHistoryBeforeExecution: state.hasHistoryBeforeActiveTurn,
      };
    },
  };
}
