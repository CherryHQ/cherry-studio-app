import { randomUUID } from 'expo-crypto';

import { PluginError, type PluginAuthorizationState } from '@/shared/contracts/plugins';
import type { PluginConnectionStatus } from '@/shared/data/types/plugin';

import type {
  PluginAuthorizationRuntime,
  PluginAuthorizationStore,
} from '../../authorization/pluginAuthorization';
import type { PluginCredential } from '../../authorization/pluginCredential';
import {
  wecomBotApi,
  WecomBotCredentialSchema,
  type WecomBot,
  type WecomBotCredential,
} from './wecomBotApi';

type Pending =
  | ({ status: 'waiting'; id: string } & Awaited<ReturnType<typeof wecomBotApi.begin>>)
  | { status: 'ready'; id: string; bot: WecomBot; credential?: WecomBotCredential }
  | { status: 'expired'; id: string };

/** Owns one in-memory phone authorization attempt and serialized, grant-bound token renewal. */
export class WecomAuthorizationRuntime implements PluginAuthorizationRuntime {
  private pending?: Pending;
  private operations: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();
  private attempt = new AbortController();
  private renewal = new AbortController();

  constructor(private readonly store: PluginAuthorizationStore) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations
      .catch(() => {})
      .then(async () => {
        if (this.lifetime.signal.aborted)
          throw new PluginError('cancelled', 'Wecom authorization stopped.');
        return operation();
      })
      .catch((error: unknown) => {
        if (
          this.lifetime.signal.aborted ||
          (typeof error === 'object' &&
            error !== null &&
            'name' in error &&
            error.name === 'AbortError')
        )
          throw new PluginError('cancelled', 'Wecom authorization cancelled.');
        throw error;
      });
    this.operations = result;
    return result;
  }

  private project(): PluginAuthorizationState {
    if (this.pending?.status === 'waiting' && Date.now() >= this.pending.expiresAt)
      this.pending = { status: 'expired', id: this.pending.id };
    const pending = this.pending;
    if (!pending) return { status: 'idle' };
    if (pending.status !== 'waiting') return { status: pending.status, attemptId: pending.id };
    return {
      status: 'waiting',
      attemptId: pending.id,
      stage: 'bot',
      verificationUrl: pending.verificationUrl,
      verificationAction: 'copy',
      expiresAt: pending.expiresAt,
      nextPollAt: pending.nextPollAt,
    };
  }

  getState() {
    return this.serialize(async () => this.project());
  }

  begin() {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      this.project();
      if (this.pending && this.pending.status !== 'expired') return this.project();
      // Bot discovery does not establish employee identity. Require an explicit disconnect
      // before authorizing another bot or replacing an imported MCP connection.
      if (await this.store.getCurrentAuthorizationId())
        throw new PluginError('requires-disconnect', 'Disconnect Wecom before authorizing a bot.');
      const challenge = await wecomBotApi.begin(signal);
      signal.throwIfAborted();
      this.pending = { status: 'waiting', id: randomUUID(), ...challenge };
      return this.project();
    });
  }

  poll(attemptId: string) {
    const signal = this.attemptSignal;
    return this.serialize(async () => {
      signal.throwIfAborted();
      this.project();
      const pending = this.pending;
      if (!pending || pending.id !== attemptId || pending.status !== 'waiting')
        return this.project();
      if (Date.now() < pending.nextPollAt) return this.project();
      pending.nextPollAt = Date.now() + 3000;
      const bot = await wecomBotApi.poll(pending.sessionCode, signal);
      signal.throwIfAborted();
      if (Date.now() >= pending.expiresAt) this.pending = { status: 'expired', id: pending.id };
      else if (bot) this.pending = { status: 'ready', id: pending.id, bot };
      return this.project();
    });
  }

  private requireReady(attemptId: string) {
    if (this.pending?.status !== 'ready' || this.pending.id !== attemptId)
      throw new PluginError('authorization', 'Wecom authorization is no longer available.');
    return this.pending;
  }

  prepare(attemptId: string, signal: AbortSignal) {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const pending = this.requireReady(attemptId);
      // Preserve approved bot credentials if the exchange or setup discovery needs a retry.
      pending.credential ??= await wecomBotApi.exchange(pending.bot, 2, signal);
      signal.throwIfAborted();
      return {
        credential: pending.credential,
        accountLabel: `WeCom bot ${pending.bot.botId}`,
        signal,
      };
    });
  }

  commit(attemptId: string, accountLabel: string, signal: AbortSignal) {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const pending = this.requireReady(attemptId);
      if (!pending.credential)
        throw new PluginError('authorization', 'Wecom authorization is incomplete.');
      const connection = await this.store.commit(pending.credential, accountLabel, signal, {
        authorizationId: undefined,
      });
      this.pending = undefined;
      this.invalidateGrant();
      return connection;
    });
  }

  async resolveCredential(
    authorizationId: string,
    signal?: AbortSignal,
  ): Promise<PluginCredential> {
    signal?.throwIfAborted();
    this.lifetime.signal.throwIfAborted();
    const current = await this.store.getGrant(authorizationId);
    const parsed = WecomBotCredentialSchema.safeParse(current?.credential);
    if (!parsed.success)
      throw new PluginError('authorization', 'Wecom bot credentials are unavailable.');
    signal?.throwIfAborted();
    this.lifetime.signal.throwIfAborted();
    return parsed.data;
  }

  rejectCredential(authorizationId: string, rejected: PluginCredential) {
    const signal = AbortSignal.any([this.lifetime.signal, this.renewal.signal]);
    return this.serialize(async () => {
      signal.throwIfAborted();
      const sent = WecomBotCredentialSchema.safeParse(rejected);
      const current = WecomBotCredentialSchema.safeParse(
        (await this.store.getGrant(authorizationId))?.credential,
      );
      if (!sent.success || !current.success)
        throw new PluginError('authorization', 'Wecom authorization is unavailable.');
      // Concurrent 853004 responses reuse the first successful renewal.
      if (sent.data.token !== current.data.token) return;
      const renewed = await wecomBotApi.exchange(current.data, 1, signal);
      signal.throwIfAborted();
      if (!(await this.store.updateCredential(authorizationId, renewed, signal)))
        throw new PluginError('cancelled', 'Wecom authorization was replaced or disconnected.');
    });
  }

  async describeConnection(authorizationId: string): Promise<PluginConnectionStatus> {
    const grant = await this.store.getGrant(authorizationId);
    return WecomBotCredentialSchema.safeParse(grant?.credential).success
      ? { status: 'connected' }
      : { status: 'needs-reauthorization', reason: 'authorization' };
  }

  get attemptSignal() {
    return AbortSignal.any([this.lifetime.signal, this.attempt.signal]);
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
  }

  async stop() {
    this.lifetime.abort();
    this.attempt.abort();
    this.renewal.abort();
    await this.operations.catch(() => {});
    this.pending = undefined;
  }
}
