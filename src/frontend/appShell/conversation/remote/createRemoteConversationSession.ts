import type {
  RemoteAgentSource,
  RemoteCommand,
  RemoteSessionSnapshot,
  RemoteSessionView,
} from '@/shared/contracts/remoteAgent';

import type {
  ConversationAction,
  ConversationInteractionResponse,
  ConversationRef,
  OperationOutcome,
  QueryScope,
  ResourceRead,
} from '../contracts';
import {
  createConversationReferences,
  createConversationState,
  ConversationReadError,
} from '../conversationState';
import type {
  ConversationInput,
  ConversationOperation,
  HistoryCursor,
  HistoryVersion,
  OperationId,
  RemoteConversationSession,
  RemoteConversationSnapshot,
  Submission,
} from './remoteContracts';
import {
  remoteAvailability,
  remoteConversationFailure,
  remoteMessage,
  remoteTranscriptMessage,
} from './remoteConversationViews';

export const REMOTE_INPUT_POLICY = {
  attachments: false,
  pluginReferences: false,
  modelSelection: false,
  textLimit: { unit: 'utf16-units' as const, value: 32768 },
};
export function remoteInput(input: ConversationInput): string {
  if (
    input.modelId !== undefined ||
    input.reasoningEffort !== undefined ||
    input.imageGeneration !== undefined ||
    input.parts.some((part) => part.type !== 'text' || part.pluginReferences?.length)
  )
    throw new ConversationReadError({ code: 'unsupported', retry: 'revise-input' });
  const text = input.parts.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
  if (!text.trim() || text.length > 32768)
    throw new ConversationReadError({ code: 'invalid-input', retry: 'revise-input' });
  return text;
}
export function commandOutcome<T>(
  command: RemoteCommand,
  id: OperationId,
  value: T,
): OperationOutcome<T> {
  if (command.status === 'applied') return { state: 'applied', value };
  if (command.status === 'failed')
    return {
      state: 'rejected',
      failure: remoteConversationFailure({ code: command.error, detail: command.errorMessage }),
    };
  if (command.status === 'interrupted') return { state: 'interrupted', operationId: id };
  return { state: 'pending', operationId: id };
}
export function createRemoteConversationSession(
  source: RemoteAgentSource,
  ref: ConversationRef,
  initial: RemoteSessionView,
  assertSource: () => void,
  onDispose: () => void,
  bootstrapVerified = false,
): RemoteConversationSession {
  const scope = source.scope as QueryScope;
  const refs = createConversationReferences(scope, ref.sessionId);
  const lifetime = new AbortController();
  let disposed = false;
  let latest: RemoteSessionSnapshot | undefined;
  let session = initial;
  let bootstrap = bootstrapVerified ? initial : undefined;
  let historyEpoch = source.peekSession(ref.sessionId)?.epoch;
  let historyReset = 0;
  let sourceStatus = source.getState().status;
  let observers = 0;
  let unobserve: (() => void) | undefined;
  const windows = new Set<() => void>();
  const pending = new Set<string>();
  const assertCurrent = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    assertSource();
    if (disposed || source.getState().status === 'retired')
      throw new ConversationReadError({ code: 'retired', retry: 'none' });
  };
  const read = async <T>(
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    try {
      assertCurrent(signal);
      const result = await work(AbortSignal.any([signal, lifetime.signal]));
      assertCurrent(signal);
      return result;
    } catch (error) {
      throw error instanceof ConversationReadError
        ? error
        : new ConversationReadError(remoteConversationFailure(error));
    }
  };
  const resource = (value: string): ResourceRead => ({
    kind: 'deferred',
    key: refs.issue('resource', value),
    read: async (signal) => {
      const result = await read(signal, (signal) => source.readResource(value, signal));
      return result.kind === 'text' ? { ...result, complete: true } : result;
    },
  });
  const project = (message: Parameters<typeof remoteMessage>[0]) =>
    remoteMessage(message, resource);
  const operationId = (id: string) => refs.issue<OperationId>('operation', id);
  const operations = createConversationState<readonly ConversationOperation[]>([]);
  function updateOperations() {
    operations.set(
      source
        .getCommands()
        .filter((command) => command.sessionId === ref.sessionId && command.kind !== 'create')
        .map((command) => ({
          id: operationId(command.id),
          kind: command.kind === 'create' ? 'start' : command.kind,
          state:
            command.status === 'applied'
              ? 'applied'
              : command.status === 'failed'
                ? 'rejected'
                : command.status === 'interrupted'
                  ? 'interrupted'
                  : 'pending',
          conversation: ref,
          ...(command.text
            ? { input: { parts: [{ type: 'text' as const, text: command.text }] } }
            : {}),
          ...(command.error
            ? {
                failure: remoteConversationFailure({
                  code: command.error,
                  detail: command.errorMessage,
                }),
              }
            : {}),
          ...(!['confirming', 'accepted', 'queued'].includes(command.status)
            ? {
                dismiss: () => {
                  assertCurrent();
                  source.dismiss(command.id);
                },
              }
            : {}),
          recovery: {
            availability: remoteAvailability(source.getState(), disposed),
            execute: async () => {
              try {
                assertCurrent();
                await source.recover(command.id);
                const current = source.getCommands().find((item) => item.id === command.id);
                return current
                  ? commandOutcome(current, operationId(command.id), undefined)
                  : { state: 'rejected', failure: { code: 'not-found', retry: 'none' } };
              } catch (error) {
                return { state: 'rejected', failure: remoteConversationFailure(error) };
              }
            },
          },
        })),
    );
  }
  function action<Input, Output>(
    key: string,
    target: string | undefined,
    run: (target: string, input: Input) => Promise<RemoteCommand>,
    value: Output,
  ): ConversationAction<Input, Output> {
    const availability = remoteAvailability(source.getState(), disposed);
    return {
      availability:
        availability.state === 'disabled'
          ? availability
          : pending.has(key)
            ? { state: 'disabled', reason: 'busy' }
            : !latest?.current
              ? { state: 'disabled', reason: 'synchronizing' }
              : !target
                ? { state: 'disabled', reason: 'busy' }
                : availability,
      execute: async (input) => {
        try {
          assertCurrent();
          if (pending.has(key) || !target || !latest?.current)
            return { state: 'rejected', failure: { code: 'conflict', retry: 'read-again' } };
          pending.add(key);
          publish();
          const command = await run(target, input);
          return commandOutcome(command, operationId(command.id), value);
        } catch (error) {
          return {
            state: 'rejected',
            failure:
              error instanceof ConversationReadError
                ? error.failure
                : remoteConversationFailure(error),
          };
        } finally {
          pending.delete(key);
          if (!disposed) publish();
        }
      },
    };
  }
  function snapshot(): RemoteConversationSnapshot {
    const sourceState = source.getState();
    return {
      title: session.title,
      agentId: session.agentId,
      workspaceId: session.workspaceId,
      workspaceKind: session.workspaceKind,
      freshness:
        disposed || sourceState.status === 'retired'
          ? { state: 'retired' }
          : latest?.current && sourceState.status === 'ready'
            ? { state: 'current' }
            : latest || source.peekSession(ref.sessionId)?.history
              ? {
                  state: 'cached',
                  reason:
                    sourceState.status === 'offline' || sourceState.status === 'suspended'
                      ? sourceState.status
                      : 'refreshing',
                }
              : { state: 'loading' },
      historyVersion: refs.issue<HistoryVersion>(
        'history',
        historyReset ? `${session.historyVersion}:${historyReset}` : session.historyVersion,
      ),
      liveMessages: latest?.messages.map(project) ?? [],
      executions:
        latest?.executions.map((execution) => ({
          id: execution.id,
          state: execution.state,
          failure: execution.failure,
          persistenceFailure: execution.persistenceFailure,
          ...(execution.messageId && (execution.failure || execution.persistenceFailure)
            ? {
                terminal: {
                  message: project({
                    id: execution.messageId,
                    version: execution.history?.messageRevision ?? execution.id,
                    role: 'assistant',
                    parts: [],
                    state:
                      execution.state === 'failed'
                        ? 'error'
                        : execution.state === 'cancelled' || execution.state === 'interrupted'
                          ? 'cancelled'
                          : 'success',
                    failure: execution.failure,
                    persistenceFailure: execution.persistenceFailure,
                  }),
                  durable: execution.durable === true,
                  historyReady:
                    !!execution.history &&
                    BigInt(session.historyVersion) >= BigInt(execution.history.historyRevision),
                },
              }
            : {}),
          ...(['running', 'awaiting-approval', 'finalizing'].includes(execution.state)
            ? {
                cancel: action(
                  `cancel:${execution.id}`,
                  execution.cancelTarget,
                  (target) => source.cancel(target),
                  undefined,
                ),
              }
            : {}),
        })) ?? [],
      interactions:
        latest?.interactions.map((interaction) => ({
          id: interaction.id,
          ...(interaction.executionId ? { execution: interaction.executionId } : {}),
          kind: interaction.kind ?? 'decision',
          title: interaction.title,
          state: interaction.state,
          input: resource(interaction.input),
          ...(interaction.state === 'pending'
            ? {
                respond: action<ConversationInteractionResponse, void>(
                  `respond:${interaction.id}`,
                  interaction.respondTarget,
                  (target, decision) => {
                    if (decision.kind === 'user-answer')
                      throw new ConversationReadError({ code: 'unsupported', retry: 'none' });
                    return source.respond(target, decision);
                  },
                  undefined,
                ),
              }
            : {}),
        })) ?? [],
      actions: {
        inputPolicy: REMOTE_INPUT_POLICY,
        send: action<ConversationInput, Submission>(
          'send',
          latest?.sendTarget,
          (target, input) => source.send(target, remoteInput(input)),
          { conversation: ref },
        ),
      },
    };
  }
  const state = createConversationState(snapshot());
  function publish() {
    state.set(snapshot());
  }
  const unstate = source.subscribeState(() => {
    const status = source.getState().status;
    if (status === 'ready' && sourceStatus !== 'ready') {
      // Reopen failed or interrupted history reads even when the desktop epoch/revision is unchanged.
      historyReset++;
      bootstrap = undefined;
    }
    sourceStatus = status;
    if (status === 'retired') lifetime.abort();
    publish();
    updateOperations();
  });
  const unoperations = source.subscribeOperations(updateOperations);
  updateOperations();
  const handle: RemoteConversationSession = {
    ref,
    scope,
    state,
    operations,
    activate: () => {
      assertCurrent();
      if (++observers === 1)
        unobserve = source.observe(ref.sessionId, (value) => {
          if (disposed) return;
          if (value.historyEpoch !== undefined) {
            if (historyEpoch !== undefined && historyEpoch !== value.historyEpoch) {
              historyReset++;
              bootstrap = undefined;
            }
            historyEpoch = value.historyEpoch;
          }
          if (value.session.historyVersion !== session.historyVersion) bootstrap = undefined;
          latest = value;
          session = value.session;
          publish();
        });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--observers === 0) {
          unobserve?.();
          unobserve = undefined;
        }
      };
    },
    refresh: async (signal) => {
      session = await read(signal, (signal) => source.readSession(ref.sessionId, signal));
      publish();
    },
    history: {
      peekLatest: () => {
        assertCurrent();
        const preview = source.peekSession(ref.sessionId)?.history;
        return preview
          ? {
              items: preview.items.toReversed().map(project),
              version: refs.issue<HistoryVersion>('history', preview.version),
              readAt: preview.readAt,
              hasOlderMessages: preview.hasOlderMessages,
              complete: preview.complete,
            }
          : undefined;
      },
      subscribePreview: (listener) => source.subscribeReads(ref.sessionId, listener),
      openLatest: async (signal) => {
        const verified = bootstrap;
        bootstrap = undefined;
        const fixed =
          verified ?? (await read(signal, (signal) => source.readSession(ref.sessionId, signal)));
        assertCurrent(signal);
        const controller = new AbortController();
        const version = refs.issue<HistoryVersion>('history', fixed.historyVersion);
        const cursors = createConversationReferences(scope, `${ref.sessionId}:${version}`);
        const dispose = () => {
          controller.abort();
          windows.delete(dispose);
        };
        windows.add(dispose);
        const page = async (cursor: string | undefined, signal: AbortSignal) => {
          const value = await read(AbortSignal.any([signal, controller.signal]), (signal) =>
            source.history(ref.sessionId, fixed.historyVersion, cursor, signal),
          );
          return {
            items: value.items.toReversed().map(project),
            ...(value.next ? { older: cursors.issue<HistoryCursor>('older', value.next) } : {}),
          };
        };
        try {
          return {
            scope,
            version,
            initial: await page(undefined, signal),
            read: (cursor, signal) => page(cursors.resolve(cursor, 'older').id, signal),
            dispose,
          };
        } catch (error) {
          dispose();
          throw error;
        }
      },
      prepareSelection: async (messageIds, signal) => {
        const ids = new Set(messageIds);
        if (!ids.size || ids.size !== messageIds.length || ids.size > 128)
          throw new ConversationReadError({ code: 'invalid-input', retry: 'revise-input' });
        const fixed = await read(signal, (signal) => source.readSession(ref.sessionId, signal));
        const selected = [];
        let cursor: string | undefined;
        const visited = new Set<string>();
        do {
          const page = await read(signal, (signal) =>
            source.history(ref.sessionId, fixed.historyVersion, cursor, signal),
          );
          selected.push(...page.items.filter((message) => ids.has(message.id)));
          cursor = page.next;
          if (cursor && visited.has(cursor))
            throw new ConversationReadError({ code: 'internal', retry: 'none' });
          if (cursor) visited.add(cursor);
        } while (cursor && selected.length < ids.size);
        if (
          selected.length !== ids.size ||
          selected.some((message) => message.state === 'streaming' || message.role === 'system')
        )
          throw new ConversationReadError({ code: 'conflict', retry: 'read-again' });
        // Revalidate after the last page; metadata and selected bytes belong to this immutable revision.
        const current = await read(signal, (signal) => source.readSession(ref.sessionId, signal));
        if (current.historyVersion !== fixed.historyVersion)
          throw new ConversationReadError({ code: 'version-expired', retry: 'read-again' });
        return {
          title: fixed.title,
          messages: selected.toReversed().map(remoteTranscriptMessage),
        };
      },
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      onDispose();
      lifetime.abort();
      unobserve?.();
      unstate();
      unoperations();
      for (const dispose of windows) dispose();
      publish();
    },
  };
  return handle;
}
