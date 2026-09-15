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
import { enrichDingtalkAccount } from './dingtalkAccount';
import {
  dingtalkAccountLabel,
  DingtalkUserCredentialSchema,
  isSameDingtalkAccount,
  type DingtalkAccount,
  type DingtalkUserCredential,
} from './dingtalkCredentials';
import { dingtalkOauth, DINGTALK_MANAGEMENT_URL, type DingtalkChallenge } from './dingtalkOauth';
import {
  DingtalkPermissionSchema,
  dingtalkPermissionChallenge,
  type DingtalkPermission,
} from './dingtalkPermission';

type Pending =
  | (DingtalkChallenge & {
      status: 'waiting';
      id: string;
      previousId?: string;
      stage: 'user' | 'permission';
      application: Pick<DingtalkUserCredential, 'clientId' | 'clientSecret'>;
    })
  | {
      status: 'review' | 'ready';
      id: string;
      previousId?: string;
      credential: DingtalkUserCredential;
      requiresDisconnect: boolean;
      sameGrant?: boolean;
    }
  | { status: 'expired' | 'denied' | 'unsupported-account'; id: string };
const asCredential = (value: DingtalkUserCredential): PluginCredential =>
  JSON.parse(JSON.stringify(value));
const cancelled = () => new PluginError('cancelled', 'Dingtalk authorization cancelled.');

/** Serializes device-code consumption, grant-scoped renewal and explicit behavior authorization. */
export class DingtalkAuthorizationRuntime implements PluginAuthorizationRuntime {
  private operations: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();
  private attempt = new AbortController();
  private renewal = new AbortController();
  private pending?: Pending;
  private permission?: { id: string; value: DingtalkPermission };
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
    if (pending?.status === 'waiting' && Date.now() >= pending.expiresAt) {
      this.pending = pending = { status: 'expired', id: pending.id };
      this.permission = undefined;
    }
    if (!pending) return { status: 'idle' };
    if (pending.status === 'waiting')
      return {
        status: 'waiting',
        attemptId: pending.id,
        stage: pending.stage,
        verificationUrl: pending.verificationUrl,
        userCode: pending.userCode,
        expiresAt: pending.expiresAt,
        nextPollAt: pending.nextPollAt,
      };
    if (pending.status === 'review')
      return {
        status: 'review',
        attemptId: pending.id,
        accountLabel: dingtalkAccountLabel(pending.credential.account),
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
  private get renewalSignal() {
    return AbortSignal.any([this.lifetime.signal, this.renewal.signal]);
  }

  begin() {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      this.project();
      if (this.pending && ['waiting', 'review', 'ready'].includes(this.pending.status))
        return this.project();
      const previousId = await this.store.getCurrentAuthorizationId();
      let permission =
        this.permission && this.permission.id === previousId ? this.permission.value : undefined;
      if (permission?.code.startsWith('DWS_')) {
        this.permission = undefined;
        permission = undefined;
      }
      if (permission?.code === 'PAT_ORG_POLICY_DENIED') {
        this.pending = { status: 'unsupported-account', id: randomUUID() };
        this.permission = undefined;
        return this.project();
      }
      if (permission && previousId && permission.code !== 'PAT_SCOPE_AUTH_REQUIRED') {
        const current = await this.resolve(previousId, this.renewalSignal);
        const challenge = dingtalkPermissionChallenge(permission);
        signal.throwIfAborted();
        this.pending = {
          ...challenge,
          status: 'waiting',
          id: randomUUID(),
          stage: 'permission',
          previousId,
          application: permission.clientId
            ? { clientId: permission.clientId, clientSecret: permission.clientSecret }
            : { clientId: current.clientId, clientSecret: current.clientSecret },
        };
      } else {
        if (permission?.code === 'PAT_SCOPE_AUTH_REQUIRED' && !permission.missingScope)
          throw new PluginError(
            'access',
            'Dingtalk did not identify the required authorization scope.',
          );
        const current =
          permission && previousId ? await this.resolve(previousId, this.renewalSignal) : undefined;
        const result = await dingtalkOauth.begin(signal, current, permission?.missingScope);
        signal.throwIfAborted();
        this.pending = {
          ...result.challenge,
          status: 'waiting',
          id: randomUUID(),
          previousId,
          stage: 'user',
          application: { clientId: result.clientId, clientSecret: result.clientSecret },
        };
      }
      return this.project();
    });
  }

  private async requiresDisconnect(
    previousId: string | undefined,
    account: DingtalkAccount,
    sameGrant = false,
  ) {
    const currentId = await this.store.getCurrentAuthorizationId();
    if (currentId !== previousId) return true;
    if (!currentId) return false;
    try {
      const current = DingtalkUserCredentialSchema.safeParse(
        (await this.store.getGrant(currentId))?.credential,
      );
      return (
        !current.success || (!sameGrant && !isSameDingtalkAccount(current.data.account, account))
      );
    } catch (error) {
      if (error instanceof PluginError && error.reason === 'authorization') return true;
      throw error;
    }
  }

  poll(attemptId: string) {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      this.project();
      const pending = this.pending;
      if (!pending || pending.id !== attemptId) throw cancelled();
      if (pending.status !== 'waiting' || Date.now() < pending.nextPollAt) return this.project();
      pending.nextPollAt = Date.now() + pending.intervalMs;
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.max(1, pending.expiresAt - Date.now())),
      ]);
      const current =
        pending.stage === 'permission' && pending.previousId
          ? await this.resolve(pending.previousId, this.renewalSignal)
          : undefined;
      let result;
      try {
        result = await dingtalkOauth.poll(
          pending,
          pending.application.clientId,
          requestSignal,
          current?.tokens.accessToken,
        );
      } catch (error) {
        if (!signal.aborted && Date.now() >= pending.expiresAt) {
          this.pending = { status: 'expired', id: pending.id };
          this.permission = undefined;
          return this.project();
        }
        throw error;
      }
      signal.throwIfAborted();
      if (result.status === 'pending' || result.status === 'slow-down') {
        if (result.status === 'slow-down')
          pending.intervalMs = Math.min(60_000, pending.intervalMs + 5000);
        pending.nextPollAt = Date.now() + pending.intervalMs;
        return this.project();
      }
      if (result.status !== 'approved') {
        this.pending = { status: result.status, id: pending.id };
        this.permission = undefined;
        return this.project();
      }
      // Consume once before exchange. A lost/ambiguous response requires a fresh authorization.
      this.pending = undefined;
      this.permission = undefined;
      const sameGrant = !result.authCode && !!current;
      if (sameGrant && pending.application.clientId !== current!.clientId)
        throw new PluginError(
          'authorization',
          'Dingtalk did not return a code for the new application.',
        );
      let credential = result.authCode
        ? await dingtalkOauth.exchange(pending.application, result.authCode, signal)
        : current;
      if (!credential)
        throw new PluginError('authorization', 'Dingtalk did not return an authorization code.');
      try {
        await dingtalkOauth.checkAccess(credential.tokens.accessToken, signal);
      } catch (error) {
        if (error instanceof PluginError && error.reason === 'access') {
          this.pending = { status: 'unsupported-account', id: pending.id };
          return this.project();
        }
        throw error;
      }
      credential = await enrichDingtalkAccount(credential, signal);
      const requiresDisconnect = await this.requiresDisconnect(
        pending.previousId,
        credential.account,
        sameGrant,
      );
      signal.throwIfAborted();
      this.pending = {
        status: 'review',
        id: pending.id,
        previousId: pending.previousId,
        credential,
        requiresDisconnect,
        sameGrant,
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
    throw new PluginError('authorization', 'Dingtalk authorization is no longer available.');
  }

  private async refreshed(credential: DingtalkUserCredential, signal: AbortSignal) {
    if (credential.rejected)
      throw new PluginError('authorization', 'Dingtalk rejected this authorization.');
    if (credential.tokens.expiresAt > Date.now() + 60_000) return credential;
    if (credential.tokens.refreshExpiresAt <= Date.now())
      throw new PluginError('authorization', 'Dingtalk authorization expired.');
    const result = await dingtalkOauth.refresh(credential, signal);
    signal.throwIfAborted();
    return result;
  }

  confirm(attemptId: string) {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      const pending = this.requireReview(attemptId);
      try {
        pending.credential =
          pending.sameGrant && pending.previousId
            ? await this.resolve(pending.previousId, this.renewalSignal)
            : await this.refreshed(pending.credential, signal);
        pending.requiresDisconnect = await this.requiresDisconnect(
          pending.previousId,
          pending.credential.account,
          pending.sameGrant,
        );
        signal.throwIfAborted();
        pending.status = pending.requiresDisconnect ? 'review' : 'ready';
        return this.project();
      } catch (error) {
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
        (await this.requiresDisconnect(
          pending.previousId,
          pending.credential.account,
          pending.sameGrant,
        ))
      )
        throw new PluginError(
          'requires-disconnect',
          'Disconnect before changing the Dingtalk account.',
        );
      try {
        pending.credential =
          pending.sameGrant && pending.previousId
            ? await this.resolve(pending.previousId, this.renewalSignal)
            : await this.refreshed(pending.credential, signal);
      } catch (error) {
        this.pending = undefined;
        throw error;
      }
      return {
        credential: asCredential(pending.credential),
        accountLabel: dingtalkAccountLabel(pending.credential.account),
        signal,
      };
    });
  }

  commit(attemptId: string, accountLabel: string, signal: AbortSignal) {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const pending = this.requireReview(attemptId);
      if (pending.status !== 'ready')
        throw new PluginError('authorization', 'Confirm the Dingtalk connection first.');
      this.pending = undefined;
      const result = await this.store.commit(
        asCredential(pending.credential),
        accountLabel,
        signal,
        { authorizationId: pending.previousId },
      );
      this.permission = undefined;
      return result;
    });
  }

  private async resolve(id: string, signal: AbortSignal): Promise<DingtalkUserCredential> {
    signal.throwIfAborted();
    const failure = this.failures.get(id);
    if (failure) throw new PluginError(failure, 'Dingtalk authorization requires reconnecting.');
    const parsed = DingtalkUserCredentialSchema.safeParse(
      (await this.store.getGrant(id))?.credential,
    );
    if (!parsed.success) {
      this.store.notifyChanged();
      throw new PluginError('authorization', 'Dingtalk credentials are missing.');
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
      return credential;
    } catch (error) {
      if (signal.aborted) throw cancelled();
      const reason = error instanceof PluginError ? error.reason : 'storage';
      // Lock uncertain rotations as well as rejected tokens; never reuse a consumed refresh token.
      this.failures.set(id, reason);
      await this.store
        .updateCredential(id, asCredential({ ...previous, rejected: true }), signal)
        .catch(() => {});
      this.store.notifyChanged();
      throw new PluginError(reason, 'Dingtalk authorization requires reconnecting.');
    }
  }

  resolveCredential(id: string, callerSignal?: AbortSignal): Promise<PluginCredential> {
    if (callerSignal?.aborted) return Promise.reject(cancelled());
    let operation = this.resolutions.get(id);
    if (!operation) {
      const signal = this.renewalSignal;
      operation = this.serialize(async () => asCredential(await this.resolve(id, signal)));
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
    const parsed = DingtalkUserCredentialSchema.safeParse(
      (await this.store.getGrant(id))?.credential,
    );
    const reason =
      !parsed.success || parsed.data.rejected || parsed.data.tokens.refreshExpiresAt <= Date.now()
        ? 'authorization'
        : this.permission?.id === id
          ? this.permission.value.code.startsWith('DWS_')
            ? 'authorization'
            : 'access'
          : this.failures.get(id);
    return {
      status: reason ? 'needs-reauthorization' : 'connected',
      reason,
      managementUrl: DINGTALK_MANAGEMENT_URL,
    };
  }

  requestAuthorization(id: string, challenge: PluginCredential) {
    return this.serialize(async () => {
      const value = DingtalkPermissionSchema.safeParse(challenge);
      if (!value.success || !(await this.store.getGrant(id))) return;
      // Preserve the first challenge until the user finishes it; concurrent tools cannot retarget it.
      if (this.permission?.id !== id) this.permission = { id, value: value.data };
      this.store.notifyChanged();
    });
  }

  rejectCredential(id: string, rejected: PluginCredential) {
    const signal = this.renewalSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      const current = DingtalkUserCredentialSchema.safeParse(
        (await this.store.getGrant(id))?.credential,
      );
      const sent = DingtalkUserCredentialSchema.safeParse(rejected);
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

  async prepareRevocation(id: string) {
    const credential = DingtalkUserCredentialSchema.parse(
      (await this.store.getGrant(id))?.credential,
    );
    return {
      managementUrl: DINGTALK_MANAGEMENT_URL,
      revoke: (signal: AbortSignal) => dingtalkOauth.revoke(credential, signal),
    };
  }

  cancel() {
    this.interrupt();
    return this.serialize(async () => {
      this.pending = undefined;
      this.permission = undefined;
      this.store.notifyChanged();
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
    this.permission = undefined;
    this.store.notifyChanged();
  }
  async stop() {
    this.attempt.abort();
    this.renewal.abort();
    this.lifetime.abort();
    await this.operations.catch(() => {});
    this.pending = undefined;
    this.permission = undefined;
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
