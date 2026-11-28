import type {
  RemoteAgentSource,
  RemoteAttachment,
  RemoteModelSelection,
  RemoteStartOperation,
  RemoteWorkspaceSelection,
} from '@/shared/contracts/remoteAgent';

import type {
  AgentRef,
  CatalogCursor,
  ConversationAction,
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
  DraftId,
  OperationId,
  RemoteConversationSource,
  Submission,
} from './remoteContracts';
import {
  remoteAvailability,
  remoteConversationFailure,
  undeliveredMessage,
} from './remoteConversationViews';

const isUndelivered = (start: RemoteStartOperation) =>
  (start.status === 'rejected' || start.status === 'interrupted') && !start.sessionId;

function modelParam(model?: RemoteModelSelection) {
  return model ? { model: { providerId: model.providerId, modelId: model.modelId } } : {};
}

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
        operationId,
      };
    if (start.status === 'interrupted') return { state: 'interrupted', operationId };
    return { state: 'pending', operationId };
  }
  const state = createConversationState({
    availability: remoteAvailability(remote.getState(), false),
  });
  const catalogListeners = new Set<(kind: 'agents' | 'sessions') => void>();
  const created = new Set(remote.getStarts().flatMap((start) => start.sessionId ?? []));
  const unstate = remote.subscribeState(() => {
    state.set({ availability: remoteAvailability(remote.getState(), disposed) });
  });
  const unoperations = remote.subscribeOperations(() => {
    const fresh = remote
      .getStarts()
      .flatMap((start) =>
        start.sessionId && !created.has(start.sessionId) ? start.sessionId : [],
      );
    if (!fresh.length) return;
    for (const sessionId of fresh) created.add(sessionId);
    for (const listener of catalogListeners) listener('sessions');
  });
  return {
    draftScope: remote.draftScope,
    ref,
    scope,
    state,
    getDispatch: (...args) => (disposed ? undefined : remote.getDispatch(...args)),
    subscribeDispatches: remote.subscribeOperations,
    hasSubmission: (draftId) =>
      remote.getStarts().some((start) => start.draftId === draftId && !isUndelivered(start)),
    tasks: {
      list: (cursor, signal) =>
        read(signal, async () => {
          const page = await remote.tasks.list(
            cursor ? catalogRefs.resolve(cursor, 'tasks').id : undefined,
            signal,
          );
          return {
            items: page.items,
            ...(page.next ? { next: catalogRefs.issue<CatalogCursor>('tasks', page.next) } : {}),
          };
        }),
      listSessions: (taskId, cursor, signal) =>
        read(signal, async () => {
          const kind = `task-sessions:${taskId}`;
          const page = await remote.tasks.listSessions(
            taskId,
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
    },
    catalog: {
      cacheScope,
      subscribe: (listener) => {
        catalogListeners.add(listener);
        return () => {
          catalogListeners.delete(listener);
        };
      },
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
              ...(agent.model && {
                modelIdentity: { providerId: agent.model.providerId, modelId: agent.model.modelId },
              }),
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
      listModels: (agent, search, cursor, signal) =>
        read(signal, async () => {
          const id = catalogRefs.resolve(agent, 'agent').id;
          const kind = JSON.stringify(['models', id, search]);
          const page = await remote.listModels(
            id,
            search,
            cursor ? catalogRefs.resolve(cursor, kind).id : undefined,
            signal,
          );
          return {
            items: page.items,
            ...(page.next ? { next: catalogRefs.issue<CatalogCursor>(kind, page.next) } : {}),
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
        const submit = async (
          target: {
            agentId: string;
            workspace?: RemoteWorkspaceSelection;
            model?: RemoteModelSelection;
          },
          value: ConversationInput,
          replaceStartId?: string,
        ): Promise<OperationOutcome<Submission>> => {
          try {
            assertSource();
            if (retired) throw new ConversationReadError({ code: 'retired', retry: 'none' });
            if (!target.workspace)
              throw new ConversationReadError({ code: 'invalid-input', retry: 'revise-input' });
            const preparedInput = remoteInput(value);
            pending = true;
            state.set(snapshot());
            return outcome(
              await remote.start({
                draftId: input.draftId,
                agentId: target.agentId,
                workspace: target.workspace,
                ...modelParam(target.model),
                ...(replaceStartId && { replaceStartId }),
                ...preparedInput,
              }),
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
        };
        function snapshot(): ReturnType<ConversationDraft['state']['getSnapshot']> {
          const sourceState = remote.getState();
          const availability = remoteAvailability(sourceState, retired || disposed);
          const starts = remote.getStarts();
          const own = starts.find((start) => start.draftId === input.draftId);
          const attachmentKey = `draft:${input.draftId}`;
          const staged = sourceState.attachmentDrafts?.find(
            (item) => item.key === attachmentKey && item.draftTarget?.agentId === agentId,
          );
          const target = staged?.draftTarget ?? {
            agentId,
            workspace,
            model: input.model,
          };
          const unsupportedModel =
            !!target.model && !staged && sourceState.sessionModelSelection === false;
          const ready: ConversationAction<ConversationInput, Submission>['availability'] =
            availability.state === 'disabled'
              ? availability
              : pending || (own && !isUndelivered(own))
                ? { state: 'disabled', reason: 'busy' }
                : availability;
          const start: ConversationAction<ConversationInput, Submission> = {
            availability:
              ready.state === 'enabled' && !target.workspace
                ? { state: 'disabled', reason: 'workspace-required' }
                : ready.state === 'enabled' && unsupportedModel
                  ? { state: 'disabled', reason: 'model-unavailable' }
                  : ready,
            execute: (value) => submit(target, value),
          };
          // A start that failed after its route left surfaces on the next draft instead of vanishing.
          const failed =
            own && isUndelivered(own)
              ? own
              : starts.findLast(
                  (item) =>
                    isUndelivered(item) &&
                    item.draftId !== input.draftId &&
                    ![...drafts].some((draft) => draft.id === item.draftId),
                );
          const recoverMessage = (failed: RemoteStartOperation) => {
            const resend = (value: ConversationInput, model?: RemoteModelSelection) =>
              submit(
                {
                  agentId: failed.agentId,
                  workspace: failed.workspace ?? { kind: 'registered', id: failed.workspaceId! },
                  model,
                },
                value,
                failed.id,
              );
            const message = undeliveredMessage(
              failed,
              refs.issue<OperationId>('operation', failed.id),
              { availability: ready, execute: (value) => resend(value, failed.model) },
              () => {
                assertSource();
                remote.discard(failed.id);
              },
            );
            if (message?.failure?.code === 'model-unavailable') {
              message.resendWithModel = {
                agent: catalogRefs.issue<AgentRef>('agent', failed.agentId),
                availability: ready,
                execute: (model) => resend(message.input, model),
              };
            }
            return message;
          };
          const undelivered = failed && recoverMessage(failed);
          const stage = (files: RemoteAttachment[], model?: RemoteModelSelection) =>
            remote.stageAttachments!(
              attachmentKey,
              { agentId, workspace: target.workspace!, ...modelParam(model) },
              files,
            );
          const upload = sourceState.upload;
          return {
            inputPolicy: {
              ...REMOTE_INPUT_POLICY,
              attachments: sourceState.attachments === true,
            },
            sessionModelSelection: sourceState.sessionModelSelection === true,
            attachmentPreparation:
              target.workspace &&
              !unsupportedModel &&
              sourceState.preupload &&
              remote.stageAttachments
                ? {
                    draft: staged,
                    stage: (files) => stage(files, target.model),
                    ...(staged?.canReviseModel && {
                      reviseModel: (model?: RemoteModelSelection) =>
                        stage(
                          staged.items.map(({ fileEntryId, name, mediaType }) => ({
                            fileEntryId,
                            name,
                            mediaType,
                          })),
                          model,
                        ),
                    }),
                  }
                : undefined,
            upload:
              upload?.draftId === input.draftId
                ? {
                    ...upload,
                    cancel: () => remote.cancelUpload?.(upload.id),
                  }
                : undefined,
            start,
            ...(own?.sessionId && own.status !== 'pending'
              ? {
                  created: {
                    conversation: { source: ref, sessionId: own.sessionId },
                    release: () => {
                      assertSource();
                      remote.release(own.id);
                    },
                  },
                }
              : {}),
            ...(undelivered ? { undelivered } : {}),
          };
        }
        const state = createConversationState(snapshot());
        const unstate = remote.subscribeState(() => state.set(snapshot()));
        const unoperations = remote.subscribeOperations(() => {
          if (!retired) state.set(snapshot());
        });
        const draft: ConversationDraft = {
          id: input.draftId as DraftId,
          state,
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
    openTaskSession: (taskId, address, signal) =>
      read(signal, async () => {
        if (address.source.kind !== 'desktop' || address.source.connectionId !== connectionId)
          throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
        const initial = await remote.tasks.readSession(taskId, address.sessionId, signal);
        assertSource();
        signal.throwIfAborted();
        const session = createRemoteConversationSession(
          remote,
          address,
          initial,
          assertSource,
          () => sessions.delete(session),
          true,
        );
        sessions.add(session);
        return session;
      }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unstate();
      unoperations();
      catalogListeners.clear();
      state.set({ availability: remoteAvailability(remote.getState(), true) });
      for (const draft of drafts) draft.dispose();
      for (const session of sessions) session.dispose();
      sessions.clear();
      remote.dispose();
    },
  };
}
