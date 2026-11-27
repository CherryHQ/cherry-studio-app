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
import { RemoteFailureError } from '@/backend/services/desktopConnections/remoteErrors';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import { raceAbort } from '@/backend/utils/raceAbort';
import type {
  RemoteAgentModule,
  RemoteAgentSource,
  RemoteDispatchReceipt,
  RemoteSessionLivePreview,
} from '@/shared/contracts/remoteAgent';
import { deepEqual } from '@/shared/utils/deepEqual';

import { RemoteAgentError } from './RemoteAgentError';
import {
  RemoteAgentScope,
  type RemoteBackgroundExecution,
  type SessionLivePreview,
} from './RemoteAgentScope';
import { projectAgentPage } from './remoteAgentViews';
import { RemoteSessionReadCache } from './RemoteSessionReadCache';
import type { RemoteUploadFiles } from './remoteUploads';

type Entry = {
  scope: RemoteAgentScope;
  grantId: string;
  invalidated?: boolean;
  users: number;
  unwatch: () => void;
  liveUnsubs: Map<string, () => void>;
};
type Opening = { promise: Promise<Entry>; waiters: number };
type LiveSessionListeners = { connectionId: string; sessionId: string; listeners: Set<() => void> };

const MAX_TERMINAL_PREVIEWS = 64;
const MAX_SETTLED_DISPATCHES = 64;

function isTerminalExecutionState(state: RemoteSessionLivePreview['executionState']): boolean {
  return (
    state === 'completed' || state === 'cancelled' || state === 'failed' || state === 'interrupted'
  );
}

@Injectable('RemoteAgentRuntime')
// The lifecycle graph brings execution protection into Gate before routes can
// open a desktop source; a recovered checkpoint must not receive a no-op turn.
@DependsOn(['DesktopConnectionManager', 'BackgroundReplyRuntime'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('continue')
export class RemoteAgentRuntime extends BaseService implements RemoteAgentModule {
  private dependencies?: {
    connections: DesktopConnections;
    journal: RemoteAgentCommandJournal;
    background?: RemoteBackgroundExecution;
    files?: RemoteUploadFiles;
  };
  private readonly readCache = new RemoteSessionReadCache();
  private uninvalidate?: () => void;
  private readonly preparedAgents = new Map<string, ReturnType<RemoteAgentSource['listAgents']>>();
  private readonly sources = new Map<string, Entry>();
  private readonly liveSessionListeners = new Map<string, LiveSessionListeners>();
  private readonly dispatchListeners = new Map<string, Set<() => void>>();
  private readonly settledDispatches = new Map<
    string,
    { connectionId: string; grantId: string; receipt: RemoteDispatchReceipt }
  >();
  private readonly terminalPreviews = new Map<
    string,
    { connectionId: string; grantId: string; binding: string; preview: SessionLivePreview }
  >();
  private readonly opening = new Map<string, Opening>();
  private readonly drains = new Set<Promise<void>>();
  private readonly lifetime = new AbortController();
  configure(dependencies: NonNullable<RemoteAgentRuntime['dependencies']>) {
    this.uninvalidate?.();
    this.preparedAgents.clear();
    this.readCache.clear();
    this.terminalPreviews.clear();
    this.settledDispatches.clear();
    this.dependencies = dependencies;
    this.uninvalidate = dependencies.connections.subscribeInvalidation((event) => {
      if (!event.domain || event.domain === 'agent') {
        const entry = this.sources.get(event.connectionId);
        if (entry && (!event.grantId || event.grantId === entry.grantId)) entry.invalidated = true;
        this.clearTerminalPreviews(event.connectionId, event.grantId);
        this.readCache.invalidate(event.connectionId, event.grantId);
        this.clearSettledDispatches(event.connectionId, event.grantId);
        this.notifyDispatches(event.connectionId);
        this.notifyLiveScope(event.connectionId);
      }
    });
  }
  prewarm(id: string, view: 'agents' | 'sessions', signal: AbortSignal): Promise<void> {
    const preparation = this.prepareCatalog(id, view, signal);
    this.drains.add(preparation);
    void preparation.finally(() => this.drains.delete(preparation)).catch(() => undefined);
    return preparation;
  }

  private async prepareCatalog(id: string, view: 'agents' | 'sessions', signal: AbortSignal) {
    const connections = this.dependencies?.connections;
    if (!connections || this.sources.has(id) || this.opening.has(id)) return;
    const linked = linkAbortSignals([signal, this.lifetime.signal]);
    let lease: Awaited<ReturnType<typeof connections.prewarmAgent>>;
    try {
      lease = await connections.prewarmAgent(id, linked.signal);
    } catch (error) {
      linked.dispose();
      throw error;
    }
    if (!lease) {
      linked.dispose();
      return;
    }
    if (lease.signal.aborted) linked.dispose();
    else lease.signal.addEventListener('abort', linked.dispose, { once: true });
    if (this.sources.has(id)) {
      lease.release();
      return;
    }
    if (this.opening.has(id) || lease.signal.aborted) return;
    // Ordinary session lists can traverse all scheduled-task memberships. Leave that work to a
    // real selection; preparing the authenticated channel still benefits either view.
    if (view !== 'agents') {
      try {
        await lease.ready(lease.signal);
      } catch (error) {
        lease.release();
        throw error;
      }
      return;
    }
    const page = lease.ready(lease.signal).then(async (session) => {
      const result = await session.request('agent.agents.list', {}, lease.signal);
      lease.signal.throwIfAborted();
      return projectAgentPage(result);
    });
    this.preparedAgents.set(lease.scope, page);
    const discard = () => {
      if (this.preparedAgents.get(lease.scope) === page) this.preparedAgents.delete(lease.scope);
    };
    lease.signal.addEventListener('abort', discard, { once: true });
    try {
      await page;
    } catch (error) {
      discard();
      if (
        !lease.signal.aborted &&
        error instanceof RemoteFailureError &&
        (error.reason === 'FORBIDDEN' || error.reason === 'GRANT_REVOKED')
      ) {
        await connections.revoke(id, 'agent', lease.grantId);
      }
      lease.release();
      throw error;
    }
  }

  peekDispatch(
    connectionId: string,
    draftId: string,
    operationId: string,
  ): RemoteDispatchReceipt | undefined {
    if (!draftId || !operationId) return undefined;
    const entry = this.sources.get(connectionId);
    if (entry?.invalidated || entry?.scope.getState().status === 'retired') return undefined;
    const receipt = entry?.scope.getDispatch(draftId, operationId);
    if (receipt) return receipt.status !== 'pending' || receipt.sessionId ? receipt : undefined;
    const cached = this.settledDispatches.get(JSON.stringify([connectionId, draftId, operationId]));
    if (!entry || cached?.grantId === entry.grantId) return cached?.receipt;
    return undefined;
  }
  subscribeDispatches(connectionId: string, listener: () => void): () => void {
    let listeners = this.dispatchListeners.get(connectionId);
    if (!listeners) {
      listeners = new Set();
      this.dispatchListeners.set(connectionId, listeners);
    }
    const group = listeners;
    const notify = () => listener();
    group.add(notify);
    return () => {
      if (group.delete(notify) && !group.size) this.dispatchListeners.delete(connectionId);
    };
  }
  private notifyDispatches(connectionId: string) {
    for (const listener of this.dispatchListeners.get(connectionId) ?? []) listener();
  }
  private recordSettledDispatch(
    connectionId: string,
    entry: Entry,
    receipt: RemoteDispatchReceipt,
  ) {
    const key = JSON.stringify([connectionId, receipt.draftId, receipt.id]);
    this.settledDispatches.set(key, { connectionId, grantId: entry.grantId, receipt });
    if (this.settledDispatches.size > MAX_SETTLED_DISPATCHES) {
      const oldest = this.settledDispatches.keys().next().value;
      if (oldest !== undefined) this.settledDispatches.delete(oldest);
    }
  }
  private clearSettledDispatches(connectionId: string, grantId?: string) {
    for (const [key, entry] of this.settledDispatches) {
      if (entry.connectionId === connectionId && (!grantId || entry.grantId === grantId))
        this.settledDispatches.delete(key);
    }
  }
  peekLiveSession(connectionId: string, sessionId: string): RemoteSessionLivePreview | undefined {
    const key = JSON.stringify([connectionId, sessionId]);
    const entry = this.sources.get(connectionId);
    if (entry?.invalidated || entry?.scope.getState().status === 'retired') return undefined;
    const live = entry?.scope.getLiveSessionPreview?.(sessionId);
    const cached = this.terminalPreviews.get(key);
    const saved =
      !entry ||
      (cached && cached.grantId === entry.grantId && cached.binding === entry.scope.draftScope)
        ? cached?.preview
        : undefined;
    if (!live) return saved;
    if (live.connectionStatus !== 'ready' || live.pendingInteraction) return live;
    if (!live.executionState) return saved ?? live;
    if (!isTerminalExecutionState(live.executionState)) return live;
    if (saved && this.preferSavedTerminal(saved, live)) return saved;
    return live;
  }
  private preferSavedTerminal(saved: SessionLivePreview, live: SessionLivePreview) {
    if (!saved.terminal || !live.terminal || saved.terminal.epoch !== live.terminal.epoch)
      return false;
    return (
      BigInt(saved.terminal.version) > BigInt(live.terminal.version) ||
      (saved.terminal.id === live.terminal.id &&
        saved.terminal.version === live.terminal.version &&
        deepEqual(saved, live))
    );
  }

  private recordTerminalPreview(
    key: string,
    connectionId: string,
    entry: Entry,
    preview: SessionLivePreview | undefined,
  ) {
    if (
      entry.invalidated ||
      !preview?.current ||
      preview.connectionStatus !== 'ready' ||
      preview.pendingInteraction ||
      !isTerminalExecutionState(preview.executionState)
    )
      return;
    const previous = this.terminalPreviews.get(key);
    const binding = entry.scope.draftScope;
    if (
      previous &&
      previous.grantId === entry.grantId &&
      previous.binding === binding &&
      (deepEqual(previous.preview, preview) || this.preferSavedTerminal(previous.preview, preview))
    )
      return;
    this.terminalPreviews.delete(key);
    this.terminalPreviews.set(key, { connectionId, grantId: entry.grantId, binding, preview });
    if (this.terminalPreviews.size > MAX_TERMINAL_PREVIEWS) {
      const oldest = this.terminalPreviews.keys().next().value;
      if (oldest !== undefined) this.terminalPreviews.delete(oldest);
    }
  }
  private clearTerminalPreviews(connectionId: string, grantId?: string) {
    for (const [key, entry] of this.terminalPreviews) {
      if (entry.connectionId === connectionId && (!grantId || entry.grantId === grantId))
        this.terminalPreviews.delete(key);
    }
  }
  subscribeLiveSession(connectionId: string, sessionId: string, listener: () => void): () => void {
    const key = JSON.stringify([connectionId, sessionId]);
    let group = this.liveSessionListeners.get(key);
    if (!group) {
      group = { connectionId, sessionId, listeners: new Set() };
      this.liveSessionListeners.set(key, group);
    }
    const listeners = group.listeners;
    const notify = () => listener();
    listeners.add(notify);
    const entry = this.sources.get(connectionId);
    if (entry) this.attachLiveSession(entry, group);
    return () => {
      if (!listeners.delete(notify) || listeners.size) return;
      this.liveSessionListeners.delete(key);
      const current = this.sources.get(connectionId);
      current?.liveUnsubs.get(sessionId)?.();
      current?.liveUnsubs.delete(sessionId);
    };
  }
  private attachLiveSession(entry: Entry, { sessionId, listeners }: LiveSessionListeners) {
    if (entry.liveUnsubs.has(sessionId)) return;
    const unsubscribe = entry.scope.subscribeLiveSession?.(sessionId, () => {
      for (const listener of listeners) listener();
    });
    if (unsubscribe) entry.liveUnsubs.set(sessionId, unsubscribe);
  }
  private notifyLiveScope(connectionId: string, entry?: Entry) {
    for (const group of this.liveSessionListeners.values()) {
      if (group.connectionId !== connectionId) continue;
      if (entry) this.attachLiveSession(entry, group);
      for (const listener of group.listeners) listener();
    }
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
                  dependencies.background,
                  dependencies.files,
                  (sessionId, preview) => {
                    if (!lease.signal.aborted && this.sources.get(id) === created)
                      this.recordTerminalPreview(
                        JSON.stringify([id, sessionId]),
                        id,
                        created,
                        preview,
                      );
                  },
                );
                const created: Entry = {
                  scope,
                  grantId: lease.grantId,
                  users: 0,
                  unwatch: () => undefined,
                  liveUnsubs: new Map(),
                };
                // Route disposal does not interrupt admitted commands; release demand once they settle.
                const releaseUnused = () => {
                  queueMicrotask(() => this.releaseUnused(id, created));
                };
                const unoperations = scope.subscribeOperations((receipt) => {
                  releaseUnused();
                  if (receipt && !created.invalidated && scope.getState().status !== 'retired')
                    this.recordSettledDispatch(id, created, receipt);
                  this.notifyDispatches(id);
                });
                const unstate = scope.subscribeState(() => {
                  releaseUnused();
                  if (scope.getState().status === 'retired') {
                    this.clearSettledDispatches(id, created.grantId);
                    this.notifyDispatches(id);
                  }
                });
                const unexecution = scope.subscribeExecution(releaseUnused);
                created.unwatch = () => {
                  unoperations();
                  unstate();
                  unexecution();
                };
                this.sources.set(id, created);
                this.notifyLiveScope(id, created);
                this.notifyDispatches(id);
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
      listAgents: async (cursor, signal) => {
        assertActive();
        signal.throwIfAborted();
        const prepared =
          cursor === undefined ? this.preparedAgents.get(scope.draftScope) : undefined;
        if (prepared) {
          this.preparedAgents.delete(scope.draftScope);
          // A cancelled or timed-out speculative read must not fail the user's own read.
          const page = await raceAbort(
            prepared.catch(() => undefined),
            signal,
          );
          assertActive();
          signal.throwIfAborted();
          if (page && scope.getState().status === 'ready') return page;
        }
        return scope.listAgents(cursor, signal);
      },
      listWorkspaces: (...args) => {
        assertActive();
        return scope.listWorkspaces(...args);
      },
      listSessions: (...args) => {
        assertActive();
        return scope.listSessions(...args);
      },
      tasks: {
        list: (...args) => {
          assertActive();
          return scope.tasks.list(...args);
        },
        listSessions: (...args) => {
          assertActive();
          return scope.tasks.listSessions(...args);
        },
        readSession: (...args) => {
          assertActive();
          return scope.tasks.readSession(...args);
        },
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
      historyIndex: (...args) => {
        assertActive();
        return scope.historyIndex(...args);
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
      stageAttachments: (...args) => {
        assertActive();
        scope.stageAttachments(...args);
      },
      cancelUpload: (id) => {
        assertActive();
        scope.cancelUpload(id);
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
      getDispatch: (...args) => {
        assertActive();
        return scope.getDispatch(...args);
      },
      subscribeOperations: (listener) => {
        assertActive();
        return subscribe(scope.subscribeOperations(listener));
      },
      discard: (operationId) => {
        assertActive();
        scope.discard(operationId);
      },
      release: (startId) => {
        assertActive();
        scope.release(startId);
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
    if (entry.scope.hasPendingExecution()) return;
    this.close(id, entry);
  }
  private close(id: string, entry: Entry) {
    const isCurrent = this.sources.get(id) === entry;
    if (isCurrent) {
      this.sources.delete(id);
      if (entry.invalidated || entry.scope.getState().status === 'retired')
        this.clearTerminalPreviews(id, entry.grantId);
      else {
        const sessionIds = new Set(entry.scope.getLivePreviewSessionIds?.());
        for (const group of this.liveSessionListeners.values()) {
          if (group.connectionId === id) sessionIds.add(group.sessionId);
        }
        for (const sessionId of sessionIds) {
          const preview = entry.scope.getLiveSessionPreview?.(sessionId);
          this.recordTerminalPreview(JSON.stringify([id, sessionId]), id, entry, preview);
        }
      }
    }
    for (const unsubscribe of entry.liveUnsubs.values()) unsubscribe();
    entry.liveUnsubs.clear();
    entry.unwatch();
    entry.scope.dispose();
    const drain = entry.scope.drain();
    this.drains.add(drain);
    void drain.finally(() => this.drains.delete(drain)).catch(() => undefined);
    if (isCurrent) {
      this.notifyLiveScope(id);
      this.notifyDispatches(id);
    }
  }
  protected override async onStop() {
    this.lifetime.abort();
    this.uninvalidate?.();
    this.preparedAgents.clear();
    this.readCache.clear();
    await Promise.allSettled([...this.opening.values()].map((opening) => opening.promise));
    for (const [id, entry] of this.sources) this.close(id, entry);
    this.terminalPreviews.clear();
    this.liveSessionListeners.clear();
    this.settledDispatches.clear();
    this.dispatchListeners.clear();
    while (this.drains.size) await Promise.allSettled([...this.drains]);
  }
}
