import { v7 as uuidv7 } from 'uuid';

import type { AgentMessageView, AgentProtocol, AgentSessionView } from '@/shared/contracts/agent';
import type { ApiClient } from '@/shared/data/api/types';

import type {
  Availability,
  ConversationAction,
  ConversationInput,
  ConversationInteraction,
  ConversationInteractionResponse,
  ConversationMessage,
  ConversationOperation,
  ConversationRef,
  ConversationSession,
  ConversationSnapshot,
  ExecutionRef,
  HistoryVersion,
  InteractionRef,
  MessageRef,
  OperationOutcome,
  QueryScope,
  ResourceRef,
  ResourceValue,
  Submission,
} from '../contracts';
import {
  createConversationReferences,
  createConversationState,
  ConversationReadError,
} from '../conversationState';
import {
  createAgentMessageListProjectionCache,
  toAgentMessageListItem,
} from './agentMessageProjection';
import { AgentSessionChatClient, isAgentSessionBusy } from './AgentSessionChatClient';
import { localConversationFailure } from './localConversationFailure';
import { localConversationHistory } from './localConversationHistory';
import { localImageResult } from './localImageResult';

export const LOCAL_INPUT_POLICY = {
  attachments: true,
  pluginReferences: true,
  modelSelection: true,
} as const;

export function createLocalConversationSession(input: {
  ref: ConversationRef;
  scope: QueryScope;
  session: AgentSessionView;
  api: ApiClient;
  agent: AgentProtocol;
  client: AgentSessionChatClient;
  assertSource(): void;
  onDispose(): void;
  onSessionChanged?: (sessionId: string) => void;
}) {
  const { ref, scope, client, agent } = input;
  const { sessionId } = ref;
  const refs = createConversationReferences(scope, sessionId);
  const cache = createAgentMessageListProjectionCache();
  const operations = createConversationState<readonly ConversationOperation[]>([]);
  const resources = new Map<ResourceRef, ResourceValue>();
  const approvalResources = new Map<string, { input: string; turnId: string; ref: ResourceRef }>();
  let questionBinding: { key: string; ref: ResourceRef } | undefined;
  const pendingKinds = new Set<ConversationOperation['kind']>();
  let disposed = false;
  let observers = 0;
  let unsubscribe: (() => void) | undefined;
  let historyVersion = '0' as HistoryVersion;
  let revision = 0;
  let knownSession = input.session;
  const assertCurrent = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    input.assertSource();
    if (disposed) throw new ConversationReadError({ code: 'retired', retry: 'none' });
  };
  const availability = (
    requiresIdle: boolean,
    kind?: ConversationOperation['kind'],
  ): Availability => {
    if (kind && pendingKinds.has(kind)) return { state: 'disabled', reason: 'busy' };
    if (disposed) return { state: 'disabled', reason: 'retired' };
    const live = client.getState(sessionId);
    if (requiresIdle && isAgentSessionBusy(live)) return { state: 'disabled', reason: 'busy' };
    if (live.status === 'error') return { state: 'disabled', reason: 'synchronizing' };
    return { state: 'enabled' };
  };
  function action<Input, Output>(
    kind: ConversationOperation['kind'],
    run: (value: Input) => Promise<Output>,
    requiresIdle = true,
  ): ConversationAction<Input, Output> {
    return {
      availability: availability(requiresIdle, kind),
      execute: async (value): Promise<OperationOutcome<Output>> => {
        try {
          assertCurrent();
          if (availability(requiresIdle, kind).state === 'disabled')
            return { state: 'rejected', failure: { code: 'conflict', retry: 'read-again' } };
        } catch (error) {
          return { state: 'rejected', failure: localConversationFailure(error) };
        }
        const id = refs.issue<ConversationOperation['id']>('operation', uuidv7());
        const operation: ConversationOperation = { id, kind, state: 'pending', conversation: ref };
        pendingKinds.add(kind);
        operations.set([...operations.getSnapshot(), operation]);
        publish();
        try {
          const result = await run(value);
          operations.set(
            operations.getSnapshot().map((op) => (op.id === id ? { ...op, state: 'applied' } : op)),
          );
          return { state: 'applied', value: result };
        } catch (error) {
          const failure = localConversationFailure(error);
          operations.set(
            operations
              .getSnapshot()
              .map((op) => (op.id === id ? { ...op, state: 'rejected', failure } : op)),
          );
          return { state: 'rejected', failure };
        } finally {
          pendingKinds.delete(kind);
          publish();
        }
      },
    };
  }
  const send = (value: ConversationInput) => {
    const userMessageId = uuidv7();
    return client
      .submitMessage({ ...value, sessionId, userMessageId, assistantMessageId: uuidv7() })
      .then(
        (result): Submission => ({
          conversation: ref,
          userMessage: refs.issue<MessageRef>('message', result.userMessageId),
          execution: refs.issue<ExecutionRef>('execution', result.turnId),
        }),
      );
  };
  const messageCache = new WeakMap<
    AgentMessageView,
    { availability: string; message: ConversationMessage }
  >();
  function project(message: AgentMessageView): ConversationMessage {
    const currentAvailability = JSON.stringify(availability(true));
    const previous = messageCache.get(message);
    if (previous?.availability === currentAvailability) return previous.message;
    const isSettled = message.status !== 'pending' && message.status !== 'streaming';
    const canModify = isSettled && message.role !== 'system';
    const projected: ConversationMessage = {
      ref: refs.issue<MessageRef>('message', message.id),
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
      actions: {
        ...(canModify && message.turnId
          ? { remove: action('delete', () => client.deleteTurn(sessionId, message.turnId!)) }
          : {}),
        ...(canModify && message.role === 'assistant'
          ? {
              retry: action('retry', async () => {
                await client.retryMessage({ sessionId, messageId: message.id });
                return { conversation: ref };
              }),
              fork: action('fork', async ({ title }: { title?: string }) => {
                const fork = await client.forkSession(sessionId, message.id, title);
                input.onSessionChanged?.(fork.id);
                return { source: ref.source, sessionId: fork.id };
              }),
            }
          : {}),
      },
    };
    messageCache.set(message, { availability: currentAvailability, message: projected });
    return projected;
  }
  function snapshot(): ConversationSnapshot {
    const live = client.getState(sessionId);
    knownSession = live.snapshot?.session ?? knownSession;
    const turn = live.activeTurn;
    const isBusy = isAgentSessionBusy(live);
    resources.clear();
    for (const id of approvalResources.keys())
      if (!live.pendingApprovals.some((approval) => approval.id === id))
        approvalResources.delete(id);
    const interactions: ConversationInteraction[] = live.pendingApprovals.map((approval) => {
      const inputKey = JSON.stringify(approval.input);
      let binding = approvalResources.get(approval.id);
      if (!binding || binding.input !== inputKey || binding.turnId !== approval.turnId) {
        binding = {
          input: inputKey,
          turnId: approval.turnId,
          ref: refs.issue<ResourceRef>('interaction-input', approval.id, uuidv7()),
        };
        approvalResources.set(approval.id, binding);
      }
      const resource = binding.ref;
      resources.set(resource, { kind: 'json', value: approval.input, complete: true });
      return {
        ref: refs.issue<InteractionRef>('interaction', approval.id, approval.turnId),
        execution: refs.issue<ExecutionRef>('execution', approval.turnId),
        kind: 'decision' as const,
        title: approval.displayName,
        state: 'pending' as const,
        input: resource,
        respond: action(
          'respond',
          async (decision: ConversationInteractionResponse) => {
            if (
              (decision.kind !== 'approve' && decision.kind !== 'deny') ||
              (decision.kind === 'deny' && decision.reason)
            )
              throw new ConversationReadError({ code: 'unsupported', retry: 'none' });
            const current = client
              .getState(sessionId)
              .pendingApprovals.find((candidate) => candidate.id === approval.id);
            if (
              !current ||
              current.turnId !== approval.turnId ||
              JSON.stringify(current.input) !== JSON.stringify(approval.input)
            )
              throw new ConversationReadError({ code: 'conflict', retry: 'read-again' });
            await client.respondApproval(sessionId, approval.id, decision.kind);
          },
          false,
        ),
      };
    });
    const question = live.pendingQuestion;
    if (question) {
      const key = JSON.stringify(question);
      if (questionBinding?.key !== key) {
        questionBinding = {
          key,
          ref: refs.issue<ResourceRef>('interaction-input', question.toolCallId, uuidv7()),
        };
      }
      resources.set(questionBinding.ref, { kind: 'user-question', question: question.question });
      interactions.push({
        ref: refs.issue<InteractionRef>('interaction', question.toolCallId, question.turnId),
        execution: refs.issue<ExecutionRef>('execution', question.turnId),
        kind: 'question',
        title: question.question.question,
        state: 'pending',
        input: questionBinding.ref,
        respond: action(
          'respond',
          async (response: ConversationInteractionResponse) => {
            if (response.kind !== 'user-answer')
              throw new ConversationReadError({ code: 'unsupported', retry: 'none' });
            if (JSON.stringify(client.getState(sessionId).pendingQuestion) !== key)
              throw new ConversationReadError({ code: 'conflict', retry: 'read-again' });
            await client.respondQuestion(sessionId, question.toolCallId, response.answer);
          },
          false,
        ),
      });
    } else {
      questionBinding = undefined;
    }
    return {
      title: knownSession.title,
      freshness: disposed
        ? { state: 'retired' }
        : live.status === 'error'
          ? { state: 'unavailable', failure: localConversationFailure(live.error) }
          : live.status === 'ready'
            ? { state: 'current' }
            : { state: 'loading' },
      historyVersion,
      liveMessages: live.liveMessages.map(project),
      interactions,
      executions: turn
        ? [
            {
              ref: refs.issue<ExecutionRef>('execution', turn.id),
              state: turn.status === 'cancelling' ? 'finalizing' : turn.status,
              ...(isBusy
                ? {
                    cancel: action(
                      'cancel',
                      async () => {
                        if (client.getState(sessionId).activeTurn?.id !== turn.id)
                          throw new ConversationReadError({
                            code: 'conflict',
                            retry: 'read-again',
                          });
                        await agent.cancelTurn({ sessionId, turnId: turn.id });
                      },
                      false,
                    ),
                  }
                : {}),
            },
          ]
        : [],
      actions: {
        inputPolicy: LOCAL_INPUT_POLICY,
        send: action('send', send),
        rename: action(
          'rename',
          async ({ title }: { title: string }) => {
            knownSession = await agent.renameSession({ sessionId, title });
            input.onSessionChanged?.(sessionId);
            publish();
          },
          false,
        ),
        remove: action('delete', async () => {
          await agent.deleteSession({ sessionId });
          input.onSessionChanged?.(sessionId);
        }),
      },
      enteringMessageKey: live.enteringUserMessageId,
      retryingMessageKey: live.retryingMessageId,
      hasHistoryBeforeExecution: live.hasHistoryBeforeActiveTurn,
      ...(knownSession.forkBoundaryMessageId && knownSession.forkedFromSessionId
        ? {
            fork: {
              boundaryMessageKey: knownSession.forkBoundaryMessageId,
              source: { source: ref.source, sessionId: knownSession.forkedFromSessionId },
            },
          }
        : {}),
    };
  }
  const state = createConversationState(snapshot());
  function publish() {
    if (!disposed) state.set(snapshot());
  }
  const handle: ConversationSession = {
    ref,
    scope,
    state,
    operations,
    history: localConversationHistory({
      ...input,
      sessionId,
      assertCurrent,
      project,
      reconcile: (messages) => client.reconcilePersistedMessages(sessionId, messages),
    }),
    resources: {
      read: async (resource, signal) => {
        assertCurrent(signal);
        refs.resolve(resource, 'interaction-input');
        const value = resources.get(resource);
        if (value === undefined)
          throw new ConversationReadError({ code: 'resource-unavailable', retry: 'read-again' });
        return value;
      },
      materializer: () => undefined,
    },
    activate: () => {
      assertCurrent();
      observers++;
      if (observers === 1) unsubscribe = client.subscribe(sessionId, publish);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--observers === 0) {
          unsubscribe?.();
          unsubscribe = undefined;
        }
      };
    },
    refresh: async (signal) => {
      assertCurrent(signal);
      await client.refresh(sessionId);
      assertCurrent(signal);
      publish();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      state.set({
        ...state.getSnapshot(),
        freshness: { state: 'retired' },
        actions: { inputPolicy: LOCAL_INPUT_POLICY },
      });
      resources.clear();
      approvalResources.clear();
      questionBinding = undefined;
      input.onDispose();
    },
  };
  return {
    handle,
    changed: (history: boolean) => {
      if (history) historyVersion = String(++revision) as HistoryVersion;
      publish();
    },
  };
}
