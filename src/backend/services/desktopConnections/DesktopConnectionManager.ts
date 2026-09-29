import {
  directEndpointUrl,
  type DirectEndpoint,
  type RemoteAuthorization,
} from '@cherrystudio/remote-protocol';
import { loggerService } from '@logger';
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
  DesktopBindingInvalidation,
  DesktopConnectionStore,
  DesktopConnectionTarget,
  DesktopDomain,
  DesktopDomainLease,
  DesktopLeaseState,
} from './connectionPorts';
import { DesktopDiscovery } from './desktopDiscovery';
import { DesktopEndpointResolver } from './DesktopEndpointResolver';
import { DesktopSession } from './DesktopSession';
import { loadDeviceIdentity } from './deviceIdentity';
import { DesktopUnreachableError, RemoteFailureError } from './remoteErrors';
import { openWebSocketStream } from './remoteSocket';

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

class DesktopAuthorizationError extends RemoteFailureError {}

const logger = loggerService.withContext('DesktopConnectionManager');
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
  private readonly invalidations = new Set<(event: DesktopBindingInvalidation) => void>();
  subscribeInvalidation(listener: (event: DesktopBindingInvalidation) => void) {
    this.invalidations.add(listener);
    return () => {
      this.invalidations.delete(listener);
    };
  }
  private readonly resolver = new DesktopEndpointResolver();
  private readonly discovery = new DesktopDiscovery((event) => this.resolver.accept(event));
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
    this.refreshDiscoveryActivity();
    this.registerDisposable(
      this.resolver.subscribe((changed) => {
        if (!changed) return;
        for (const [id, entry] of this.entries) {
          if (entry.session?.isOpen) continue;
          entry.dial?.abort();
          void entry.pending?.finally(() => this.ensureConnected(id, entry)).catch(() => undefined);
          if (!entry.pending) this.ensureConnected(id, entry);
        }
      }),
    );
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
        if (!retained.session?.isOpen) retained.dial?.abort();
        this.refreshDiscoveryActivity();
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
          return Promise.reject(
            new DesktopUnreachableError(
              [state.status],
              state.reason === 'no-location' ||
                state.reason === 'discovery-unavailable' ||
                state.reason === 'unsupported-version'
                ? state.reason
                : 'unreachable',
            ),
          );
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
                  : new DesktopUnreachableError(
                      [lease.state.status],
                      lease.state.reason === 'no-location' ||
                        lease.state.reason === 'discovery-unavailable' ||
                        lease.state.reason === 'unsupported-version'
                        ? lease.state.reason
                        : 'unreachable',
                    ),
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
      this.refreshDiscoveryActivity();
      session = await this.track(
        this.connectCandidates(
          () =>
            target.addresses.map((host) => ({ host, port: target.port, security: 'ws' as const })),
          target.desktopIdentity,
          controller.signal,
        ),
      );
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
      this.refreshDiscoveryActivity();
    }
  }
  invalidate(id: string, reason: 'replaced' | 'removed' = 'replaced') {
    for (const listener of this.invalidations) listener({ connectionId: id });
    this.resolver.forget(id);
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    for (const lease of entry.leases) this.retire(lease, reason);
    this.close(entry);
    this.refreshDiscoveryActivity();
  }
  async revoke(id: string, domain: DesktopDomain, grantId: string) {
    this.assertAvailable();
    for (const listener of this.invalidations) listener({ connectionId: id, domain, grantId });
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
    if (!foreground) this.resolver.accept({ type: 'network' });
    this.refreshDiscoveryActivity();
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
          const latest = await this.store!.getRow(id);
          controller.signal.throwIfAborted();
          if (fingerprint(latest) !== fingerprint(entry.row)) {
            this.invalidate(id);
            throw new DOMException('Pairing replaced', 'AbortError');
          }
          entry.row = { ...entry.row, configuredEndpoints: latest.configuredEndpoints };
          this.refreshDiscoveryActivity();
          const stopBrowsing = this.discovery.browse();
          try {
            session = await this.connectCandidates(
              () =>
                this.resolver.candidates(
                  id,
                  entry.row.desktopIdentity,
                  entry.row.configuredEndpoints,
                ),
              entry.row.desktopIdentity,
              controller.signal,
              entry.row.deviceId,
              id,
            );
          } finally {
            stopBrowsing();
          }
          const authorization = session.currentAuthorization!;
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
            if (error instanceof DesktopAuthorizationError) {
              for (const listener of this.invalidations) listener({ connectionId: id });
              for (const lease of entry.leases) this.retire(lease, 'needs-repair');
              await this.store!.updateStatus(
                id,
                { status: 'needs-repair' },
                controller.signal,
                entry.row,
              );
            } else
              for (const lease of entry.leases)
                this.update(lease, {
                  status: this.foreground ? 'offline' : 'suspended',
                  reason: error instanceof DesktopUnreachableError ? error.reason : 'unreachable',
                });
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
    for (const previous of entry.row.grants)
      if (
        !grants.some(
          (grant) => grant.domain === previous.domain && grant.grantId === previous.grantId,
        )
      )
        for (const listener of this.invalidations)
          listener({ connectionId: id, domain: previous.domain, grantId: previous.grantId });
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
      Math.min(20_000, 1000 * 2 ** Math.min(entry.retry++, 5)) * (0.8 + Math.random() * 0.2),
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
  seedLocation(id: string, desktopIdentity: string, endpoints: DirectEndpoint[]) {
    this.resolver.seed(id, desktopIdentity, endpoints);
    const entry = this.entries.get(id);
    if (entry) this.ensureConnected(id, entry);
  }

  async refreshEndpoints(id: string) {
    const row = await this.store!.getRow(id);
    const entry = this.entries.get(id);
    if (!entry || fingerprint(entry.row) !== fingerprint(row)) return;
    entry.row = { ...entry.row, configuredEndpoints: row.configuredEndpoints };
    if (!entry.session?.isOpen) {
      entry.dial?.abort();
      await entry.pending;
      this.ensureConnected(id, entry);
    }
  }

  private refreshDiscoveryActivity() {
    this.discovery.setActive(!this.stopped && this.foreground);
  }

  private async connectCandidates(
    candidates: () => DirectEndpoint[],
    desktopIdentity: string,
    signal: AbortSignal,
    deviceId?: string,
    id?: string,
  ): Promise<DesktopSession> {
    const identity = await loadDeviceIdentity();
    signal.throwIfAborted();
    const round = new AbortController();
    const cancel = () => round.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const deadline = setTimeout(() => round.abort(new Error('Connection round timed out')), 15_000);
    const attempted = new Set<string>();
    const failures: string[] = [];
    let incompatible = false;
    try {
      for (;;) {
        round.signal.throwIfAborted();
        if (attempted.size >= 24) throw new DesktopUnreachableError(failures);
        const endpoint = candidates().find(
          (endpoint) => !attempted.has(directEndpointUrl(endpoint)),
        );
        if (!endpoint) {
          if (!id) throw new DesktopUnreachableError(failures);
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              unsubscribe();
              round.signal.removeEventListener('abort', abort);
            };
            const unsubscribe = this.resolver.subscribe(() => {
              cleanup();
              resolve();
            });
            const abort = () => {
              cleanup();
              reject(round.signal.reason);
            };
            round.signal.addEventListener('abort', abort, { once: true });
            if (round.signal.aborted) abort();
          });
          continue;
        }
        const url = directEndpointUrl(endpoint);
        attempted.add(url);
        const attempt = new AbortController();
        const abort = () => attempt.abort(round.signal.reason);
        round.signal.addEventListener('abort', abort, { once: true });
        let session: DesktopSession | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let stream: Awaited<ReturnType<typeof openWebSocketStream>> | undefined;
        let success = false;
        const dispose = () => {
          session?.close();
          stream?.abort(new Error('Connection attempt cancelled'));
        };
        attempt.signal.addEventListener('abort', dispose, { once: true });
        try {
          stream = await openWebSocketStream(url, attempt.signal);
          attempt.signal.throwIfAborted();
          timer = setTimeout(() => attempt.abort(new Error('Desktop handshake timed out')), 6000);
          session = await DesktopSession.connect({
            stream,
            address: endpoint.host,
            desktopIdentity,
            identity,
            signal: attempt.signal,
          });
          if (deviceId) {
            try {
              await session.authenticate(deviceId, attempt.signal);
            } catch (error) {
              attempt.signal.throwIfAborted();
              if (error instanceof RemoteFailureError && error.reason === 'UNAUTHENTICATED')
                throw new DesktopAuthorizationError(error.failure);
              throw error;
            }
          }
          attempt.signal.throwIfAborted();
          if (id) this.resolver.succeeded(id, endpoint);
          success = true;
          return session;
        } catch (error) {
          if (error instanceof DesktopAuthorizationError) throw error;
          if (!round.signal.aborted) {
            if (id) this.resolver.failed(id, endpoint);
            logger.debug('Desktop endpoint failed', {
              host: endpoint.host,
              port: endpoint.port,
              security: endpoint.security,
              reason:
                error instanceof RemoteFailureError
                  ? error.reason
                  : error instanceof Error
                    ? error.name
                    : 'unknown',
            });
          }
          if (error instanceof RemoteFailureError && error.reason === 'UPGRADE_REQUIRED')
            incompatible = true;
          failures.push(error instanceof Error ? error.name : 'Connection failed');
        } finally {
          clearTimeout(timer);
          round.signal.removeEventListener('abort', abort);
          attempt.signal.removeEventListener('abort', dispose);
          if (!success) {
            session?.close();
            stream?.abort(new Error('Connection attempt failed'));
          }
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof DesktopAuthorizationError) throw error;
      throw new DesktopUnreachableError(
        failures,
        incompatible
          ? 'unsupported-version'
          : failures.length
            ? 'unreachable'
            : this.resolver.discoveryAvailable
              ? 'no-location'
              : 'discovery-unavailable',
      );
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener('abort', cancel);
    }
  }
  protected async onStop() {
    this.stopped = true;
    this.discovery.setActive(false);
    for (const id of this.entries.keys()) this.invalidate(id);
    for (const controller of this.temporaryDials) controller.abort();
    for (const [session, controller] of this.temporary) {
      controller.abort();
      session.close();
    }
    while (this.work.size) await Promise.allSettled([...this.work]);
  }
}
