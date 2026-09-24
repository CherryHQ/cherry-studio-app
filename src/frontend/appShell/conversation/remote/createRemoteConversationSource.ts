import type { RemoteAgentSource, RemoteStartOperation } from '@/shared/contracts/remoteAgent';

import type {
  AgentRef,
  CatalogCursor,
  OperationOutcome,
  QueryScope,
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
import type {
  ConversationDraft,
  ConversationInput,
  ConversationOperation,
  DraftId,
  OperationId,
  RemoteConversationSource,
  Submission,
} from './remoteContracts';
import { remoteAvailability, remoteConversationFailure } from './remoteConversationViews';

export function createRemoteConversationSource(
  connectionId: string,
  remote: RemoteAgentSource,
): RemoteConversationSource {
  const ref = { kind: 'desktop' as const, connectionId };
  const scope = remote.scope as QueryScope;
  const refs = createConversationReferences(scope);
  const cacheScope = JSON.stringify([connectionId, remote.draftScope]) as QueryScope;
  const catalogRefs = createConversationReferences(cacheScope);
  let disposed = false;
  const systemWorkspaces = new Map<string, WorkspaceRef>();
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
      return {
        state: 'rejected',
        failure: remoteConversationFailure({ code: start.error, detail: start.errorMessage }),
      };
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
          ...(start.error
            ? {
                failure: remoteConversationFailure({
                  code: start.error,
                  detail: start.errorMessage,
                }),
              }
            : {}),
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
      cacheScope,
      readSession: (address, signal) =>
        read(signal, async () => {
          if (address.source.kind !== 'desktop' || address.source.connectionId !== connectionId)
            throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
          const session = await remote.readSession(address.sessionId, signal);
          return {
            ref: address,
            agentId: session.agentId,
            title: session.title,
            updatedAt: session.updatedAt,
          };
        }),
      listAgents: (cursor, signal) =>
        read(signal, async () => {
          const page = await remote.listAgents(
            cursor ? catalogRefs.resolve(cursor, 'agents').id : undefined,
            signal,
          );
          return {
            items: page.items.map((agent) => ({
              id: agent.id,
              ref: catalogRefs.issue<AgentRef>('agent', agent.id),
              name: agent.name,
              emoji: agent.emoji,
              modelName: agent.model?.name,
              configuration:
                agent.model === undefined
                  ? ('unknown' as const)
                  : agent.model === null
                    ? ('unavailable' as const)
                    : ('available' as const),
            })),
            ...(page.next ? { next: catalogRefs.issue<CatalogCursor>('agents', page.next) } : {}),
          };
        }),
      listWorkspaces: (agent, cursor, signal) =>
        read(signal, async () => {
          const id = catalogRefs.resolve(agent, 'agent').id;
          const kind = `workspaces:${id}`;
          const page = await remote.listWorkspaces(
            id,
            cursor ? refs.resolve(cursor, kind).id : undefined,
            signal,
          );
          assertSource();
          signal.throwIfAborted();
          const systemRef = refs.issue<WorkspaceRef>(`workspace:${id}`, '', 'system');
          if (page.systemWorkspace) systemWorkspaces.set(id, systemRef);
          else systemWorkspaces.delete(id);
          return {
            items: [
              ...(!cursor && page.systemWorkspace
                ? [{ ref: systemRef, kind: 'system' as const }]
                : []),
              ...page.items.map((workspace) => ({
                id: workspace.id,
                ref: refs.issue<WorkspaceRef>(`workspace:${id}`, workspace.id),
                name: workspace.name,
              })),
            ],
            ...(page.next ? { next: refs.issue<CatalogCursor>(kind, page.next) } : {}),
          };
        }),
      listSessions: ({ agent }, cursor, signal) =>
        read(signal, async () => {
          const id = agent ? catalogRefs.resolve(agent, 'agent').id : undefined;
          const kind = `sessions:${id ?? ''}`;
          const page = await remote.listSessions(
            id,
            cursor ? catalogRefs.resolve(cursor, kind).id : undefined,
            signal,
          );
          return {
            items: page.items.map((session) => ({
              ref: { source: ref, sessionId: session.id },
              agentId: session.agentId,
              title: session.title,
              updatedAt: session.updatedAt,
            })),
            ...(page.next ? { next: catalogRefs.issue<CatalogCursor>(kind, page.next) } : {}),
          };
        }),
      prepareDraft: async (input, signal) => {
        assertSource();
        signal.throwIfAborted();
        const agentId = catalogRefs.resolve(input.agent, 'agent').id;
        const selected = input.workspace
          ? refs.resolve(input.workspace, `workspace:${agentId}`)
          : undefined;
        const workspace = !selected
          ? undefined
          : selected.version === 'system'
            ? systemWorkspaces.get(agentId) === input.workspace
              ? { kind: 'system' as const }
              : undefined
            : { kind: 'registered' as const, id: selected.id };
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
                  : !workspace
                    ? { state: 'disabled', reason: 'workspace-required' }
                    : pending || remote.getStarts().some((start) => start.draftId === input.draftId)
                      ? { state: 'disabled', reason: 'busy' }
                      : availability,
              execute: async (value: ConversationInput) => {
                try {
                  assertSource();
                  if (retired) throw new ConversationReadError({ code: 'retired', retry: 'none' });
                  if (!workspace)
                    throw new ConversationReadError({
                      code: 'invalid-input',
                      retry: 'revise-input',
                    });
                  const text = remoteInput(value);
                  pending = true;
                  state.set(snapshot());
                  return outcome(
                    await remote.start({ draftId: input.draftId, agentId, workspace, text }),
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
        const cached = remote.peekSession(address.sessionId);
        const initial = cached?.session ?? (await remote.readSession(address.sessionId, signal));
        assertSource();
        const session = createRemoteConversationSession(
          remote,
          address,
          initial,
          assertSource,
          () => sessions.delete(session),
          !cached,
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
