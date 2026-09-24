import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopConnections } from '@/backend/services/desktopConnections';
import type { RemoteAgentModule, RemoteAgentSource } from '@/shared/contracts/remoteAgent';

import { RemoteAgentError } from './RemoteAgentError';
import { RemoteAgentScope } from './RemoteAgentScope';
import { RemoteSessionReadCache } from './RemoteSessionReadCache';

type Entry = { scope: RemoteAgentScope; users: number; unwatch: () => void };
type Opening = { promise: Promise<Entry>; waiters: number };

@Injectable('RemoteAgentRuntime')
@DependsOn(['DesktopConnectionManager'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('continue')
export class RemoteAgentRuntime extends BaseService implements RemoteAgentModule {
  private dependencies?: {
    connections: DesktopConnections;
    journal: RemoteAgentCommandJournal;
  };
  private readonly readCache = new RemoteSessionReadCache();
  private uninvalidate?: () => void;
  private readonly sources = new Map<string, Entry>();
  private readonly opening = new Map<string, Opening>();
  private readonly drains = new Set<Promise<void>>();
  private readonly lifetime = new AbortController();
  configure(dependencies: NonNullable<RemoteAgentRuntime['dependencies']>) {
    this.uninvalidate?.();
    this.readCache.clear();
    this.dependencies = dependencies;
    this.uninvalidate = dependencies.connections.subscribeInvalidation((event) => {
      if (!event.domain || event.domain === 'agent')
        this.readCache.invalidate(event.connectionId, event.grantId);
    });
  }
  async open(id: string, signal: AbortSignal): Promise<RemoteAgentSource> {
    signal.throwIfAborted();
    this.lifetime.signal.throwIfAborted();
    if (!this.dependencies) throw new Error('Remote Agent not configured');
    let entry = this.sources.get(id);
    if (entry?.scope.getState().status === 'retired') {
      this.close(id, entry);
      this.opening.delete(id);
      entry = undefined;
    }
    let reservation: Opening | undefined;
    try {
      if (!entry) {
        let opening = this.opening.get(id);
        if (!opening) {
          const dependencies = this.dependencies;
          const promise = dependencies.connections
            .retain(id, 'agent', this.lifetime.signal)
            .then((lease) => {
              try {
                this.lifetime.signal.throwIfAborted();
                const scope = new RemoteAgentScope(
                  lease,
                  dependencies.connections,
                  dependencies.journal,
                  this.readCache,
                );
                const created: Entry = { scope, users: 0, unwatch: () => undefined };
                // Route disposal does not interrupt admitted commands; release demand once they settle.
                const releaseUnused = () => {
                  queueMicrotask(() => this.releaseUnused(id, created));
                };
                const unoperations = scope.subscribeOperations(releaseUnused);
                const unstate = scope.subscribeState(releaseUnused);
                created.unwatch = () => {
                  unoperations();
                  unstate();
                };
                this.sources.set(id, created);
                return created;
              } catch (error) {
                lease.release();
                throw error;
              }
            });
          opening = { promise, waiters: 0 };
          this.opening.set(id, opening);
        }
        reservation = opening;
        reservation.waiters++;
        entry = await opening.promise;
      }
      signal.throwIfAborted();
      this.lifetime.signal.throwIfAborted();
      if (entry.scope.getState().status === 'retired') throw new RemoteAgentError('CLOSED');
      entry.users++;
    } finally {
      if (reservation) {
        reservation.waiters--;
        if (reservation.waiters === 0 && this.opening.get(id) === reservation) {
          this.opening.delete(id);
          if (entry) this.releaseUnused(id, entry);
        }
      }
    }
    const retained = entry;
    const scope = entry.scope;
    let disposed = false;
    const subscriptions = new Set<() => void>();
    const assertActive = () => {
      if (disposed) throw new DOMException('Source released', 'AbortError');
    };
    const subscribe = (unsubscribe: () => void) => {
      subscriptions.add(unsubscribe);
      return () => {
        if (subscriptions.delete(unsubscribe)) unsubscribe();
      };
    };
    return {
      scope: scope.scope,
      draftScope: scope.draftScope,
      getState: scope.getState,
      subscribeState: (listener) => {
        assertActive();
        return subscribe(scope.subscribeState(listener));
      },
      listAgents: (...args) => {
        assertActive();
        return scope.listAgents(...args);
      },
      listWorkspaces: (...args) => {
        assertActive();
        return scope.listWorkspaces(...args);
      },
      listSessions: (...args) => {
        assertActive();
        return scope.listSessions(...args);
      },
      peekSession: (id) => {
        assertActive();
        return scope.peekSession(id);
      },
      subscribeReads: (id, listener) => {
        assertActive();
        return subscribe(scope.subscribeReads(id, listener));
      },
      readSession: (...args) => {
        assertActive();
        return scope.readSession(...args);
      },
      history: (...args) => {
        assertActive();
        return scope.history(...args);
      },
      readResource: (...args) => {
        assertActive();
        return scope.readResource(...args);
      },
      observe: (...args) => {
        assertActive();
        return subscribe(scope.observe(...args));
      },
      start: (...args) => {
        assertActive();
        return scope.start(...args);
      },
      send: (...args) => {
        assertActive();
        return scope.send(...args);
      },
      cancel: (...args) => {
        assertActive();
        return scope.cancel(...args);
      },
      respond: (...args) => {
        assertActive();
        return scope.respond(...args);
      },
      getCommands: scope.getCommands,
      getStarts: scope.getStarts,
      subscribeOperations: (listener) => {
        assertActive();
        return subscribe(scope.subscribeOperations(listener));
      },
      recover: (operationId) => {
        assertActive();
        return scope.recover(operationId);
      },
      dismiss: (operationId) => {
        assertActive();
        scope.dismiss(operationId);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        for (const unsubscribe of subscriptions) unsubscribe();
        subscriptions.clear();
        retained.users--;
        this.releaseUnused(id, retained);
      },
    };
  }
  private releaseUnused(id: string, entry: Entry) {
    if (entry.users || this.sources.get(id) !== entry || this.opening.has(id)) return;
    if (entry.scope.getState().status === 'retired') {
      this.close(id, entry);
      return;
    }
    if (
      entry.scope
        .getCommands()
        .some((action) => ['confirming', 'accepted'].includes(action.status)) ||
      entry.scope.getStarts().some((start) => start.status === 'pending')
    )
      return;
    this.close(id, entry);
  }
  private close(id: string, entry: Entry) {
    if (this.sources.get(id) === entry) this.sources.delete(id);
    entry.unwatch();
    entry.scope.dispose();
    const drain = entry.scope.drain();
    this.drains.add(drain);
    void drain.finally(() => this.drains.delete(drain)).catch(() => undefined);
  }
  protected async onStop() {
    this.lifetime.abort();
    this.uninvalidate?.();
    this.readCache.clear();
    await Promise.allSettled([...this.opening.values()].map((opening) => opening.promise));
    for (const [id, entry] of this.sources) this.close(id, entry);
    while (this.drains.size) await Promise.allSettled([...this.drains]);
  }
}
