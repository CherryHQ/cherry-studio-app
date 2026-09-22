import type { RemoteAgentSource, RemoteStartOperation } from '@/shared/contracts/remoteAgent';

import type {
  AgentRef,
  CatalogCursor,
  ConversationDraft,
  ConversationInput,
  ConversationOperation,
  ConversationSource,
  DraftId,
  OperationId,
  OperationOutcome,
  QueryScope,
  Submission,
  WorkspaceRef,
} from '../contracts';
import {
  createConversationReferences,
  createConversationState,
  ConversationReadError,
} from '../conversationState';
import {
  createRemoteConversationSession,
  REMOTE_INPUT_POLICY,
  remoteInput,
} from './createRemoteConversationSession';
import { remoteAvailability, remoteConversationFailure } from './remoteConversationViews';

export function createRemoteConversationSource(
  connectionId: string,
  remote: RemoteAgentSource,
): ConversationSource {
  const ref = { kind: 'desktop' as const, connectionId };
  const scope = remote.scope as QueryScope;
  const refs = createConversationReferences(scope);
  let disposed = false;
  const sessions = new Set<ReturnType<typeof createRemoteConversationSession>>();
  const drafts = new Set<ConversationDraft>();
  const assertSource = () => {
    if (disposed || remote.getState().status === 'retired')
      throw new ConversationReadError({ code: 'retired', retry: 'none' });
  };
  const read = async <T>(signal: AbortSignal, work: () => Promise<T>) => {
    assertSource();
    signal.throwIfAborted();
    try {
      const value = await work();
      assertSource();
      signal.throwIfAborted();
      return value;
    } catch (error) {
      throw error instanceof ConversationReadError
        ? error
        : new ConversationReadError(remoteConversationFailure(error));
    }
  };
  function outcome(start: RemoteStartOperation): OperationOutcome<Submission> {
    const operationId = refs.issue<OperationId>('operation', start.id);
    if (start.status === 'applied' && start.sessionId)
      return {
        state: 'applied',
        value: { conversation: { source: ref, sessionId: start.sessionId } },
      };
    if (start.status === 'rejected')
      return { state: 'rejected', failure: remoteConversationFailure({ code: start.error }) };
    if (start.status === 'interrupted') return { state: 'interrupted', operationId };
    return { state: 'pending', operationId };
  }
  const state = createConversationState({
    availability: remoteAvailability(remote.getState(), false),
  });
  const operations = createConversationState<readonly ConversationOperation[]>([]);
  const publishOperations = () =>
    operations.set(
      (disposed || remote.getState().status === 'retired' ? [] : remote.getStarts()).map(
        (start) => ({
          id: refs.issue<OperationId>('operation', start.id),
          kind: 'start',
          state: start.status,
          draftId: start.draftId as DraftId,
          ...(start.sessionId ? { conversation: { source: ref, sessionId: start.sessionId } } : {}),
          input: { parts: [{ type: 'text', text: start.text }] },
          ...(start.error ? { failure: remoteConversationFailure({ code: start.error }) } : {}),
          ...(start.status === 'pending'
            ? {
                recovery: {
                  availability: remoteAvailability(remote.getState(), disposed),
                  execute: async (): Promise<OperationOutcome<void>> => {
                    try {
                      assertSource();
                      await remote.recover(start.id);
                      const current = remote.getStarts().find((item) => item.id === start.id);
                      if (!current)
                        return {
                          state: 'rejected',
                          failure: { code: 'not-found', retry: 'none' },
                        };
                      const recovered = outcome(current);
                      return recovered.state === 'applied'
                        ? { state: 'applied', value: undefined }
                        : recovered;
                    } catch (error) {
                      return {
                        state: 'rejected',
                        failure:
                          error instanceof ConversationReadError
                            ? error.failure
                            : remoteConversationFailure(error),
                      };
                    }
                  },
                },
              }
            : {
                dismiss: () => {
                  assertSource();
                  remote.dismiss(start.id);
                },
              }),
        }),
      ),
    );
  const unstate = remote.subscribeState(() => {
    state.set({ availability: remoteAvailability(remote.getState(), disposed) });
    publishOperations();
  });
  const unoperations = remote.subscribeOperations(publishOperations);
  publishOperations();
  return {
    draftScope: remote.draftScope,
    operations,
    ref,
    scope,
    state,
    catalog: {
      listAgents: (cursor, signal) =>
        read(signal, async () => {
          const page = await remote.listAgents(
            cursor ? refs.resolve(cursor, 'agents').id : undefined,
            signal,
          );
          return {
            items: page.items.map((agent) => ({
              id: agent.id,
              ref: refs.issue<AgentRef>('agent', agent.id),
              name: agent.name,
              configuration: 'unknown' as const,
            })),
            ...(page.next ? { next: refs.issue<CatalogCursor>('agents', page.next) } : {}),
          };
        }),
      listWorkspaces: (agent, cursor, signal) =>
        read(signal, async () => {
          const id = refs.resolve(agent, 'agent').id;
          const kind = `workspaces:${id}`;
          const page = await remote.listWorkspaces(
            id,
            cursor ? refs.resolve(cursor, kind).id : undefined,
            signal,
          );
          return {
            items: page.items.map((workspace) => ({
              id: workspace.id,
              ref: refs.issue<WorkspaceRef>(`workspace:${id}`, workspace.id),
              name: workspace.name,
            })),
            ...(page.next ? { next: refs.issue<CatalogCursor>(kind, page.next) } : {}),
          };
        }),
      listSessions: ({ agent }, cursor, signal) =>
        read(signal, async () => {
          const id = agent ? refs.resolve(agent, 'agent').id : undefined;
          const kind = `sessions:${id ?? ''}`;
          const page = await remote.listSessions(
            id,
            cursor ? refs.resolve(cursor, kind).id : undefined,
            signal,
          );
          return {
            items: page.items.map((session) => ({
              ref: { source: ref, sessionId: session.id },
              title: session.title,
              updatedAt: session.updatedAt,
            })),
            ...(page.next ? { next: refs.issue<CatalogCursor>(kind, page.next) } : {}),
          };
        }),
      prepareDraft: async (input, signal) => {
        assertSource();
        signal.throwIfAborted();
        const agentId = refs.resolve(input.agent, 'agent').id;
        const workspaceId = input.workspace
          ? refs.resolve(input.workspace, `workspace:${agentId}`).id
          : undefined;
        let retired = false;
        let pending = false;
        const draftOperations = createConversationState<readonly ConversationOperation[]>([]);
        const publishDraftOperations = () =>
          draftOperations.set(
            operations.getSnapshot().filter((operation) => operation.draftId === input.draftId),
          );
        function snapshot(): ReturnType<ConversationDraft['state']['getSnapshot']> {
          const availability = remoteAvailability(remote.getState(), retired || disposed);
          return {
            inputPolicy: REMOTE_INPUT_POLICY,
            start: {
              availability:
                availability.state === 'disabled'
                  ? availability
                  : !workspaceId
                    ? { state: 'disabled', reason: 'workspace-required' }
                    : pending || remote.getStarts().some((start) => start.draftId === input.draftId)
                      ? { state: 'disabled', reason: 'busy' }
                      : availability,
              execute: async (value: ConversationInput) => {
                try {
                  assertSource();
                  if (retired) throw new ConversationReadError({ code: 'retired', retry: 'none' });
                  if (!workspaceId)
                    throw new ConversationReadError({
                      code: 'invalid-input',
                      retry: 'revise-input',
                    });
                  const text = remoteInput(value);
                  pending = true;
                  state.set(snapshot());
                  return outcome(
                    await remote.start({ draftId: input.draftId, agentId, workspaceId, text }),
                  );
                } catch (error) {
                  return {
                    state: 'rejected',
                    failure:
                      error instanceof ConversationReadError
                        ? error.failure
                        : remoteConversationFailure(error),
                  };
                } finally {
                  pending = false;
                  if (!retired) state.set(snapshot());
                }
              },
            },
          };
        }
        const state = createConversationState(snapshot());
        const unstate = remote.subscribeState(() => state.set(snapshot()));
        const unoperations = remote.subscribeOperations(() => {
          publishOperations();
          publishDraftOperations();
          if (!retired) state.set(snapshot());
        });
        publishOperations();
        publishDraftOperations();
        const draft: ConversationDraft = {
          id: input.draftId as DraftId,
          state,
          operations: draftOperations,
          dispose: () => {
            if (retired) return;
            retired = true;
            unstate();
            unoperations();
            drafts.delete(draft);
            state.set(snapshot());
          },
        };
        drafts.add(draft);
        return draft;
      },
    },
    openSession: (address, signal) =>
      read(signal, async () => {
        if (address.source.kind !== 'desktop' || address.source.connectionId !== connectionId)
          throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
        const initial = await remote.readSession(address.sessionId, signal);
        assertSource();
        const session = createRemoteConversationSession(
          remote,
          address,
          initial,
          assertSource,
          () => sessions.delete(session),
        );
        sessions.add(session);
        return session;
      }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unstate();
      unoperations();
      operations.set([]);
      state.set({ availability: remoteAvailability(remote.getState(), true) });
      for (const draft of drafts) draft.dispose();
      for (const session of sessions) session.dispose();
      sessions.clear();
      remote.dispose();
    },
  };
}
