import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as z from 'zod';

import { PluginError, type PluginAuthorizationState } from '@/shared/contracts/plugins';

import { FEISHU_USER_CREDENTIAL_PREFIX, isFeishuUserCredential } from './feishuAuthorization';
import {
  FeishuApplicationSchema,
  feishuOauth,
  FeishuTokensSchema,
  hasFeishuDocumentScopes,
} from './feishuOauth';

const STORE_KEY = 'plugins.feishu.authorization.v1';
const STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const GrantSchema = z.object({
  id: z.string().uuid(),
  application: FeishuApplicationSchema,
  tokens: FeishuTokensSchema,
});
const WaitingSchema = z.object({
  status: z.literal('waiting'),
  id: z.string().uuid(),
  stage: z.enum(['registration', 'user']),
  deviceCode: z.string().min(1).max(16_384),
  userCode: z.string().min(1).max(512),
  verificationUrl: z.string().max(4096),
  expiresAt: z.number().finite(),
  intervalMs: z.number().positive(),
  nextPollAt: z.number().finite(),
});
const StateSchema = z.object({
  application: FeishuApplicationSchema.optional(),
  current: GrantSchema.optional(),
  pending: z
    .discriminatedUnion('status', [
      WaitingSchema,
      z.object({ status: z.literal('ready'), grant: GrantSchema }),
      z.object({
        status: z.enum(['expired', 'denied', 'unsupported-account']),
        id: z.string().uuid(),
      }),
    ])
    .optional(),
});
type StoredState = z.infer<typeof StateSchema>;
type Grant = z.infer<typeof GrantSchema>;

/**
 * Owned and stopped by McpRuntimeService, one per application host generation.
 * No autonomous timers: screens request one poll at a time only while foregrounded.
 * One queue coordinates device exchanges, rotated tokens, grant commits and deletion.
 */
export class FeishuAuthorizationRuntime {
  private pending: Promise<unknown> = Promise.resolve();
  private lifetime = new AbortController();
  private attempt = new AbortController();
  // If Keychain rejects a write after a one-time exchange, retain the issued material only
  // in backend memory and retry persistence before doing any more network work.
  private unsaved: StoredState | undefined;

  constructor(private readonly getCommittedCredential: () => Promise<string | undefined>) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending
      .catch(() => {})
      .then(() => {
        this.lifetime.signal.throwIfAborted();
        return operation();
      })
      .catch((error: unknown) => {
        if (this.lifetime.signal.aborted || (error instanceof Error && error.name === 'AbortError'))
          throw new PluginError('cancelled', 'Feishu authorization cancelled.');
        throw error;
      });
    this.pending = result;
    return result;
  }

  private async save(state: StoredState) {
    this.unsaved = state;
    try {
      await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(state), STORE_OPTIONS);
      this.unsaved = undefined;
    } catch {
      throw new PluginError('storage', 'Could not securely save Feishu authorization.');
    }
  }

  private async read(): Promise<StoredState> {
    if (this.unsaved) await this.save(this.unsaved);
    try {
      const text = await SecureStore.getItemAsync(STORE_KEY);
      const state = text ? StateSchema.parse(JSON.parse(text)) : {};
      if (state.current || state.pending?.status === 'ready') {
        const committed = await this.getCommittedCredential();
        if (
          state.pending?.status === 'ready' &&
          committed === `${FEISHU_USER_CREDENTIAL_PREFIX}${state.pending.grant.id}`
        ) {
          // SQLite committed before the process stopped, but Keychain still has the
          // candidate. Promote it before cancellation can discard a live credential.
          state.current = state.pending.grant;
          state.pending = undefined;
          await this.save(state);
        } else if (
          state.current &&
          committed !== `${FEISHU_USER_CREDENTIAL_PREFIX}${state.current.id}`
        ) {
          // Finish interrupted disconnect/manual replacement cleanup. Never resurrect
          // a connection from Keychain alone after a DB restore or removal.
          state.current = undefined;
          if (!state.pending) state.application = undefined;
          await this.save(state);
        }
      }
      if (state.pending?.status === 'waiting' && Date.now() >= state.pending.expiresAt) {
        state.pending = { status: 'expired', id: state.pending.id };
        await this.save(state);
      }
      return state;
    } catch {
      throw new PluginError('storage', 'Could not read secure Feishu authorization.');
    }
  }

  private project(state: StoredState): PluginAuthorizationState {
    const pending = state.pending;
    if (!pending) return { status: state.application ? 'application-ready' : 'idle' };
    if (pending.status === 'ready') return { status: 'ready', attemptId: pending.grant.id };
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
    const signal = this.attempt.signal;
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

  poll(attemptId: string, observationSignal?: AbortSignal) {
    const signal = this.attempt.signal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      const state = await this.read();
      const pending = state.pending;
      if (observationSignal?.aborted) return this.project(state);
      if (!pending || pending.status !== 'waiting') return this.project(state);
      if (pending.id !== attemptId)
        throw new PluginError('cancelled', 'Feishu authorization replaced.');
      if (Date.now() < pending.nextPollAt) return this.project(state);
      // Persist scheduling before dispatch: a network failure or process restart must not
      // reset the server's interval. The absolute deadline also bounds the HTTP request.
      pending.nextPollAt = Date.now() + pending.intervalMs;
      await this.save(state);
      if (observationSignal?.aborted) return this.project(state);
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
          // Save registration immediately. A retry of step two never creates another app.
          state.application = result.application;
          state.pending = undefined;
        } else {
          state.pending = {
            status: 'ready',
            grant: {
              id: pending.id,
              application: this.requireApplication(state),
              tokens: result.tokens,
            },
          };
        }
      } else if (result.status === 'pending' || result.status === 'slow-down') {
        if (result.status === 'slow-down') pending.intervalMs += 5000;
        pending.nextPollAt = Date.now() + pending.intervalMs;
      } else {
        state.pending = { status: result.status, id: pending.id };
      }
      await this.save(state);
      return this.project(state);
    });
  }

  private requireApplication(state: StoredState) {
    if (!state.application)
      throw new PluginError('authorization', 'Feishu application is missing.');
    return state.application;
  }

  private findGrant(state: StoredState, id: string): Grant {
    if (state.pending?.status === 'ready' && state.pending.grant.id === id)
      return state.pending.grant;
    if (state.current?.id === id) return state.current;
    throw new PluginError('authorization', 'Feishu user authorization is no longer available.');
  }

  private async validToken(state: StoredState, grant: Grant, signal: AbortSignal) {
    if (!hasFeishuDocumentScopes(grant.tokens))
      throw new PluginError(
        'access',
        'Approve all document tool permissions in Feishu before connecting.',
      );
    if (grant.tokens.expiresAt <= Date.now() + 60_000) {
      if (!grant.tokens.refreshToken || grant.tokens.refreshExpiresAt <= Date.now())
        throw new PluginError(
          'authorization',
          'Feishu user authorization expired. Reauthorize the existing application.',
        );
      // Check secure storage is writable before consuming a rotating refresh token.
      await this.save(state);
      grant.tokens = await feishuOauth.refresh(grant.application, grant.tokens, signal);
      // Save a successful exchange even if its caller cancelled while it was arriving.
      await this.save(state);
      if (!hasFeishuDocumentScopes(grant.tokens))
        throw new PluginError('access', 'Feishu document permissions were reduced. Reauthorize.');
    }
    signal.throwIfAborted();
    return grant.tokens.accessToken;
  }

  getUserToken = (credential: string, callerSignal?: AbortSignal): Promise<string> => {
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, this.lifetime.signal])
      : this.lifetime.signal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      const state = await this.read();
      if (!isFeishuUserCredential(credential))
        throw new PluginError('authorization', 'Invalid Feishu user credential reference.');
      const grant = this.findGrant(state, credential.slice(FEISHU_USER_CREDENTIAL_PREFIX.length));
      return this.validToken(state, grant, signal);
    });
  };

  get attemptSignal() {
    return this.attempt.signal;
  }

  prepare(attemptId: string, signal = this.attempt.signal) {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const state = await this.read();
      const grant = this.findGrant(state, attemptId);
      const token = await this.validToken(state, grant, signal);
      const accountLabel = await feishuOauth.getAccountLabel(token, signal);
      signal.throwIfAborted();
      return { credential: `${FEISHU_USER_CREDENTIAL_PREFIX}${grant.id}`, accountLabel, signal };
    });
  }

  commit<T>(attemptId: string, signal: AbortSignal, saveConnection: () => Promise<T>) {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const state = await this.read();
      const grant = this.findGrant(state, attemptId);
      const connection = await saveConnection();
      // SecureStore and SQLite are not one transaction. The already durable pending grant
      // resolves the DB reference after a crash here; repeating completion is safe.
      state.current = grant;
      state.pending = undefined;
      // This is compaction, not the first credential write: the candidate is already
      // durable and the DB commit succeeded. Retain a retry without reporting a false
      // connection failure (which would send the user through authorization again).
      await this.save(state).catch(() => {});
      return connection;
    });
  }

  cancel() {
    this.interrupt();
    return this.serialize(async () => {
      const state = await this.read();
      state.pending = undefined;
      await this.save(state);
      return this.project(state);
    });
  }

  /** Explicit recovery when the registered application was deleted or cannot be authorized. */
  resetApplication() {
    this.interrupt();
    return this.serialize(async () => {
      const state = await this.read();
      state.pending = undefined;
      state.application = undefined;
      // An already connected grant keeps its own application until replacement succeeds.
      await this.save(state);
      return this.project(state);
    });
  }

  /** Invalidate immediately, before a queued completion can commit after disconnect. */
  interrupt() {
    this.attempt.abort();
    this.attempt = new AbortController();
  }

  clear() {
    return this.serialize(async () => {
      try {
        await SecureStore.deleteItemAsync(STORE_KEY);
        this.unsaved = undefined;
      } catch {
        throw new PluginError('storage', 'Could not remove secure Feishu authorization.');
      }
    });
  }

  async stop() {
    this.attempt.abort();
    this.lifetime.abort();
    await this.pending.catch(() => {});
    this.unsaved = undefined;
  }
}
