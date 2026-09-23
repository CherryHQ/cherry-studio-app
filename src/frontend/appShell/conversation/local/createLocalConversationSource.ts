import { v7 as uuidv7 } from 'uuid';

import type { AgentProtocol } from '@/shared/contracts/agent';
import type { ApiClient } from '@/shared/data/api/types';

import type {
  AgentRef,
  Availability,
  CatalogCursor,
  ConversationDraft,
  ConversationInput,
  ConversationOperation,
  ConversationSource,
  DraftId,
  MessageRef,
  OperationId,
  OperationOutcome,
  QueryScope,
  Submission,
} from '../contracts';
import {
  createConversationReferences,
  createConversationState,
  ConversationReadError,
} from '../conversationState';
import { AgentSessionChatClient } from './AgentSessionChatClient';
import {
  createLocalConversationSession,
  LOCAL_INPUT_POLICY,
} from './createLocalConversationSession';
import { localConversationFailure } from './localConversationFailure';
import {
  createLocalConversationPreview,
  type ConversationReadMarks,
} from './localConversationPreview';

/** Owns local observation and admission, never a desktop connection or a second execution engine. */
export function createLocalConversationSource(input: {
  agent: AgentProtocol;
  api: ApiClient;
  readMarks?: ConversationReadMarks;
  onSessionChanged?: (sessionId: string) => void;
  onTranscriptChanged?: (sessionId: string) => void;
}) {
  const ref = { kind: 'local' } as const;
  const scope = uuidv7() as QueryScope;
  const refs = createConversationReferences(scope);
  let disposed = false;
  const sessions = new Set<ReturnType<typeof createLocalConversationSession>>();
  const drafts = new Map<
    DraftId,
    {
      result?: Promise<OperationOutcome<Submission>>;
      intent?: string;
      operations: ReturnType<typeof createConversationState<readonly ConversationOperation[]>>;
    }
  >();
  const assertSource = () => {
    if (disposed) throw new ConversationReadError({ code: 'retired', retry: 'none' });
  };
  const catalogListeners = new Set<(kind: 'agents' | 'sessions') => void>();
  const publishCatalog = (kind: 'agents' | 'sessions') => {
    if (!disposed) for (const listener of catalogListeners) listener(kind);
  };
  let unchanges: (() => void) | undefined;
  const observeChanges = () =>
    input.api.subscribeChanges?.((paths) => {
      for (const session of sessions)
        if (paths.includes(`/agent-sessions/${session.handle.ref.sessionId}/messages`))
          session.changed(true);
      if (paths.some((path) => path === '/agents' || path.startsWith('/agents/')))
        publishCatalog('agents');
      if (paths.some((path) => path === '/agent-sessions' || path.startsWith('/agent-sessions/')))
        publishCatalog('sessions');
    });
  const changed = (sessionId: string, history: boolean) => {
    for (const session of sessions)
      if (session.handle.ref.sessionId === sessionId) session.changed(history);
  };
  const client = new AgentSessionChatClient(input.agent, {
    onSessionChanged: (id) => {
      changed(id, false);
      publishCatalog('sessions');
      input.onSessionChanged?.(id);
    },
    onTranscriptChanged: (id) => {
      changed(id, true);
      input.onTranscriptChanged?.(id);
    },
  });
  const state = createConversationState<{ availability: Availability }>({
    availability: { state: 'enabled' },
  });
  const operations = createConversationState<readonly ConversationOperation[]>([]);
  const source: ConversationSource = {
    draftScope: 'local',
    operations,
    ref,
    scope,
    state,
    catalog: {
      subscribe: (listener) => {
        if (disposed) return () => {};
        catalogListeners.add(listener);
        unchanges ??= observeChanges();
        return () => {
          catalogListeners.delete(listener);
          if (!catalogListeners.size && !sessions.size) {
            unchanges?.();
            unchanges = undefined;
          }
        };
      },
      readSession: async (address, signal) => {
        assertSource();
        signal.throwIfAborted();
        if (address.source.kind !== 'local')
          throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
        const session = await input.api.get(`/agent-sessions/${address.sessionId}`, { signal });
        assertSource();
        signal.throwIfAborted();
        return {
          ref: address,
          agentId: session.agentId,
          title: session.title,
          updatedAt: session.lastActivityAt,
        };
      },
      previewSession: (address) =>
        createLocalConversationPreview({
          ...input,
          address,
          assertSource,
          onChanged: (id) => {
            changed(id, false);
            publishCatalog('sessions');
            input.onSessionChanged?.(id);
          },
        }),
      listAgents: async (cursor, signal) => {
        assertSource();
        signal.throwIfAborted();
        const page = cursor ? Number(refs.resolve(cursor, 'agents').id) : 1;
        if (!Number.isInteger(page) || page < 1)
          throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
        const result = await input.api.get('/agents', { query: { page, limit: 100 }, signal });
        assertSource();
        signal.throwIfAborted();
        return {
          items: result.items.map((agent) => ({
            id: agent.id,
            ref: refs.issue<AgentRef>('agent', agent.id),
            name: agent.name,
            configuration: agent.modelId ? ('available' as const) : ('unavailable' as const),
            modelName: agent.modelName,
            avatar: agent.avatar,
            avatarUri: agent.avatarUri,
          })),
          ...(page * 100 < result.total
            ? { next: refs.issue<CatalogCursor>('agents', String(page + 1)) }
            : {}),
        };
      },
      listSessions: async ({ agent }, cursor, signal) => {
        assertSource();
        signal.throwIfAborted();
        const agentId = agent ? refs.resolve(agent, 'agent').id : undefined;
        const result = await input.api.get('/agent-sessions', {
          query: {
            agentId,
            cursor: cursor ? refs.resolve(cursor, `sessions:${agentId ?? ''}`).id : undefined,
          },
          signal,
        });
        assertSource();
        signal.throwIfAborted();
        return {
          items: result.items.map((session) => ({
            ref: { source: ref, sessionId: session.id },
            agentId: session.agentId,
            title: session.title,
            updatedAt: session.lastActivityAt,
          })),
          ...(result.nextCursor
            ? { next: refs.issue<CatalogCursor>(`sessions:${agentId ?? ''}`, result.nextCursor) }
            : {}),
        };
      },
      prepareDraft: async ({ agent, draftId, workspace }, signal): Promise<ConversationDraft> => {
        assertSource();
        signal.throwIfAborted();
        const agentId = refs.resolve(agent, 'agent').id;
        if (workspace) throw new ConversationReadError({ code: 'unsupported', retry: 'none' });
        const configured = await input.api.get(`/agents/${agentId}`, { signal });
        assertSource();
        signal.throwIfAborted();
        let retired = false;
        let entry = drafts.get(draftId);
        if (!entry) {
          entry = { operations: createConversationState<readonly ConversationOperation[]>([]) };
          drafts.set(draftId, entry);
        }
        const owned = entry;
        const state = createConversationState<
          ReturnType<ConversationDraft['state']['getSnapshot']>
        >({
          inputPolicy: LOCAL_INPUT_POLICY,
          start: {
            availability: configured.modelId
              ? { state: 'enabled' }
              : { state: 'disabled', reason: 'model-unavailable' },
            execute: (value: ConversationInput) => {
              try {
                assertSource();
                if (retired) throw new ConversationReadError({ code: 'retired', retry: 'none' });
              } catch (error) {
                return Promise.resolve({
                  state: 'rejected',
                  failure: localConversationFailure(error),
                });
              }
              const intent = JSON.stringify({ agentId, input: value });
              if (owned.result)
                return owned.intent === intent
                  ? owned.result
                  : Promise.resolve({
                      state: 'rejected',
                      failure: { code: 'idempotency-conflict', retry: 'none' },
                    });
              owned.intent = intent;
              const sessionId = uuidv7();
              const userMessageId = uuidv7();
              const id = refs.issue<OperationId>('start', draftId);
              const operation: ConversationOperation = {
                id,
                kind: 'start',
                state: 'pending',
                draftId,
                input: value,
              };
              owned.operations.set([operation]);
              operations.set(
                [...drafts.values()].flatMap((entry) => entry.operations.getSnapshot()),
              );
              owned.result = client
                .startSession({
                  ...value,
                  agentId,
                  sessionId,
                  userMessageId,
                  assistantMessageId: uuidv7(),
                  executionTarget: { kind: 'local' },
                })
                .then((session): OperationOutcome<Submission> => {
                  const conversation = { source: ref, sessionId: session.id };
                  owned.operations.set([{ ...operation, state: 'applied', conversation }]);
                  operations.set(
                    [...drafts.values()].flatMap((entry) => entry.operations.getSnapshot()),
                  );
                  input.onSessionChanged?.(session.id);
                  return {
                    state: 'applied',
                    value: {
                      conversation,
                      userMessage: createConversationReferences(
                        scope,
                        session.id,
                      ).issue<MessageRef>('message', userMessageId),
                    },
                  };
                })
                .catch((error: unknown): OperationOutcome<Submission> => {
                  const failure = localConversationFailure(error);
                  owned.operations.set([{ ...operation, state: 'rejected', failure }]);
                  operations.set(
                    [...drafts.values()].flatMap((entry) => entry.operations.getSnapshot()),
                  );
                  owned.result = undefined;
                  return { state: 'rejected', failure };
                });
              return owned.result;
            },
          },
        });
        return {
          id: draftId,
          state,
          operations: owned.operations,
          dispose: () => {
            if (retired) return;
            retired = true;
            const current = state.getSnapshot();
            state.set({
              ...current,
              start: { ...current.start, availability: { state: 'disabled', reason: 'retired' } },
            });
          },
        };
      },
    },
    openSession: async (address, signal) => {
      assertSource();
      signal.throwIfAborted();
      if (JSON.stringify(address.source) !== JSON.stringify(ref))
        throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
      const session = await input.api.get(`/agent-sessions/${address.sessionId}`, { signal });
      assertSource();
      signal.throwIfAborted();
      const entry = createLocalConversationSession({
        ...input,
        client,
        ref: address,
        session,
        scope,
        assertSource,
        onDispose: () => {
          sessions.delete(entry);
          if (!sessions.size && !catalogListeners.size) {
            unchanges?.();
            unchanges = undefined;
          }
        },
      });
      sessions.add(entry);
      unchanges ??= observeChanges();
      return entry.handle;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      state.set({ availability: { state: 'disabled', reason: 'retired' } });
      for (const entry of [...sessions]) entry.handle.dispose();
      unchanges?.();
      unchanges = undefined;
      catalogListeners.clear();
      client.dispose();
    },
  };
  return { source, client };
}
