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
import {
  NotionUserCredentialSchema,
  type NotionApplication,
  type NotionUserCredential,
} from './notionCredentials';
import { notionOauth } from './notionOauth';

type Pending =
  | {
      status: 'callback';
      id: string;
      application: NotionApplication;
      previousId?: string;
      state: string;
      verifier: string;
      authorizationUrl: string;
      expiresAt: number;
    }
  | {
      status: 'review' | 'ready';
      id: string;
      previousId?: string;
      credential: NotionUserCredential;
      requiresDisconnect: boolean;
    }
  | { status: 'expired' | 'denied'; id: string };

const asCredential = (value: NotionUserCredential): PluginCredential =>
  JSON.parse(JSON.stringify(value));
const cancelled = () => new PluginError('cancelled', 'Notion authorization cancelled.');

/** Owns one in-memory authorization attempt and grant-scoped shared renewal. */
export class NotionAuthorizationRuntime implements PluginAuthorizationRuntime {
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
    let pending = this.pending;
    if (pending?.status === 'callback' && Date.now() >= pending.expiresAt)
      this.pending = pending = { status: 'expired', id: pending.id };
    if (!pending) return { status: 'idle' };
    if (pending.status === 'callback')
      return {
        status: 'callback',
        attemptId: pending.id,
        stage: 'user',
        authorizationUrl: pending.authorizationUrl,
        redirectUrl: pending.application.redirectUrl,
        expiresAt: pending.expiresAt,
      };
    if (pending.status === 'review')
      return {
        status: 'review',
        attemptId: pending.id,
        accountLabel: pending.credential.account.label,
        requiresDisconnect: pending.requiresDisconnect,
      };
    return { status: pending.status, attemptId: pending.id };
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
      this.project();
      if (this.pending && ['callback', 'review', 'ready'].includes(this.pending.status))
        return this.project();
      const application = await notionOauth.getApplication(this.store, signal);
      const previousId = await this.store.getCurrentAuthorizationId();
      const challenge = await notionOauth.challenge(application);
      signal.throwIfAborted();
      this.pending = {
        status: 'callback',
        id: randomUUID(),
        application,
        previousId,
        ...challenge,
        expiresAt: Date.now() + 10 * 60_000,
      };
      return this.project();
    });
  }

  private async requiresDisconnect(previousId: string | undefined, accountId: string) {
    const currentId = await this.store.getCurrentAuthorizationId();
    if (currentId !== previousId) return true;
    if (!currentId) return false;
    try {
      const current = await this.store.getGrant(currentId);
      const parsed = NotionUserCredentialSchema.safeParse(current?.credential);
      return !parsed.success || parsed.data.account.id !== accountId;
    } catch (error) {
      if (error instanceof PluginError && error.reason === 'authorization') return true;
      throw error;
    }
  }

  receiveCallback(attemptId: string, rawUrl: string) {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      this.project();
      const pending = this.pending;
      if (!pending || pending.id !== attemptId) throw cancelled();
      // Only the first valid callback consumes a code. Duplicate delivery returns the current state.
      if (pending.status !== 'callback') return this.project();
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        throw new PluginError('request', 'Invalid authorization callback.');
      }
      const redirect = new URL(pending.application.redirectUrl);
      if (
        rawUrl.length > 16_384 ||
        url.protocol !== redirect.protocol ||
        url.host !== redirect.host ||
        url.pathname !== redirect.pathname ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.getAll('state').length !== 1 ||
        url.searchParams.get('state') !== pending.state
      )
        throw new PluginError('request', 'Invalid authorization callback.');
      if (url.searchParams.has('error')) {
        if (url.searchParams.getAll('error').length !== 1 || url.searchParams.has('code'))
          throw new PluginError('request', 'Invalid authorization callback.');
        this.pending = { status: 'denied', id: pending.id };
        if (url.searchParams.get('error') !== 'access_denied') {
          this.pending = undefined;
          throw new PluginError('request', 'Notion could not complete authorization.');
        }
        return this.project();
      }
      const code = url.searchParams.get('code');
      if (url.searchParams.getAll('code').length !== 1 || !code || !/^\S{1,4096}$/.test(code))
        throw new PluginError('request', 'Invalid authorization callback.');
      // Drop the verifier before exchange: failed/ambiguous exchanges require a new attempt.
      this.pending = undefined;
      const tokens = await notionOauth.exchangeCode(
        pending.application,
        code,
        pending.verifier,
        signal,
      );
      const account = await notionOauth.getAccount(tokens.accessToken, signal);
      const requiresDisconnect = await this.requiresDisconnect(pending.previousId, account.id);
      signal.throwIfAborted();
      this.pending = {
        status: 'review',
        id: pending.id,
        previousId: pending.previousId,
        requiresDisconnect,
        credential: {
          version: 1,
          application: pending.application,
          tokens,
          account,
        },
      };
      return this.project();
    });
  }

  private requireReview(id: string) {
    if (
      this.pending?.id === id &&
      (this.pending.status === 'review' || this.pending.status === 'ready')
    )
      return this.pending;
    throw new PluginError('authorization', 'Notion authorization is no longer available.');
  }

  private async refreshed(
    credential: NotionUserCredential,
    signal: AbortSignal,
  ): Promise<NotionUserCredential> {
    if (credential.rejected)
      throw new PluginError('authorization', 'Notion rejected this authorization.');
    if (
      credential.tokens.expiresAt === undefined ||
      credential.tokens.expiresAt > Date.now() + 60_000
    )
      return credential;
    if (
      !credential.tokens.refreshToken ||
      (credential.tokens.refreshExpiresAt !== undefined &&
        credential.tokens.refreshExpiresAt <= Date.now())
    )
      throw new PluginError('authorization', 'Notion authorization expired.');
    const tokens = await notionOauth.refresh(credential.application, credential.tokens, signal);
    signal.throwIfAborted();
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
        // Never retry an uncertain rotation of uncommitted credentials.
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
          'Disconnect before changing the Notion account.',
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
        throw new PluginError('authorization', 'Confirm the Notion connection first.');
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
        if (failure) throw new PluginError(failure, 'Notion authorization requires reconnecting.');
        const grant = await this.store.getGrant(id).catch((error: unknown) => {
          this.store.notifyChanged();
          throw error;
        });
        const parsed = NotionUserCredentialSchema.safeParse(grant?.credential);
        if (!parsed.success) {
          this.store.notifyChanged();
          throw new PluginError('authorization', 'Notion credentials are missing.');
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
          throw new PluginError(reason, 'Notion authorization requires reconnecting.');
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
    // Local projection only: reading the plugin list never renews a token or checks Notion.
    const grant = await this.store.getGrant(id);
    const parsed = NotionUserCredentialSchema.safeParse(grant?.credential);
    if (!parsed.success) return { status: 'needs-reauthorization', reason: 'authorization' };
    const credential = parsed.data;
    const reason =
      this.failures.get(id) ??
      (credential.rejected ||
      (credential.tokens.expiresAt !== undefined &&
        credential.tokens.expiresAt <= Date.now() &&
        (!credential.tokens.refreshToken ||
          (credential.tokens.refreshExpiresAt !== undefined &&
            credential.tokens.refreshExpiresAt <= Date.now())))
        ? 'authorization'
        : undefined);
    return {
      status:
        reason === 'authorization' ? 'needs-reauthorization' : reason ? 'unavailable' : 'connected',
      reason,
      managementUrl: 'https://www.notion.so/profile/connections',
    };
  }

  async rejectCredential(id: string, rejected: PluginCredential) {
    const signal = AbortSignal.any([this.lifetime.signal, this.renewal.signal]);
    await this.serialize(async () => {
      signal.throwIfAborted();
      const current = NotionUserCredentialSchema.safeParse(
        (await this.store.getGrant(id))?.credential,
      );
      const sent = NotionUserCredentialSchema.safeParse(rejected);
      if (
        !current.success ||
        !sent.success ||
        current.data.tokens.accessToken !== sent.data.tokens.accessToken
      )
        return;
      this.failures.set(id, 'authorization');
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

  cancel(callbackAttemptId?: string) {
    if (callbackAttemptId)
      return this.serialize(async () => {
        if (this.pending?.status === 'callback' && this.pending.id === callbackAttemptId)
          this.pending = undefined;
        return this.project();
      });
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
