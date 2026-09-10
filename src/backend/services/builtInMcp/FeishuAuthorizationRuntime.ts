import { randomUUID } from 'expo-crypto';

import { PluginError, type PluginAuthorizationState } from '@/shared/contracts/plugins';
import type { PluginCredential } from '@/shared/data/types/plugin';

import { FeishuUserCredentialSchema, type FeishuUserCredential } from './feishuAuthorizationState';
import {
  FeishuApplicationSchema,
  feishuOauth,
  missingFeishuDocumentScopes,
  type FeishuApplication,
} from './feishuOauth';
import type {
  PluginAuthorizationRuntime,
  PluginAuthorizationStore,
  PluginGrant,
} from './pluginDefinition';

type AuthorizationState = {
  application?: FeishuApplication;
  pending?:
    | (Awaited<ReturnType<typeof feishuOauth.beginUser>> & {
        status: 'waiting';
        id: string;
        stage: 'registration' | 'user';
      })
    | { status: 'ready'; id: string; credential: FeishuUserCredential }
    | { status: 'expired' | 'denied' | 'unsupported-account'; id: string };
};

/** One method runtime owns in-memory attempts and shared renewal. Restart interrupted flows. */
export class FeishuAuthorizationRuntime implements PluginAuthorizationRuntime {
  private operations: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();
  private attempt = new AbortController();
  private renewal = new AbortController();
  private readonly resolutions = new Map<string, Promise<PluginCredential>>();
  private state: AuthorizationState | undefined;

  constructor(private readonly store: PluginAuthorizationStore) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations
      .catch(() => {})
      .then(() => {
        this.lifetime.signal.throwIfAborted();
        return operation();
      })
      .catch((error: unknown) => {
        if (
          this.lifetime.signal.aborted ||
          // Native abort reasons can come from another realm and fail instanceof Error.
          (typeof error === 'object' &&
            error !== null &&
            'name' in error &&
            error.name === 'AbortError')
        )
          throw new PluginError('cancelled', 'Feishu authorization cancelled.');
        throw error;
      });
    this.operations = result;
    return result;
  }

  private async read(): Promise<AuthorizationState> {
    if (!this.state) {
      const application = await this.store.readApplication();
      this.state = {
        application: application ? FeishuApplicationSchema.parse(application) : undefined,
      };
    }
    const pending = this.state.pending;
    if (pending?.status === 'waiting' && Date.now() >= pending.expiresAt)
      this.state.pending = { status: 'expired', id: pending.id };
    return this.state;
  }

  private project(state: AuthorizationState): PluginAuthorizationState {
    const pending = state.pending;
    if (!pending)
      return state.application
        ? { status: 'application-ready', applicationId: state.application.appId }
        : { status: 'idle' };
    if (pending.status === 'ready') return { status: 'ready', attemptId: pending.id };
    if (pending.status !== 'waiting') return { status: pending.status, attemptId: pending.id };
    return {
      status: 'waiting',
      attemptId: pending.id,
      stage: pending.stage,
      verificationUrl: pending.verificationUrl,
      userCode: pending.userCode,
      expiresAt: pending.expiresAt,
      nextPollAt: pending.nextPollAt,
    };
  }

  getState() {
    return this.serialize(async () => this.project(await this.read()));
  }

  begin() {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      const state = await this.read();
      if (state.pending?.status === 'waiting' || state.pending?.status === 'ready')
        return this.project(state);
      const stage = state.application ? 'user' : 'registration';
      const challenge = state.application
        ? await feishuOauth.beginUser(state.application, signal)
        : await feishuOauth.beginRegistration(signal);
      signal.throwIfAborted();
      state.pending = { ...challenge, id: randomUUID(), status: 'waiting', stage };
      return this.project(state);
    });
  }

  useApplication(fields: Record<string, string>) {
    this.interrupt();
    return this.serialize(async () => {
      const application = FeishuApplicationSchema.parse(fields);
      await this.store.writeApplication(application);
      this.state = { application };
      return this.project(this.state);
    });
  }

  poll(attemptId: string) {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      const state = await this.read();
      const pending = state.pending;
      if (!pending || pending.status !== 'waiting') return this.project(state);
      if (pending.id !== attemptId)
        throw new PluginError('cancelled', 'Feishu authorization replaced.');
      if (Date.now() < pending.nextPollAt) return this.project(state);
      pending.nextPollAt = Date.now() + pending.intervalMs;
      if (Date.now() >= pending.expiresAt) {
        state.pending = { status: 'expired', id: pending.id };
        return this.project(state);
      }
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(), pending.expiresAt - Date.now());
      const requestSignal = AbortSignal.any([signal, deadline.signal]);
      let result;
      try {
        result =
          pending.stage === 'registration'
            ? await feishuOauth.pollRegistration(pending.deviceCode, requestSignal)
            : await feishuOauth.pollUser(
                this.requireApplication(state),
                pending.deviceCode,
                requestSignal,
              );
      } catch (error) {
        if (deadline.signal.aborted && !signal.aborted) {
          state.pending = { status: 'expired', id: pending.id };
          return this.project(state);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
      signal.throwIfAborted();
      if (result.status === 'approved') {
        if ('application' in result) {
          await this.store.writeApplication(result.application);
          state.application = result.application;
          delete state.pending;
        } else {
          state.pending = {
            status: 'ready',
            id: pending.id,
            credential: {
              version: 1,
              application: this.requireApplication(state),
              tokens: result.tokens,
            },
          };
        }
      } else if (result.status === 'pending' || result.status === 'slow-down') {
        if (result.status === 'slow-down') pending.intervalMs += 5000;
        pending.nextPollAt = Date.now() + pending.intervalMs;
      } else state.pending = { status: result.status, id: pending.id };
      return this.project(state);
    });
  }

  private requireApplication(state: AuthorizationState) {
    if (!state.application)
      throw new PluginError('authorization', 'Feishu application is missing.');
    return state.application;
  }

  private requirePending(state: AuthorizationState, id: string) {
    if (state.pending?.status === 'ready' && state.pending.id === id) return state.pending;
    throw new PluginError('authorization', 'Feishu user authorization is no longer available.');
  }

  private assertGrantedScopes(credential: FeishuUserCredential, reduced: boolean) {
    const missing = missingFeishuDocumentScopes(credential.tokens);
    if (missing.length)
      throw new PluginError(
        'access',
        reduced
          ? `Feishu document permissions were reduced (${missing.join(', ')}). Reauthorize.`
          : `Approve the missing Feishu document permissions before connecting: ${missing.join(', ')}.`,
      );
    if (!credential.tokens.refreshToken)
      throw new PluginError(
        'access',
        'Feishu did not grant offline access, so this authorization cannot renew. Approve offline access and retry.',
      );
  }

  private async refresh(credential: FeishuUserCredential, signal: AbortSignal) {
    signal.throwIfAborted();
    this.assertGrantedScopes(credential, false);
    if (credential.tokens.expiresAt > Date.now() + 60_000) return credential;
    if (credential.tokens.refreshExpiresAt <= Date.now())
      throw new PluginError(
        'authorization',
        'Feishu user authorization expired. Reauthorize the existing application.',
      );
    const tokens = await feishuOauth.refresh(credential.application, credential.tokens, signal);
    signal.throwIfAborted();
    return { ...credential, tokens };
  }

  resolveCredential(grant: PluginGrant, callerSignal?: AbortSignal): Promise<PluginCredential> {
    if (callerSignal?.aborted)
      return Promise.reject(new PluginError('cancelled', 'Feishu authorization cancelled.'));
    const shared = this.resolutions.get(grant.id);
    if (shared) return callerSignal ? waitForCaller(shared, callerSignal) : shared;
    const signal = AbortSignal.any([this.lifetime.signal, this.renewal.signal]);
    const operation = this.serialize(async () => {
      signal.throwIfAborted();
      const current = await this.store.getGrant(grant.id);
      if (!current)
        throw new PluginError('authorization', 'Feishu user authorization is no longer available.');
      const parsed = FeishuUserCredentialSchema.safeParse(current.credential);
      if (!parsed.success)
        throw new PluginError(
          'authorization',
          'Feishu user credentials are unavailable. Reauthorize the account.',
        );
      const credential = await this.refresh(parsed.data, signal);
      if (credential !== parsed.data) {
        const saved = await this.store
          .updateCredential(current.id, JSON.parse(JSON.stringify(credential)), signal)
          .catch(() => {
            if (signal.aborted)
              throw new PluginError('cancelled', 'Feishu authorization cancelled.');
            throw new PluginError(
              'storage',
              'Could not save renewed Feishu authorization. Authorize again.',
            );
          });
        if (!saved)
          throw new PluginError(
            'authorization',
            'Feishu authorization was replaced or disconnected.',
          );
        this.assertGrantedScopes(credential, true);
      }
      signal.throwIfAborted();
      return JSON.parse(JSON.stringify(credential)) as PluginCredential;
    });
    this.resolutions.set(grant.id, operation);
    void operation
      .finally(() => {
        if (this.resolutions.get(grant.id) === operation) this.resolutions.delete(grant.id);
      })
      .catch(() => {});
    return callerSignal ? waitForCaller(operation, callerSignal) : operation;
  }

  get attemptSignal() {
    return AbortSignal.any([this.lifetime.signal, this.attempt.signal]);
  }

  prepare(attemptId: string, signal = this.attemptSignal) {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const state = await this.read();
      const pending = this.requirePending(state, attemptId);
      const credential = await this.refresh(pending.credential, signal);
      if (credential !== pending.credential) {
        pending.credential = credential;
        this.assertGrantedScopes(credential, true);
      }
      const accountLabel = await feishuOauth.getAccountLabel(credential.tokens.accessToken, signal);
      signal.throwIfAborted();
      return {
        credential: JSON.parse(JSON.stringify(credential)) as PluginCredential,
        accountLabel,
        signal,
      };
    });
  }

  commit(attemptId: string, accountLabel: string, signal: AbortSignal) {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const state = await this.read();
      const pending = this.requirePending(state, attemptId);
      delete state.pending;
      const connection = await this.store.commit(
        JSON.parse(JSON.stringify(pending.credential)),
        accountLabel,
        signal,
      );
      this.invalidateGrant();
      return connection;
    });
  }

  cancel() {
    this.interrupt();
    return this.serialize(async () => {
      if (this.state) delete this.state.pending;
      return this.project(this.state ?? {});
    });
  }

  resetApplication() {
    this.interrupt();
    return this.serialize(async () => {
      await this.store.writeApplication(undefined);
      this.state = {};
      return this.project(this.state);
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
  }

  async stop() {
    this.attempt.abort();
    this.renewal.abort();
    this.lifetime.abort();
    await this.operations.catch(() => {});
    this.state = undefined;
    this.resolutions.clear();
  }
}

/** Cancellation releases this waiter immediately and consumes the shared operation's late result. */
function waitForCaller<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new PluginError('cancelled', 'Feishu authorization cancelled.'));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
