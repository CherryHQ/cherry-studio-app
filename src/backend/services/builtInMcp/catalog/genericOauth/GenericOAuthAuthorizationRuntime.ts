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
import { mcpOauth } from './mcpOauth';
import {
  McpOAuthCredentialSchema,
  type McpOAuthApplication,
  type McpOAuthCredential,
} from './mcpOauthCredentials';

export type GenericOAuthConfig = {
  readonly pluginId: string;
  /** The MCP resource endpoint this authorization grants access to. */
  readonly resourceUrl: string;
  /** Saved server name, used as the account label when the service exposes no identity tool. */
  readonly serverName: string;
};

type Pending =
  | {
      status: 'callback';
      id: string;
      application: McpOAuthApplication;
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
      credential: McpOAuthCredential;
      requiresDisconnect: boolean;
    }
  | { status: 'expired' | 'denied'; id: string };

const asCredential = (value: McpOAuthCredential): PluginCredential =>
  JSON.parse(JSON.stringify(value));
const cancelled = (serverName: string) =>
  new PluginError('cancelled', `${serverName} authorization cancelled.`);

/**
 * Owns one in-memory authorization attempt and grant-scoped shared renewal for a
 * generic MCP OAuth server. Mirrors the bundled plugin runtimes so the shared
 * authorization manager can drive it unchanged.
 */
export class GenericOAuthAuthorizationRuntime implements PluginAuthorizationRuntime {
  private operations: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();
  private attempt = new AbortController();
  private renewal = new AbortController();
  private pending?: Pending;
  private readonly resolutions = new Map<string, Promise<PluginCredential>>();
  private readonly failures = new Map<string, PluginErrorReason>();

  constructor(
    private readonly store: PluginAuthorizationStore,
    private readonly config: GenericOAuthConfig,
  ) {}

  private get resource() {
    return new URL(this.config.resourceUrl);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations
      .catch(() => {})
      .then(async () => {
        if (this.lifetime.signal.aborted) throw cancelled(this.config.serverName);
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
            throw cancelled(this.config.serverName);
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
    return this.attempt.signal;
  }

  begin() {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      this.project();
      if (this.pending && ['callback', 'review', 'ready'].includes(this.pending.status))
        return this.project();
      const application = await mcpOauth.getApplication(
        this.store,
        this.resource,
        this.config.pluginId,
        signal,
      );
      const previousId = await this.store.getCurrentAuthorizationId();
      const challenge = await mcpOauth.challenge(application, this.resource);
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
      const parsed = McpOAuthCredentialSchema.safeParse(current?.credential);
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
      if (!pending || pending.id !== attemptId) throw cancelled(this.config.serverName);
      // Only the first valid callback consumes a code. Duplicate delivery returns the current state.
      if (pending.status !== 'callback') return this.project();
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        throw new PluginError('request', 'Invalid authorization callback.');
      }
      const expected = new URL(pending.application.redirectUrl);
      if (
        rawUrl.length > 16_384 ||
        url.protocol !== expected.protocol ||
        url.host !== expected.host ||
        url.pathname !== expected.pathname ||
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
          throw new PluginError(
            'request',
            `${this.config.serverName} could not complete authorization.`,
          );
        }
        return this.project();
      }
      const code = url.searchParams.get('code');
      if (url.searchParams.getAll('code').length !== 1 || !code || !/^\S{1,4096}$/.test(code))
        throw new PluginError('request', 'Invalid authorization callback.');
      // Drop the verifier before exchange: failed/ambiguous exchanges require a new attempt.
      this.pending = undefined;
      const tokens = await mcpOauth.exchangeCode(
        pending.application,
        code,
        pending.verifier,
        this.resource,
        signal,
      );
      const account = { id: this.resource.href, label: this.config.serverName };
      const requiresDisconnect = await this.requiresDisconnect(pending.previousId, account.id);
      signal.throwIfAborted();
      this.pending = {
        status: 'review',
        id: pending.id,
        previousId: pending.previousId,
        requiresDisconnect,
        credential: { version: 1, application: pending.application, tokens, account },
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
    throw new PluginError(
      'authorization',
      `${this.config.serverName} authorization is no longer available.`,
    );
  }

  private async refreshed(
    credential: McpOAuthCredential,
    signal: AbortSignal,
  ): Promise<McpOAuthCredential> {
    if (credential.rejected)
      throw new PluginError(
        'authorization',
        `${this.config.serverName} rejected this authorization.`,
      );
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
      throw new PluginError('authorization', `${this.config.serverName} authorization expired.`);
    const tokens = await mcpOauth.refresh(
      credential.application,
      credential.tokens,
      this.resource,
      signal,
    );
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
          `Disconnect before changing the ${this.config.serverName} account.`,
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
        throw new PluginError(
          'authorization',
          `Confirm the ${this.config.serverName} connection first.`,
        );
      this.pending = undefined;
      return this.store.commit(asCredential(pending.credential), accountLabel, signal, {
        authorizationId: pending.previousId,
      });
    });
  }

  resolveCredential(id: string, callerSignal?: AbortSignal): Promise<PluginCredential> {
    if (callerSignal?.aborted) return Promise.reject(cancelled(this.config.serverName));
    let operation = this.resolutions.get(id);
    if (!operation) {
      const signal = this.renewal.signal;
      operation = this.serialize(async () => {
        signal.throwIfAborted();
        const failure = this.failures.get(id);
        if (failure)
          throw new PluginError(failure, `${this.config.serverName} requires reconnecting.`);
        const grant = await this.store.getGrant(id).catch((error: unknown) => {
          this.store.notifyChanged();
          throw error;
        });
        const parsed = McpOAuthCredentialSchema.safeParse(grant?.credential);
        if (!parsed.success) {
          this.store.notifyChanged();
          throw new PluginError(
            'authorization',
            `${this.config.serverName} credentials are missing.`,
          );
        }
        const previous = parsed.data;
        try {
          const credential = await this.refreshed(previous, signal);
          if (
            credential !== previous &&
            !(await this.store.updateCredential(id, asCredential(credential), signal))
          )
            throw cancelled(this.config.serverName);
          signal.throwIfAborted();
          return asCredential(credential);
        } catch (error) {
          if (signal.aborted) throw cancelled(this.config.serverName);
          const reason = error instanceof PluginError ? error.reason : 'storage';
          this.failures.set(id, reason);
          if (reason === 'authorization')
            await this.store
              .updateCredential(id, asCredential({ ...previous, rejected: true }), signal)
              .catch(() => {});
          this.store.notifyChanged();
          throw new PluginError(reason, `${this.config.serverName} requires reconnecting.`);
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
    return callerSignal
      ? waitForCaller(operation, callerSignal, this.config.serverName)
      : operation;
  }

  async describeConnection(id: string): Promise<PluginConnectionStatus> {
    // Local projection only: reading the plugin list never renews a token or checks the service.
    const grant = await this.store.getGrant(id);
    const parsed = McpOAuthCredentialSchema.safeParse(grant?.credential);
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
    };
  }

  async rejectCredential(id: string, rejected: PluginCredential) {
    const signal = this.renewal.signal;
    await this.serialize(async () => {
      signal.throwIfAborted();
      const current = McpOAuthCredentialSchema.safeParse(
        (await this.store.getGrant(id))?.credential,
      );
      const sent = McpOAuthCredentialSchema.safeParse(rejected);
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

  /** stop() aborts the current attempt and renewal; generations replaced afterwards start aborted. */
  private nextGeneration() {
    const controller = new AbortController();
    if (this.lifetime.signal.aborted) controller.abort(this.lifetime.signal.reason);
    return controller;
  }
  interrupt() {
    this.attempt.abort();
    this.attempt = this.nextGeneration();
  }
  invalidateGrant() {
    this.renewal.abort();
    this.renewal = this.nextGeneration();
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

function waitForCaller<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  serverName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(cancelled(serverName));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
