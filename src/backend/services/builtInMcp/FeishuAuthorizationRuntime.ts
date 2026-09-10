import { randomUUID } from 'expo-crypto';

import type {
  PluginAuthorizationStore,
  PluginGrant,
} from '@/backend/data/services/PluginAuthorizationService';
import { PluginError, type PluginAuthorizationState } from '@/shared/contracts/plugins';
import type { PluginCredential } from '@/shared/data/types/plugin';

import {
  FeishuAuthorizationStateSchema,
  type FeishuAuthorizationStoredState,
  FeishuUserCredentialSchema,
  type FeishuUserCredential,
} from './feishuAuthorizationState';
import { FeishuApplicationSchema, feishuOauth, missingFeishuDocumentScopes } from './feishuOauth';
import { migrateFeishuAuthorization } from './migrateFeishuAuthorization';
import type { PluginAuthorizationRuntime } from './pluginDefinition';

/** One method runtime owns durable attempts and renewal; observation only schedules its steps. */
export class FeishuAuthorizationRuntime implements PluginAuthorizationRuntime {
  private operations: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();
  private attempt = new AbortController();
  private renewal = new AbortController();
  private readonly resolutions = new Map<string, Promise<PluginCredential>>();
  private initialized = false;
  // Preserve one-time exchange results in memory if SQLite rejects the first write.
  private unsavedState: FeishuAuthorizationStoredState | undefined;
  private unsavedGrant: { previous: PluginGrant; credential: FeishuUserCredential } | undefined;

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

  private async save(state: FeishuAuthorizationStoredState) {
    this.unsavedState = state;
    try {
      await this.store.writeState(JSON.parse(JSON.stringify(state)));
      this.unsavedState = undefined;
    } catch {
      throw new PluginError('storage', 'Could not save Feishu authorization.');
    }
  }

  private async read(): Promise<FeishuAuthorizationStoredState> {
    try {
      if (!this.initialized) {
        await migrateFeishuAuthorization(this.store);
        this.initialized = true;
      }
      if (this.unsavedState) await this.save(this.unsavedState);
      const state = FeishuAuthorizationStateSchema.parse(await this.store.readState());
      if (state.pending?.status === 'waiting' && Date.now() >= state.pending.expiresAt) {
        state.pending = { status: 'expired', id: state.pending.id };
        await this.save(state);
      }
      return state;
    } catch (error) {
      if (error instanceof PluginError) throw error;
      throw new PluginError('storage', 'Could not read Feishu authorization.');
    }
  }

  private project(state: FeishuAuthorizationStoredState): PluginAuthorizationState {
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
      await this.save(state);
      return this.project(state);
    });
  }

  useApplication(fields: Record<string, string>) {
    this.interrupt();
    return this.serialize(async () => {
      const state = await this.read();
      state.application = FeishuApplicationSchema.parse(fields);
      delete state.pending;
      await this.save(state);
      return this.project(state);
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
      await this.save(state);
      if (Date.now() >= pending.expiresAt) {
        state.pending = { status: 'expired', id: pending.id };
        await this.save(state);
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
          await this.save(state);
          return this.project(state);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
      signal.throwIfAborted();
      if (result.status === 'approved') {
        if ('application' in result) {
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
      await this.save(state);
      return this.project(state);
    });
  }

  private requireApplication(state: FeishuAuthorizationStoredState) {
    if (!state.application)
      throw new PluginError('authorization', 'Feishu application is missing.');
    return state.application;
  }

  private requirePending(state: FeishuAuthorizationStoredState, id: string) {
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

  private async saveGrant(signal: AbortSignal) {
    const unsaved = this.unsavedGrant;
    if (!unsaved) return;
    signal.throwIfAborted();
    let saved;
    try {
      saved = await this.store.updateCredential(
        unsaved.previous,
        JSON.parse(JSON.stringify(unsaved.credential)),
        signal,
      );
    } catch {
      if (signal.aborted) throw new PluginError('cancelled', 'Feishu authorization cancelled.');
      throw new PluginError('storage', 'Could not save renewed Feishu authorization.');
    }
    this.unsavedGrant = undefined;
    if (!saved)
      throw new PluginError(
        'authorization',
        'Feishu user authorization was replaced or disconnected.',
      );
  }

  resolveCredential(grant: PluginGrant, callerSignal?: AbortSignal): Promise<PluginCredential> {
    if (callerSignal?.aborted)
      return Promise.reject(new PluginError('cancelled', 'Feishu authorization cancelled.'));
    const shared = this.resolutions.get(grant.id);
    if (shared) return callerSignal ? waitForCaller(shared, callerSignal) : shared;
    const signal = AbortSignal.any([this.lifetime.signal, this.renewal.signal]);
    const operation = this.serialize(async () => {
      signal.throwIfAborted();
      await this.read();
      await this.saveGrant(signal);
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
        this.unsavedGrant = { previous: current, credential };
        await this.saveGrant(signal);
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
        await this.save(state);
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
      // The grant, MCP identity and removal of the candidate commit in one SQLite transaction.
      const connection = await this.store.commit(
        JSON.parse(JSON.stringify(pending.credential)),
        accountLabel,
        JSON.parse(JSON.stringify(state)),
        signal,
      );
      this.invalidateGrant();
      return connection;
    });
  }

  cancel() {
    this.interrupt();
    return this.serialize(async () => {
      const state = await this.read();
      delete state.pending;
      await this.save(state);
      return this.project(state);
    });
  }

  resetApplication() {
    this.interrupt();
    return this.serialize(async () => {
      const state = await this.read();
      delete state.pending;
      delete state.application;
      await this.save(state);
      return this.project(state);
    });
  }

  interrupt() {
    this.attempt.abort();
    this.attempt = new AbortController();
  }

  invalidateGrant() {
    this.renewal.abort();
    this.renewal = new AbortController();
    this.unsavedGrant = undefined;
    this.resolutions.clear();
  }

  async stop() {
    this.attempt.abort();
    this.renewal.abort();
    this.lifetime.abort();
    await this.operations.catch(() => {});
    this.unsavedState = undefined;
    this.unsavedGrant = undefined;
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
