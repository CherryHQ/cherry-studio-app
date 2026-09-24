import { v7 as uuidv7 } from 'uuid';

import type { AgentProtocol } from '@/shared/contracts/agent';
import type { ApiClient } from '@/shared/data/api/types';

import type {
  AgentRef,
  Availability,
  CatalogCursor,
  ConversationSource,
  QueryScope,
} from '../contracts';
import {
  createConversationReferences,
  createConversationState,
  ConversationReadError,
} from '../conversationState';
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
      if (paths.some((path) => path === '/agent-sessions' || path.startsWith('/agent-sessions/')))
        publishCatalog('sessions');
    });
  const state = createConversationState<{ availability: Availability }>({
    availability: { state: 'enabled' },
  });
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
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      state.set({ availability: { state: 'disabled', reason: 'retired' } });
      unchanges?.();
      unchanges = undefined;
      catalogListeners.clear();
    },
  };
}
