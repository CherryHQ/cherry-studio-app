import {
  configureOAuthPlatform,
  githubCopilotOAuth,
  kimiCodingOAuth,
  metaOAuth,
  ModelsError,
  openaiCodexOAuth,
  openRouterOAuth,
  resolveProviderAuth,
  xaiOAuth,
  type CredentialStore,
  type OAuthAuth,
} from '@earendil-works/pi-ai/native-oauth';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';

import type { ProviderAccountService } from '@/backend/data/services/ProviderAccountService';
import { isHttpError } from '@/backend/services/http';
import type { ProviderAccountAdapter } from '@/backend/services/providers/account/providerAccountAdapter';
import { createProviderAccountFetch } from '@/backend/services/providers/account/providerAccountFetch';
import { providerAccountStorage } from '@/backend/services/providers/account/providerAccountStorage';
import {
  ProviderAccountError,
  type ProviderAccountIdentity,
  type ProviderAccountStatus,
  type ProviderSignInInteraction,
} from '@/shared/contracts/providerAccounts';
import { getPiOAuthProviderId, type PiOAuthProviderId } from '@/shared/data/providerOAuth';

const FLOWS: Record<PiOAuthProviderId, OAuthAuth> = {
  'github-copilot': githubCopilotOAuth,
  'kimi-coding': kimiCodingOAuth,
  meta: metaOAuth,
  xai: xaiOAuth,
  'openai-codex': openaiCodexOAuth,
  openrouter: openRouterOAuth,
};
const SIGNED_OUT: ProviderAccountStatus = {
  signedIn: false,
  balance: null,
  displayName: null,
  email: null,
  updatedAt: null,
};
type AccountProvider = Awaited<ReturnType<ProviderAccountService['get']>>;

const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
configureOAuthPlatform({
  fetch: createProviderAccountFetch(),
  async generatePKCE() {
    const verifier = base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));
    const challenge = base64Url(
      await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: CryptoEncoding.BASE64,
      }),
    );
    return { verifier, challenge };
  },
});

/** Owned by ProviderAccountRuntime. Credentials and locks belong to concrete app provider instances. */
export class PiProviderAccountAdapter implements ProviderAccountAdapter {
  private readonly tails = new Map<string, Promise<unknown>>();
  private readonly operations = new Map<string, Set<AbortController>>();
  private readonly work = new Set<Promise<unknown>>();
  private stopped = false;

  private providers: Pick<ProviderAccountService, 'get'> | undefined;

  configure(providers: Pick<ProviderAccountService, 'get'>) {
    this.providers = providers;
  }

  getCapabilities(provider: ProviderAccountIdentity) {
    const id = getPiOAuthProviderId(provider);
    return id
      ? {
          signIn: true,
          apiKeys: false,
          balance: false,
          flow: 'interactive' as const,
          ...(id === 'github-copilot' ? { enterpriseDomain: true } : {}),
        }
      : undefined;
  }

  async getStatus(providerId: string): Promise<ProviderAccountStatus> {
    return this.lock(providerId, async () => {
      const provider = await this.providers!.get(providerId);
      const id = getPiOAuthProviderId(provider);
      const account = id ? await this.read(provider, id) : null;
      return account
        ? { ...SIGNED_OUT, signedIn: true, updatedAt: account.updatedAt }
        : { ...SIGNED_OUT };
    });
  }

  async signIn(providerId: string, interaction: ProviderSignInInteraction) {
    // A replacement attempt cancels the old one before either can persist credentials.
    this.abort(providerId);
    await this.operation(providerId, interaction.signal, async (signal) => {
      const provider = await this.providers!.get(providerId);
      const id = getPiOAuthProviderId(provider);
      if (!id) throw new ProviderAccountError('unsupported');
      const credential = await FLOWS[id].login({
        signal,
        prompt: async (prompt) => {
          if (id === 'openai-codex' && prompt.type === 'select') return 'device_code';
          if (id === 'github-copilot' && prompt.type === 'text') {
            return interaction.prompt({ type: 'enterprise-domain', signal });
          }
          if (id === 'openrouter' && prompt.type === 'manual_code') {
            return interaction.prompt({
              type: 'authorization-code',
              signal: prompt.signal ? AbortSignal.any([signal, prompt.signal]) : signal,
            });
          }
          throw new ProviderAccountError('unsupported');
        },
        notify: (event) => {
          if (signal.aborted) return;
          if (event.type === 'device_code') {
            requireBrowserUrl(event.verificationUri);
            interaction.notify({
              type: 'device-code',
              code: event.userCode,
              url: event.verificationUri,
            });
          } else if (event.type === 'auth_url') {
            requireBrowserUrl(event.url);
            interaction.notify({ type: 'browser', url: event.url });
          } else if (event.type === 'progress') {
            interaction.notify({ type: 'progress' });
          }
        },
      });
      signal.throwIfAborted();
      await this.credentials(provider, id).modify(id, async () => credential, { signal });
    });
  }

  async resolveAuth(provider: ProviderAccountIdentity, signal?: AbortSignal) {
    const id = getPiOAuthProviderId(provider);
    if (!id) return undefined;
    return this.operation(provider.id, signal, async (operationSignal) => {
      const identity = await this.providers!.get(provider.id);
      if (getPiOAuthProviderId(identity) !== id) throw new ProviderAccountError('configuration');
      const store = this.credentials(identity, id);
      const result = await resolveProviderAuth(
        { id, auth: { oauth: FLOWS[id] } },
        store,
        { env: async () => undefined, fileExists: async () => false },
        { signal: operationSignal },
      );
      if (!result) return undefined;
      const credential = await store.read(id, { signal: operationSignal });
      return {
        id,
        auth: result.auth,
        availableModelIds:
          credential?.type === 'oauth' && Array.isArray(credential.availableModelIds)
            ? credential.availableModelIds.filter(
                (value): value is string => typeof value === 'string',
              )
            : undefined,
      };
    });
  }

  async refresh(providerId: string) {
    const provider = await this.providers!.get(providerId);
    await this.resolveAuth(provider);
    return this.getStatus(providerId);
  }

  async logout(providerId: string) {
    this.abort(providerId);
    await this.lock(providerId, () => providerAccountStorage.writePiAccount(providerId, null));
  }

  async stop() {
    this.stopped = true;
    for (const id of this.operations.keys()) this.abort(id);
    await Promise.allSettled(this.work);
    await Promise.allSettled(this.tails.values());
  }

  private credentials(provider: AccountProvider, id: PiOAuthProviderId): CredentialStore {
    return {
      read: (_, options) =>
        this.lock(provider.id, async () => {
          options?.signal?.throwIfAborted();
          return (await this.read(provider, id))?.credential;
        }),
      list: async () =>
        (await this.getStatus(provider.id)).signedIn ? [{ providerId: id, type: 'oauth' }] : [],
      modify: (_, fn, options) =>
        this.lock(provider.id, async () => {
          options?.signal?.throwIfAborted();
          const current = (await this.read(provider, id))?.credential;
          const next = await fn(current);
          options?.signal?.throwIfAborted();
          if (!next) return current;
          if (next.type !== 'oauth') throw new ProviderAccountError('configuration');
          const latest = await this.providers!.get(provider.id);
          if (latest.createdAt !== provider.createdAt || getPiOAuthProviderId(latest) !== id) {
            throw new ProviderAccountError('cancelled');
          }
          await providerAccountStorage.writePiAccount(provider.id, {
            definitionId: id,
            providerCreatedAt: provider.createdAt,
            credential: next,
            updatedAt: Date.now(),
          });
          return next;
        }),
      delete: () => this.logout(provider.id),
    };
  }

  private async read(provider: AccountProvider, id: PiOAuthProviderId) {
    const account = await providerAccountStorage.readPiAccount(provider.id);
    if (
      account &&
      (account.providerCreatedAt !== provider.createdAt || account.definitionId !== id)
    ) {
      await providerAccountStorage.writePiAccount(provider.id, null);
      return null;
    }
    return account;
  }

  private abort(providerId: string) {
    for (const controller of this.operations.get(providerId) ?? []) controller.abort();
  }

  private async operation<T>(
    providerId: string,
    callerSignal: AbortSignal | undefined,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.stopped) throw new ProviderAccountError('cancelled');
    const controller = new AbortController();
    const active = this.operations.get(providerId) ?? new Set<AbortController>();
    this.operations.set(providerId, active);
    active.add(controller);
    const signal = callerSignal
      ? AbortSignal.any([controller.signal, callerSignal])
      : controller.signal;
    try {
      signal.throwIfAborted();
      const work = fn(signal);
      this.work.add(work);
      try {
        return await work;
      } finally {
        this.work.delete(work);
      }
    } catch (error) {
      if (signal.aborted) throw new ProviderAccountError('cancelled');
      // Upstream errors may contain server responses and tokens: expose a closed, safe reason only.
      let cause: unknown = error;
      for (let depth = 0; depth < 4; depth++) {
        if (cause instanceof ProviderAccountError) throw cause;
        if (isHttpError(cause)) {
          throw new ProviderAccountError(
            cause.kind === 'cancelled'
              ? 'cancelled'
              : cause.kind === 'network' || cause.kind === 'timeout'
                ? 'network'
                : cause.kind === 'internal'
                  ? 'configuration'
                  : 'request',
          );
        }
        if (cause instanceof TypeError) throw new ProviderAccountError('network');
        if (!(cause instanceof Error) || !cause.cause) break;
        cause = cause.cause;
      }
      throw new ProviderAccountError(
        error instanceof ModelsError && error.code === 'auth' ? 'storage' : 'authorization',
      );
    } finally {
      active.delete(controller);
      if (!active.size) this.operations.delete(providerId);
    }
  }

  private lock<T>(providerId: string, fn: () => Promise<T>): Promise<T> {
    const result = (this.tails.get(providerId) ?? Promise.resolve()).then(() => {
      if (this.stopped) throw new ProviderAccountError('cancelled');
      return fn();
    });
    const tail = result.catch(() => undefined);
    this.tails.set(providerId, tail);
    void tail.then(() => {
      if (this.tails.get(providerId) === tail) this.tails.delete(providerId);
    });
    return result;
  }
}

function requireBrowserUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return;
  } catch {
    /* Invalid URLs never reach the browser. */
  }
  throw new ProviderAccountError('configuration');
}
