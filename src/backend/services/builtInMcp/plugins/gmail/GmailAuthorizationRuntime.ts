import { randomUUID } from 'expo-crypto';

import {
  PluginError,
  type PluginAuthorizationState,
  type PluginErrorReason,
} from '@/shared/contracts/plugins';
import type { PluginConnectionStatus } from '@/shared/data/types/plugin';

import type {
  PluginAuthorizationRuntime,
  PluginAuthorizationStore,
} from '../../authorization/pluginAuthorization';
import type { PluginCredential } from '../../authorization/pluginCredential';
import { GmailUserCredentialSchema, type GmailUserCredential } from './gmailCredentials';
import { gmailOauth } from './gmailOauth';

type Pending = {
  status: 'review' | 'ready';
  id: string;
  previousId?: string;
  credential: GmailUserCredential;
  requiresDisconnect: boolean;
};

const asCredential = (value: GmailUserCredential): PluginCredential =>
  JSON.parse(JSON.stringify(value));
const cancelled = () => new PluginError('cancelled', 'Gmail authorization cancelled.');

/** Owns one in-memory authorization attempt and grant-scoped shared renewal. */
export class GmailAuthorizationRuntime implements PluginAuthorizationRuntime {
  private operations: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();
  private attempt = new AbortController();
  private renewal = new AbortController();
  private pending?: Pending;
  private readonly resolutions = new Map<string, Promise<PluginCredential>>();
  private readonly failures = new Map<string, PluginErrorReason>();

  constructor(private readonly store: PluginAuthorizationStore) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations
      .catch(() => {})
      .then(async () => {
        if (this.lifetime.signal.aborted) throw cancelled();
        try {
          return await operation();
        } catch (error) {
          if (
            this.lifetime.signal.aborted ||
            (typeof error === 'object' &&
              error !== null &&
              'name' in error &&
              error.name === 'AbortError')
          )
            throw cancelled();
          throw error;
        }
      });
    this.operations = result;
    return result;
  }

  private project(): PluginAuthorizationState {
    const pending = this.pending;
    if (!pending) return { status: 'idle' };
    if (pending.status === 'review')
      return {
        status: 'review',
        attemptId: pending.id,
        accountLabel: pending.credential.account.label,
        requiresDisconnect: pending.requiresDisconnect,
      };
    return { status: 'ready', attemptId: pending.id };
  }

  getState() {
    return this.serialize(async () => this.project());
  }
  get attemptSignal() {
    return AbortSignal.any([this.lifetime.signal, this.attempt.signal]);
  }

  begin() {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      if (this.pending) return this.project();
      const previousId = await this.store.getCurrentAuthorizationId();
      const current = previousId
        ? GmailUserCredentialSchema.parse((await this.store.getGrant(previousId))?.credential)
        : undefined;
      try {
        const tokens = await gmailOauth.authorize(current?.account.id ?? null, true, signal);
        const account = await gmailOauth.getAccount(tokens.accessToken, signal);
        const requiresDisconnect = await this.requiresDisconnect(previousId, account.id);
        signal.throwIfAborted();
        this.pending = {
          status: 'review',
          id: randomUUID(),
          previousId,
          requiresDisconnect,
          credential: { version: 1, tokens, account },
        };
        return this.project();
      } catch (error) {
        if (!signal.aborted && error instanceof PluginError && error.reason === 'cancelled')
          return this.project();
        throw error;
      }
    });
  }

  private async requiresDisconnect(previousId: string | undefined, accountId: string) {
    const currentId = await this.store.getCurrentAuthorizationId();
    if (currentId !== previousId) return true;
    if (!currentId) return false;
    try {
      const current = await this.store.getGrant(currentId);
      const parsed = GmailUserCredentialSchema.safeParse(current?.credential);
      return !parsed.success || parsed.data.account.id !== accountId;
    } catch (error) {
      if (error instanceof PluginError && error.reason === 'authorization') return true;
      throw error;
    }
  }

  private requireReview(id: string) {
    if (
      this.pending?.id === id &&
      (this.pending.status === 'review' || this.pending.status === 'ready')
    )
      return this.pending;
    throw new PluginError('authorization', 'Gmail authorization is no longer available.');
  }

  private async refreshed(
    credential: GmailUserCredential,
    signal: AbortSignal,
  ): Promise<GmailUserCredential> {
    if (credential.rejected)
      throw new PluginError('authorization', 'Gmail rejected this authorization.');
    const tokens = await gmailOauth.authorize(credential.account.id, false, signal);
    signal.throwIfAborted();
    if (tokens.accessToken === credential.tokens.accessToken) return credential;
    const account = await gmailOauth.getAccount(tokens.accessToken, signal);
    if (account.id !== credential.account.id)
      throw new PluginError('authorization', 'Google returned a different Gmail account.');
    return { ...credential, tokens };
  }

  confirm(attemptId: string) {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      const pending = this.requireReview(attemptId);
      try {
        pending.credential = await this.refreshed(pending.credential, signal);
        pending.requiresDisconnect = await this.requiresDisconnect(
          pending.previousId,
          pending.credential.account.id,
        );
        signal.throwIfAborted();
        pending.status = pending.requiresDisconnect ? 'review' : 'ready';
        return this.project();
      } catch (error) {
        // A failed confirmation requires a fresh explicit authorization attempt.
        this.pending = undefined;
        throw error;
      }
    });
  }

  prepare(attemptId: string, signal: AbortSignal) {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const pending = this.requireReview(attemptId);
      if (
        pending.status !== 'ready' ||
        (await this.requiresDisconnect(pending.previousId, pending.credential.account.id))
      )
        throw new PluginError(
          'requires-disconnect',
          'Disconnect before changing the Gmail account.',
        );
      try {
        pending.credential = await this.refreshed(pending.credential, signal);
      } catch (error) {
        this.pending = undefined;
        throw error;
      }
      return {
        credential: asCredential(pending.credential),
        accountLabel: pending.credential.account.label,
        signal,
      };
    });
  }

  commit(attemptId: string, accountLabel: string, signal: AbortSignal) {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const pending = this.requireReview(attemptId);
      if (pending.status !== 'ready')
        throw new PluginError('authorization', 'Confirm the Gmail connection first.');
      this.pending = undefined;
      return this.store.commit(asCredential(pending.credential), accountLabel, signal, {
        authorizationId: pending.previousId,
      });
    });
  }

  resolveCredential(id: string, callerSignal?: AbortSignal): Promise<PluginCredential> {
    if (callerSignal?.aborted) return Promise.reject(cancelled());
    let operation = this.resolutions.get(id);
    if (!operation) {
      const signal = AbortSignal.any([this.lifetime.signal, this.renewal.signal]);
      operation = this.serialize(async () => {
        signal.throwIfAborted();
        const failure = this.failures.get(id);
        if (failure === 'authorization')
          throw new PluginError(failure, 'Gmail authorization requires reconnecting.');
        const grant = await this.store.getGrant(id).catch((error: unknown) => {
          this.store.notifyChanged();
          throw error;
        });
        const parsed = GmailUserCredentialSchema.safeParse(grant?.credential);
        if (!parsed.success) {
          this.store.notifyChanged();
          throw new PluginError('authorization', 'Gmail credentials are missing.');
        }
        const previous = parsed.data;
        try {
          const credential = await this.refreshed(previous, signal);
          if (
            credential !== previous &&
            !(await this.store.updateCredential(id, asCredential(credential), signal))
          )
            throw cancelled();
          signal.throwIfAborted();
          if (this.failures.delete(id)) this.store.notifyChanged();
          return asCredential(credential);
        } catch (error) {
          if (signal.aborted) throw cancelled();
          const reason = error instanceof PluginError ? error.reason : 'storage';
          this.failures.set(id, reason);
          if (reason === 'authorization')
            await this.store
              .updateCredential(id, asCredential({ ...previous, rejected: true }), signal)
              .catch(() => {});
          this.store.notifyChanged();
          throw new PluginError(reason, 'Gmail authorization requires reconnecting.');
        }
      });
      this.resolutions.set(id, operation);
      const current = operation;
      void operation
        .finally(() => {
          if (this.resolutions.get(id) === current) this.resolutions.delete(id);
        })
        .catch(() => {});
    }
    return callerSignal ? waitForCaller(operation, callerSignal) : operation;
  }

  async describeConnection(id: string): Promise<PluginConnectionStatus> {
    // Local projection only: reading the plugin list never renews a token or checks Gmail.
    const grant = await this.store.getGrant(id);
    const parsed = GmailUserCredentialSchema.safeParse(grant?.credential);
    if (!parsed.success) return { status: 'needs-reauthorization', reason: 'authorization' };
    const credential = parsed.data;
    const reason = this.failures.get(id) ?? (credential.rejected ? 'authorization' : undefined);
    return {
      status:
        reason === 'authorization' ? 'needs-reauthorization' : reason ? 'unavailable' : 'connected',
      reason,
      managementUrl: 'https://myaccount.google.com/permissions',
    };
  }

  async rejectCredential(id: string, rejected: PluginCredential) {
    const signal = AbortSignal.any([this.lifetime.signal, this.renewal.signal]);
    await this.serialize(async () => {
      signal.throwIfAborted();
      const current = GmailUserCredentialSchema.safeParse(
        (await this.store.getGrant(id))?.credential,
      );
      const sent = GmailUserCredentialSchema.safeParse(rejected);
      if (
        !current.success ||
        !sent.success ||
        current.data.tokens.accessToken !== sent.data.tokens.accessToken
      )
        return;
      this.failures.set(id, 'authorization');
      await gmailOauth.clearToken(sent.data.tokens.accessToken, signal).catch(() => {});
      signal.throwIfAborted();
      try {
        await this.store.updateCredential(
          id,
          asCredential({ ...current.data, rejected: true }),
          signal,
        );
      } finally {
        this.store.notifyChanged();
      }
    });
  }

  async prepareRevocation(id: string) {
    const credential = GmailUserCredentialSchema.parse((await this.store.getGrant(id))?.credential);
    return {
      managementUrl: 'https://myaccount.google.com/permissions',
      revoke: (signal: AbortSignal) => gmailOauth.revoke(credential.account.id, signal),
    };
  }

  cancel() {
    this.interrupt();
    return this.serialize(async () => {
      this.pending = undefined;
      return this.project();
    });
  }
  interrupt() {
    this.attempt.abort();
    this.attempt = new AbortController();
  }
  invalidateGrant() {
    this.renewal.abort();
    this.renewal = new AbortController();
    this.resolutions.clear();
    this.failures.clear();
    this.store.notifyChanged();
  }
  async stop() {
    this.attempt.abort();
    this.renewal.abort();
    this.lifetime.abort();
    await this.operations.catch(() => {});
    this.pending = undefined;
    this.resolutions.clear();
    this.failures.clear();
  }
}

function waitForCaller<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(cancelled());
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
