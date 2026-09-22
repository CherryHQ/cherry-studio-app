import type { RemoteAuthorization } from '@cherrystudio/remote-protocol';
import { sha256 } from '@noble/hashes/sha2.js';
import { AppState } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { DesktopConnectionRow } from '@/backend/data/db/schemas';

import type {
  DesktopConnections,
  DesktopConnectionStore,
  DesktopConnectionTarget,
  DesktopDomain,
  DesktopDomainLease,
  DesktopLeaseState,
} from './connectionPorts';
import { DesktopSession } from './DesktopSession';
import { loadDeviceIdentity } from './deviceIdentity';
import { DesktopUnreachableError, RemoteFailureError } from './remoteErrors';

type LeaseEntry = {
  domain: DesktopDomain;
  grantId: string;
  controller: AbortController;
  state: DesktopLeaseState;
  listeners: Set<() => void>;
};
type ConnectionEntry = {
  row: DesktopConnectionRow;
  leases: Set<LeaseEntry>;
  session?: DesktopSession;
  pending?: Promise<void>;
  dial?: AbortController;
  idleTimer?: ReturnType<typeof setTimeout>;
  retryTimer?: ReturnType<typeof setTimeout>;
  retry: number;
  updates: Promise<void>;
  revoked: Set<string>;
};

const IDLE_GRACE_MS = 3000;
const fingerprint = (row: DesktopConnectionRow) =>
  JSON.stringify([row.desktopIdentity, row.deviceId]);
const scopeFor = (row: DesktopConnectionRow, domain: DesktopDomain, grantId: string) =>
  Array.from(
    sha256(new TextEncoder().encode(JSON.stringify([row.id, fingerprint(row), domain, grantId]))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');

/** One physical channel per desktop; domain leases own demand, never each other's authorization. */
@Injectable('DesktopConnectionManager')
@DependsOn(['DbService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('continue')
export class DesktopConnectionManager extends BaseService implements DesktopConnections {
  private store?: DesktopConnectionStore;
  private readonly entries = new Map<string, ConnectionEntry>();
  private readonly work = new Set<Promise<unknown>>();
  private readonly temporary = new Map<DesktopSession, AbortController>();
  private readonly temporaryDials = new Set<AbortController>();
  private stopped = false;
  private foreground = AppState.currentState === 'active';

  configure(store: DesktopConnectionStore) {
    this.store = store;
  }
  protected onInit() {
    this.registerAppStateListener((state) => this.setForeground(state === 'active'));
  }
  private track<T>(promise: Promise<T>): Promise<T> {
    this.work.add(promise);
    void promise.finally(() => this.work.delete(promise)).catch(() => undefined);
    return promise;
  }
  private assertAvailable() {
    if (this.stopped || !this.store)
      throw new DOMException('Connection manager stopped', 'AbortError');
  }
  async retain(
    id: string,
    domain: DesktopDomain,
    signal: AbortSignal,
  ): Promise<DesktopDomainLease> {
    this.assertAvailable();
    signal.throwIfAborted();
    const row = await this.store!.getRow(id);
    this.assertAvailable();
    signal.throwIfAborted();
    if (row.status === 'needs-repair')
      throw new RemoteFailureError({ reason: 'UNAUTHENTICATED', message: 'Pairing needs repair' });
    const grant = row.grants.find((grant) => grant.domain === domain);
    if (!grant)
      throw new RemoteFailureError({ reason: 'FORBIDDEN', message: 'Domain not granted' });
    let entry = this.entries.get(id);
    if (entry && fingerprint(entry.row) !== fingerprint(row)) {
      this.invalidate(id, 'replaced');
      entry = undefined;
    }
    if (!entry) {
      entry = { row, leases: new Set(), retry: 0, updates: Promise.resolve(), revoked: new Set() };
      this.entries.set(id, entry);
    }
    // A newly granted domain must authenticate before it can use the existing channel.
    if (JSON.stringify(entry.row.grants) !== JSON.stringify(row.grants)) {
      for (const existing of entry.leases)
        if (
          !row.grants.some(
            (item) => item.domain === existing.domain && item.grantId === existing.grantId,
          )
        )
          this.retire(existing, 'not-authorized');
      entry.row = row;
      this.close(entry);
    }
    if (entry.revoked.has(`${domain}:${grant.grantId}`))
      throw new RemoteFailureError({ reason: 'GRANT_REVOKED', message: 'Domain grant revoked' });
    const retained = entry;
    clearTimeout(entry.idleTimer);
    const lease: LeaseEntry = {
      domain,
      grantId: grant.grantId,
      controller: new AbortController(),
      listeners: new Set(),
      state: {
        status: this.foreground ? (entry.session?.isOpen ? 'ready' : 'connecting') : 'suspended',
      },
    };
    entry.leases.add(lease);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener('abort', release);
      retained.leases.delete(lease);
      this.retire(lease, 'stopped');
      if (!retained.leases.size) {
        clearTimeout(retained.retryTimer);
        retained.idleTimer = setTimeout(() => {
          if (!retained.leases.size && this.entries.get(id) === retained) {
            this.entries.delete(id);
            this.close(retained);
          }
        }, IDLE_GRACE_MS);
      }
    };
    signal.addEventListener('abort', release, { once: true });
    if (signal.aborted) release();
    this.ensureConnected(id, retained);
    return {
      connectionId: id,
      grantId: grant.grantId,
      scope: scopeFor(row, domain, grant.grantId),
      signal: lease.controller.signal,
      getSnapshot: () => lease.state,
      subscribe: (listener) => {
        lease.listeners.add(listener);
        return () => {
          lease.listeners.delete(listener);
        };
      },
      ready: (caller) => {
        caller.throwIfAborted();
        const state = lease.state;
        if (state.status === 'retired') return Promise.reject(this.retiredError(state.reason));
        if (state.status === 'suspended' || state.status === 'offline')
          return Promise.reject(new DesktopUnreachableError([state.status]));
        if (retained.session?.isOpen && state.status === 'ready')
          return Promise.resolve(retained.session);
        return new Promise((resolve, reject) => {
          const cleanup = () => {
            lease.listeners.delete(check);
            caller.removeEventListener('abort', abort);
          };
          const abort = () => {
            cleanup();
            reject(caller.reason);
          };
          const check = () => {
            if (lease.state.status === 'connecting') return;
            cleanup();
            if (lease.state.status === 'ready' && retained.session?.isOpen)
              resolve(retained.session);
            else
              reject(
                lease.state.status === 'retired'
                  ? this.retiredError(lease.state.reason)
                  : new DesktopUnreachableError([lease.state.status]),
              );
          };
          lease.listeners.add(check);
          caller.addEventListener('abort', abort, { once: true });
          if (caller.aborted) abort();
          else check();
        });
      },
      release,
    };
  }
  /** Pairing channels are also registered with app lifetime, including a dial still in flight. */
  async connectTemporary(
    target: DesktopConnectionTarget,
    signal: AbortSignal,
  ): Promise<DesktopSession> {
    this.assertAvailable();
    if (!this.foreground) throw new DesktopUnreachableError(['suspended']);
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    this.temporaryDials.add(controller);
    let session: DesktopSession | undefined;
    try {
      session = await this.track(this.connect(target, controller.signal));
      controller.signal.throwIfAborted();
      const connected = session;
      this.temporary.set(connected, controller);
      this.track(session.done)
        .finally(() => {
          this.temporary.delete(connected);
          signal.removeEventListener('abort', abort);
        })
        .catch(() => undefined);
      controller.signal.addEventListener('abort', () => connected.close(), { once: true });
      return session;
    } catch (error) {
      session?.close();
      signal.removeEventListener('abort', abort);
      throw error;
    } finally {
      this.temporaryDials.delete(controller);
    }
  }
  invalidate(id: string, reason: 'replaced' | 'removed' = 'replaced') {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    for (const lease of entry.leases) this.retire(lease, reason);
    this.close(entry);
  }
  async revoke(id: string, domain: DesktopDomain, grantId: string) {
    this.assertAvailable();
    const entry = this.entries.get(id);
    if (
      !entry ||
      !entry.row.grants.some((grant) => grant.domain === domain && grant.grantId === grantId)
    )
      return;
    entry.revoked.add(`${domain}:${grantId}`);
    // Retire before awaiting storage: old event reducers can no longer commit.
    for (const lease of entry.leases)
      if (lease.domain === domain && lease.grantId === grantId)
        this.retire(lease, 'not-authorized');
    if (![...entry.leases].some((lease) => !lease.controller.signal.aborted)) this.close(entry);
    await this.updateAuthorization(entry, async () => {
      if (this.entries.get(id) !== entry) return;
      const expected = entry.row;
      const grants = expected.grants.filter(
        (grant) => !(grant.domain === domain && grant.grantId === grantId),
      );
      await this.store!.updateStatus(
        id,
        { grants, status: 'paired' },
        new AbortController().signal,
        expected,
      );
      if (this.entries.get(id) === entry) entry.row = { ...expected, grants };
    });
  }
  private updateAuthorization(entry: ConnectionEntry, update: () => Promise<void>) {
    const pending = entry.updates.then(update);
    entry.updates = pending.catch(() => undefined);
    return this.track(pending);
  }

  private setForeground(foreground: boolean) {
    this.foreground = foreground;
    if (!foreground) {
      for (const controller of this.temporaryDials) controller.abort();
      for (const [session, controller] of this.temporary) {
        controller.abort();
        session.close();
      }
    }
    for (const [id, entry] of this.entries) {
      if (!foreground) {
        this.close(entry);
        for (const lease of entry.leases) this.update(lease, { status: 'suspended' });
      } else this.ensureConnected(id, entry);
    }
  }
  private ensureConnected(id: string, entry: ConnectionEntry) {
    if (
      this.stopped ||
      !this.foreground ||
      entry.pending ||
      entry.session?.isOpen ||
      this.entries.get(id) !== entry ||
      ![...entry.leases].some((lease) => !lease.controller.signal.aborted)
    )
      return;
    clearTimeout(entry.retryTimer);
    const controller = new AbortController();
    entry.dial = controller;
    for (const lease of entry.leases) this.update(lease, { status: 'connecting' });
    const promise = this.track(
      Promise.resolve().then(async () => {
        let session: DesktopSession | undefined;
        try {
          session = await this.connect(entry.row, controller.signal);
          const authorization = await session.authenticate(entry.row.deviceId, controller.signal);
          controller.signal.throwIfAborted();
          if (this.entries.get(id) !== entry) throw new DOMException('Replaced', 'AbortError');
          await this.updateAuthorization(entry, () =>
            this.installAuthorization(id, entry, authorization, controller.signal),
          );
          controller.signal.throwIfAborted();
          entry.session = session;
          entry.retry = 0;
          session.onAuthorization((next) => {
            this.updateAuthorization(entry, () =>
              this.installAuthorization(id, entry, next, controller.signal),
            ).catch(() => session?.close());
          });
          for (const lease of entry.leases) this.update(lease, { status: 'ready' });
          const connected = session;
          this.track(connected.done)
            .finally(() => {
              if (entry.session !== connected) return;
              entry.session = undefined;
              for (const lease of entry.leases)
                this.update(lease, { status: this.foreground ? 'offline' : 'suspended' });
              this.scheduleReconnect(id, entry);
            })
            .catch(() => undefined);
        } catch (error) {
          session?.close();
          if (!controller.signal.aborted && this.entries.get(id) === entry) {
            if (error instanceof RemoteFailureError && error.reason === 'UNAUTHENTICATED') {
              for (const lease of entry.leases) this.retire(lease, 'needs-repair');
              await this.store!.updateStatus(
                id,
                { status: 'needs-repair' },
                controller.signal,
                entry.row,
              );
            } else
              for (const lease of entry.leases)
                this.update(lease, { status: this.foreground ? 'offline' : 'suspended' });
          }
        } finally {
          if (entry.pending === promise) entry.pending = undefined;
          this.scheduleReconnect(id, entry);
        }
      }),
    );
    entry.pending = promise;
    void promise.catch(() => undefined);
  }
  private async installAuthorization(
    id: string,
    entry: ConnectionEntry,
    authorization: RemoteAuthorization,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    if (this.entries.get(id) !== entry) return;
    const grants = authorization.grants.filter(
      (grant) => !entry.revoked.has(`${grant.domain}:${grant.grantId}`),
    );
    for (const lease of entry.leases) {
      if (!grants.some((grant) => grant.domain === lease.domain && grant.grantId === lease.grantId))
        this.retire(lease, 'not-authorized');
    }
    await this.store!.updateStatus(id, { grants, status: 'paired' }, signal, entry.row);
    signal.throwIfAborted();
    if (this.entries.get(id) === entry) entry.row = { ...entry.row, grants };
    if (![...entry.leases].some((lease) => !lease.controller.signal.aborted)) this.close(entry);
  }
  private scheduleReconnect(id: string, entry: ConnectionEntry) {
    if (
      this.stopped ||
      !this.foreground ||
      entry.session?.isOpen ||
      entry.pending ||
      this.entries.get(id) !== entry ||
      ![...entry.leases].some((lease) => !lease.controller.signal.aborted)
    )
      return;
    clearTimeout(entry.retryTimer);
    entry.retryTimer = setTimeout(
      () => this.ensureConnected(id, entry),
      Math.min(20_000, 1000 * 2 ** Math.min(entry.retry++, 5)),
    );
  }
  private retiredError(reason: DesktopLeaseState['reason']) {
    if (reason === 'stopped' || reason === 'removed' || reason === 'replaced')
      return new DOMException('Lease retired', 'AbortError');
    return new RemoteFailureError({
      reason: reason === 'needs-repair' ? 'UNAUTHENTICATED' : 'GRANT_REVOKED',
      message: 'Lease retired',
    });
  }
  private update(lease: LeaseEntry, state: DesktopLeaseState) {
    if (
      lease.controller.signal.aborted ||
      (lease.state.status === state.status && lease.state.reason === state.reason)
    )
      return;
    lease.state = state;
    for (const listener of lease.listeners) listener();
  }
  private retire(lease: LeaseEntry, reason: DesktopLeaseState['reason']) {
    this.update(lease, { status: 'retired', reason });
    lease.controller.abort(new DOMException('Lease retired', 'AbortError'));
  }
  private close(entry: ConnectionEntry) {
    clearTimeout(entry.retryTimer);
    clearTimeout(entry.idleTimer);
    entry.dial?.abort();
    entry.session?.close();
    entry.session = undefined;
  }
  private async connect(target: DesktopConnectionTarget, signal: AbortSignal) {
    const identity = await loadDeviceIdentity();
    signal.throwIfAborted();
    return DesktopSession.connect({ ...target, identity, signal });
  }
  protected async onStop() {
    this.stopped = true;
    for (const id of this.entries.keys()) this.invalidate(id);
    for (const controller of this.temporaryDials) controller.abort();
    for (const [session, controller] of this.temporary) {
      controller.abort();
      session.close();
    }
    while (this.work.size) await Promise.allSettled([...this.work]);
  }
}
