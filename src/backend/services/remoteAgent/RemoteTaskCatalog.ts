import type {
  DesktopParams,
  DesktopResult,
} from '@/backend/services/desktopConnections/DesktopSession';
import type { RemoteTaskQueries, RemoteTaskView } from '@/shared/contracts/remoteAgent';

import { RemoteAgentError } from './RemoteAgentError';
import { projectSession } from './remoteAgentViews';
import type { RemoteReadCoordinator } from './RemoteReadCoordinator';

type TaskCatalogMethod = 'agent.tasks.list' | 'agent.sessions.list';
type TaskCatalogRequest = <M extends TaskCatalogMethod>(
  method: M,
  params: DesktopParams<M>,
  signal: AbortSignal,
) => Promise<DesktopResult<M>>;
type Membership = { readAt: number; taskIds: Map<string, string>; seen: Set<string> };

/** Task-scoped queries establish provenance without relying on conversation titles or run history. */
export class RemoteTaskCatalog implements RemoteTaskQueries {
  private readonly entries = new Map<string | undefined, Membership>();
  private isUnsupported = false;
  private generation = 0;

  constructor(
    private readonly reads: RemoteReadCoordinator,
    private readonly request: TaskCatalogRequest,
  ) {}

  reset() {
    this.entries.clear();
    this.isUnsupported = false;
    this.generation++;
  }

  async list(cursor: string | undefined, signal: AbortSignal) {
    const page = await this.request('agent.tasks.list', { cursor }, signal);
    return { items: page.items.map(projectTask), next: page.nextCursor ?? undefined };
  }

  async listSessions(taskId: string, cursor: string | undefined, signal: AbortSignal) {
    const page = await this.request('agent.sessions.list', { taskId, cursor }, signal);
    return { items: page.items.map(projectSession), next: page.nextCursor ?? undefined };
  }

  async readSession(taskId: string, sessionId: string, signal: AbortSignal) {
    const visited = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await this.listSessions(taskId, cursor, signal);
      const session = page.items.find((session) => session.id === sessionId);
      if (session) return session;
      cursor = page.next;
      if (cursor && visited.has(cursor)) throw new RemoteAgentError('PROTOCOL_ERROR');
      if (cursor) visited.add(cursor);
    } while (cursor);
    throw new RemoteAgentError('NOT_FOUND');
  }

  async identify(agentId: string | undefined, sessionIds: string[], signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.isUnsupported || !sessionIds.length) return new Map<string, string>();
    const cached = this.entries.get(agentId);
    if (
      cached &&
      Date.now() - cached.readAt < 30_000 &&
      sessionIds.every((id) => cached.seen.has(id) || cached.taskIds.has(id))
    )
      return cached.taskIds;

    const generation = this.generation;
    try {
      const entry = await this.reads.share(
        JSON.stringify(['task-catalog', generation, agentId]),
        signal,
        async (sharedSignal) => {
          const tasks = await this.pages(sharedSignal, (cursor) =>
            this.request('agent.tasks.list', { agentId, cursor, limit: 100 }, sharedSignal),
          );
          const taskIds = new Map<string, string>();
          for (const task of tasks) {
            if (agentId && task.agentId !== agentId) throw new RemoteAgentError('PROTOCOL_ERROR');
            let sessions;
            try {
              sessions = await this.pages(sharedSignal, (cursor) =>
                this.request(
                  'agent.sessions.list',
                  { agentId: task.agentId, taskId: task.taskId, cursor, limit: 100 },
                  sharedSignal,
                ),
              );
            } catch (error) {
              // The task may be deleted between discovery and its conversation query.
              if (error instanceof RemoteAgentError && error.code === 'NOT_FOUND') continue;
              throw error;
            }
            for (const session of sessions) {
              if (session.agentId !== task.agentId) throw new RemoteAgentError('PROTOCOL_ERROR');
              taskIds.set(session.sessionId, task.taskId);
            }
          }
          sharedSignal.throwIfAborted();
          const value: Membership = {
            readAt: Date.now(),
            taskIds,
            seen: new Set(this.entries.get(agentId)?.seen),
          };
          if (generation === this.generation) this.entries.set(agentId, value);
          return value;
        },
      );
      signal.throwIfAborted();
      for (const id of sessionIds) entry.seen.add(id);
      return entry.taskIds;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof RemoteAgentError && error.code === 'UPGRADE_REQUIRED') {
        if (generation === this.generation) this.isUnsupported = true;
        return new Map<string, string>();
      }
      throw error;
    }
  }

  private async pages<T>(
    signal: AbortSignal,
    read: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>,
  ) {
    const items: T[] = [];
    let cursor: string | undefined;
    const visited = new Set<string>();
    do {
      const page = await this.reads.run(signal, () => read(cursor));
      items.push(...page.items);
      cursor = page.nextCursor ?? undefined;
      if (cursor && visited.has(cursor)) throw new RemoteAgentError('PROTOCOL_ERROR');
      if (cursor) visited.add(cursor);
    } while (cursor);
    return items;
  }
}

function projectTask(task: DesktopResult<'agent.tasks.list'>['items'][number]): RemoteTaskView {
  const trigger = task.trigger;
  return {
    id: task.taskId,
    agentId: task.agentId,
    name: task.name,
    trigger:
      trigger.kind === 'cron'
        ? { kind: 'cron', expr: trigger.expr, timezone: trigger.timezone }
        : trigger.kind === 'interval'
          ? { kind: 'interval', ms: trigger.ms }
          : { kind: 'once', at: trigger.at },
  };
}
