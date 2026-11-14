import { v7 as uuidv7 } from 'uuid';

import type { AgentProtocol } from '@/shared/contracts/agent';
import type {
  AgentSessionEntity,
  ListAgentSessionsQueryParams,
} from '@/shared/data/api/schemas/agentSessions';
import type { ApiClient } from '@/shared/data/api/types';

import type {
  AgentRef,
  Availability,
  CatalogCursor,
  ConversationSource,
  ConversationRef,
  ConversationSummary,
  QueryScope,
} from '../contracts';
import {
  createConversationReferences,
  createConversationState,
  ConversationReadError,
} from '../conversationState';
import { createLocalConversationGroupStatus } from './localConversationGroupStatus';
import {
  createLocalConversationPreview,
  type ConversationReadMarks,
} from './localConversationPreview';

/**
 * The local catalog for the sidebar and Agent picker. Local chat observation and execution stay
 * with the chat page's own client; this source never opens a transcript.
 */
export function createLocalConversationSource(input: {
  agent: AgentProtocol;
  api: ApiClient;
  readMarks?: ConversationReadMarks;
  onSessionChanged?: (sessionId: string) => void;
}): ConversationSource {
  const ref = { kind: 'local' } as const;
  const scope = uuidv7() as QueryScope;
  const refs = createConversationReferences(scope);
  const groupStatus = createLocalConversationGroupStatus(input);
  let disposed = false;
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
      if (paths.some((path) => path === '/agents' || path.startsWith('/agents/')))
        publishCatalog('agents');
      // A Session's message paths change with usage, not with its catalog row.
      if (paths.some((path) => /^\/agent-sessions(?:\/[^/]+)?$/.test(path)))
        publishCatalog('sessions');
    });
  const state = createConversationState<{ availability: Availability }>({
    availability: { state: 'enabled' },
  });
  const toSummary = (session: AgentSessionEntity): ConversationSummary => ({
    ref: { source: ref, sessionId: session.id },
    agentId: session.agentId,
    title: session.name,
    createdAt: session.createdAt,
    updatedAt: session.lastActivityAt,
    forkedFromSessionId: session.forkedFromSessionId,
    hasChildren: session.hasChildren,
  });
  const readSessions = async (
    {
      agent,
      parent,
      includeBranches = false,
    }: { agent?: AgentRef; parent?: ConversationRef; includeBranches?: boolean },
    cursor: CatalogCursor | undefined,
    signal: AbortSignal,
  ) => {
    assertSource();
    signal.throwIfAborted();
    if (parent && parent.source.kind !== 'local')
      throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
    const agentId = agent ? refs.resolve(agent, 'agent').id : undefined;
    const key = parent
      ? `children:${parent.sessionId}`
      : `sessions:${agentId ?? ''}:${includeBranches ? 'all' : 'roots'}`;
    const query: ListAgentSessionsQueryParams = {
      agentId,
      ...(parent
        ? { parentSessionId: parent.sessionId }
        : includeBranches
          ? {}
          : { groupBy: 'root' }),
      cursor: cursor ? refs.resolve(cursor, key).id : undefined,
    };
    const result = await input.api.get('/agent-sessions', { query, signal });
    assertSource();
    signal.throwIfAborted();
    return {
      items: result.items.map(toSummary),
      ...(result.nextCursor ? { next: refs.issue<CatalogCursor>(key, result.nextCursor) } : {}),
    };
  };
  return {
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
          if (!catalogListeners.size) {
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
        return toSummary(session);
      },
      readSessionPath: async (address, signal) => {
        assertSource();
        signal.throwIfAborted();
        if (address.source.kind !== 'local')
          throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
        const sessions = await input.api.get(`/agent-sessions/${address.sessionId}/path`, {
          signal,
        });
        assertSource();
        signal.throwIfAborted();
        return sessions.map(toSummary);
      },
      previewSession: (address, options) =>
        createLocalConversationPreview({
          ...input,
          address,
          status: options?.includeDescendants
            ? groupStatus.read({ sessionId: address.sessionId })
            : undefined,
          assertSource,
          onChanged: (id) => {
            publishCatalog('sessions');
            input.onSessionChanged?.(id);
          },
        }),
      previewAgent: (agent) => {
        assertSource();
        return groupStatus.read({ agentId: refs.resolve(agent, 'agent').id });
      },
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
            configuration: agent.model ? ('available' as const) : ('unavailable' as const),
            modelName: agent.modelName,
            avatar: agent.avatar,
            avatarUri: agent.avatarUri,
          })),
          ...(page * 100 < result.total
            ? { next: refs.issue<CatalogCursor>('agents', String(page + 1)) }
            : {}),
        };
      },
      listSessions: readSessions,
      listSessionChildren: (parent, cursor, signal) => readSessions({ parent }, cursor, signal),
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      groupStatus.dispose();
      state.set({ availability: { state: 'disabled', reason: 'retired' } });
      unchanges?.();
      unchanges = undefined;
      catalogListeners.clear();
    },
  };
}
