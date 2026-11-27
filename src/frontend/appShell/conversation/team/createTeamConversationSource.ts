import type { TeamAgentModule, TeamSession } from '@/shared/contracts/teamAgent';

import type {
  AgentRef,
  Availability,
  ConversationSource,
  ConversationSummary,
  QueryScope,
} from '../contracts';
import {
  createConversationReferences,
  createConversationState,
  ConversationReadError,
} from '../conversationState';
import { teamSessionId, teamSessionRef } from './teamReferences';

export function createTeamConversationSource(
  bindingId: string,
  module: TeamAgentModule,
): ConversationSource {
  const context = module.getState().context;
  if (!context || context.bindingId !== bindingId)
    throw new ConversationReadError({ code: 'needs-repair', retry: 'repair-source' });
  const scope = JSON.stringify(['team', context.key]) as QueryScope;
  const refs = createConversationReferences(scope);
  const ref = { kind: 'team', bindingId } as const;
  const sessions = new Map<string, TeamSession>();
  let disposed = false;
  const current = () => !disposed && module.getState().context?.key === context.key;
  const availability = (): Availability => {
    if (!current()) return { state: 'disabled', reason: 'retired' };
    const directory = module.getState();
    if (directory.phase === 'error' && directory.failure === 'not-visible') {
      sessions.clear();
      return { state: 'disabled', reason: 'not-authorized' };
    }
    return { state: 'enabled' };
  };
  const state = createConversationState({ availability: availability() });
  const unstate = module.subscribe(() => state.set({ availability: availability() }));
  const read = async <T>(signal: AbortSignal, work: () => Promise<T>) => {
    if (!current()) throw new ConversationReadError({ code: 'retired', retry: 'none' });
    signal.throwIfAborted();
    const result = await work();
    if (!current()) throw new ConversationReadError({ code: 'retired', retry: 'none' });
    signal.throwIfAborted();
    return result;
  };
  const summary = (session: TeamSession): ConversationSummary => {
    const id = teamSessionId(session);
    if (state.getSnapshot().availability.state === 'enabled') sessions.set(id, session);
    return {
      ref: { source: ref, sessionId: id },
      agentId: session.agentId,
      title:
        session.title?.trim() ||
        module.getState().agents.find((agent) => agent.id === session.agentId)?.name ||
        '',
      createdAt: session.createdAt,
    };
  };
  return {
    ref,
    scope,
    state,
    catalog: {
      cacheScope: scope,
      subscribe: (listener) => {
        let previous = module.getState();
        const unsubscribeDirectory = module.subscribe(() => {
          const next = module.getState();
          const changed = JSON.stringify(next.agents) !== JSON.stringify(previous.agents);
          previous = next;
          if (changed) {
            listener('agents');
            listener('sessions');
          }
        });
        const unsubscribeSessions = module.subscribeSessions(() => listener('sessions'));
        return () => {
          unsubscribeDirectory();
          unsubscribeSessions();
        };
      },
      listAgents: (_cursor, signal) =>
        read(signal, async () => {
          if (module.getState().phase !== 'ready') await module.refresh();
          return {
            items: module.getState().agents.map((agent) => ({
              id: agent.id,
              ref: refs.issue<AgentRef>('agent', agent.id),
              source: ref,
              name: agent.name,
              ...(agent.groupName && agent.groupName !== agent.name
                ? { groupName: agent.groupName }
                : {}),
              configuration: 'unknown' as const,
            })),
          };
        }),
      listSessions: ({ agent }, _cursor, signal) =>
        read(signal, async () => {
          if (module.getState().phase !== 'ready') await module.refresh();
          const agents = agent
            ? [refs.resolve(agent, 'agent').id]
            : module.getState().agents.map((item) => item.id);
          const rows = await Promise.allSettled(
            agents.map((id) => module.listSessions(id, signal)),
          );
          const first = rows[0];
          if (
            first?.status === 'rejected' &&
            (agent || rows.every((row) => row.status === 'rejected'))
          )
            throw first.reason;
          return {
            items: rows.flatMap((row) =>
              row.status === 'fulfilled' ? row.value.map(summary) : [],
            ),
          };
        }),
      readSession: (address, signal) =>
        read(signal, async () => {
          const target = teamSessionRef(address.sessionId);
          const list = await module.listSessions(target.agentId, signal);
          const session = list.find((row) => row.sessionId === target.sessionId);
          if (!session) throw new ConversationReadError({ code: 'not-found', retry: 'read-again' });
          return summary(session);
        }),
      previewSession: (address) => {
        const session = sessions.get(address.sessionId);
        return session?.canDelete
          ? {
              remove: {
                availability: { state: 'enabled' },
                execute: async () => {
                  if (!current())
                    return { state: 'rejected', failure: { code: 'retired', retry: 'none' } };
                  try {
                    await module.deleteSession(session);
                    return { state: 'applied', value: undefined };
                  } catch {
                    return {
                      state: 'rejected',
                      failure: { code: 'target-unavailable', retry: 'read-again' },
                    };
                  }
                },
              },
            }
          : {};
      },
    },
    dispose() {
      disposed = true;
      unstate();
      sessions.clear();
      state.set({ availability: { state: 'disabled', reason: 'retired' } });
    },
  };
}
