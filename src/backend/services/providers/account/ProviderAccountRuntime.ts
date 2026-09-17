import { randomUUID } from 'expo-crypto';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { ProviderAccountService } from '@/backend/data/services/ProviderAccountService';
import {
  ProviderAccountError,
  type ProviderAccountIdentity,
  type ProviderAccountsModule,
  type ProviderAccountStatus,
} from '@/shared/contracts/providerAccounts';

import {
  getAccountCapabilities,
  type ProviderAccountDefinition,
} from './providerAccountDefinition';
import {
  providerAccountStorage,
  type StoredProviderAccount,
  type PendingProviderAuthorization,
} from './providerAccountStorage';
import { getProviderAccountReturnUrl, providerAccountError } from './providerOauth';

const SIGNED_OUT: ProviderAccountStatus = {
  signedIn: false,
  balance: null,
  displayName: null,
  email: null,
  updatedAt: null,
};
type AccountProvider = Awaited<ReturnType<ProviderAccountService['get']>>;
function accountStatus(account: StoredProviderAccount | null): ProviderAccountStatus {
  return account?.authorized
    ? {
        signedIn: true,
        balance: account.balance,
        displayName: account.displayName,
        email: account.email,
        updatedAt: account.updatedAt,
      }
    : { ...SIGNED_OUT };
}

/** Owns provider grants and browser attempts; vendor adapters never manage local session state. */
@Injectable('ProviderAccountRuntime')
@DependsOn(['DbService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('continue')
export class ProviderAccountRuntime extends BaseService implements ProviderAccountsModule {
  private store: Pick<ProviderAccountService, 'get' | 'replaceKeys'> | undefined;
  private definitions: ReadonlyMap<string, ProviderAccountDefinition> = new Map();
  private stopped = false;
  private tail: Promise<unknown> = Promise.resolve();
  private active: AbortController | undefined;
  private readonly callbacks = new Map<string, Promise<string | null>>();
  private readonly refreshes = new Map<string, Promise<ProviderAccountStatus>>();

  configure(
    store: Pick<ProviderAccountService, 'get' | 'replaceKeys'>,
    definitions: readonly ProviderAccountDefinition[],
  ) {
    this.store = store;
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  getCapabilities(provider: ProviderAccountIdentity) {
    return getAccountCapabilities(this.definitions.get(provider.presetProviderId ?? provider.id));
  }

  getStatus(providerId: string) {
    return this.run(async () => {
      const provider = await this.store!.get(providerId);
      const definition = this.definitions.get(provider.presetProviderId ?? provider.id);
      return definition
        ? accountStatus(await this.readAccount(provider, definition.id))
        : { ...SIGNED_OUT };
    });
  }

  begin(providerId: string) {
    return this.run(async (signal) => {
      const { provider, definition } = await this.requireProvider(providerId);
      const application = definition.getApplication();
      const challenge = await definition.oauth.challenge(application);
      signal.throwIfAborted();
      await providerAccountStorage.writePending({
        definitionId: definition.id,
        application,
        providerId,
        providerCreatedAt: provider.createdAt,
        state: challenge.state,
        verifier: challenge.verifier,
        expiresAt: Date.now() + 10 * 60_000,
      });
      this.callbacks.clear();
      return {
        attemptId: challenge.state,
        authorizationUrl: challenge.authorizationUrl,
        redirectUrl: application.redirectUrl,
      };
    });
  }

  cancel(attemptId: string) {
    return this.run(async () => {
      const pending = await providerAccountStorage.readPending();
      if (pending?.state === attemptId) await providerAccountStorage.writePending(null);
    });
  }

  receiveRedirect(rawUrl: string): Promise<string | null> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return Promise.reject(new ProviderAccountError('callback'));
    }
    const state = url.searchParams.get('state');
    if (
      !state ||
      !/^[\w-]{43}$/.test(state) ||
      url.searchParams.getAll('state').length !== 1 ||
      !['cherrystudio:', 'cherrystudio-dev:', 'cherrystudio-preview:'].includes(url.protocol) ||
      url.host !== 'oauth' ||
      url.pathname !== '/callback' ||
      url.username ||
      url.password ||
      url.hash ||
      url.searchParams.getAll('code').length > 1 ||
      url.searchParams.getAll('error').length > 1
    ) {
      return Promise.reject(new ProviderAccountError('callback'));
    }
    const previous = this.callbacks.get(url.href);
    if (previous) return previous;
    const completion = this.run(async (signal) => {
      const pending = await providerAccountStorage.readPending();
      if (!pending || pending.state !== state) throw new ProviderAccountError('callback');
      if (url.protocol !== new URL(pending.application.redirectUrl).protocol)
        throw new ProviderAccountError('callback');
      if (pending.expiresAt < Date.now()) {
        await providerAccountStorage.writePending(null);
        throw new ProviderAccountError('callback');
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      await providerAccountStorage.writePending(null);
      if (error === 'access_denied' && !code) return null;
      if (!code || error || code.length > 16_384) throw new ProviderAccountError('callback');
      await this.completeLogin(pending, code, signal);
      return pending.providerId;
    });
    // Native browser completion and the shared router may deliver the same callback.
    if (this.callbacks.size >= 8) this.callbacks.delete(this.callbacks.keys().next().value!);
    this.callbacks.set(url.href, completion);
    return completion;
  }

  refresh(providerId: string): Promise<ProviderAccountStatus> {
    const previous = this.refreshes.get(providerId);
    if (previous) return previous;
    const result = this.run(async (signal) => {
      const { provider, definition } = await this.requireProvider(providerId);
      let account = await this.readAccount(provider, definition.id);
      if (!account?.authorized) return { ...SIGNED_OUT };
      if (!definition.getBalance && !definition.getProfile) return accountStatus(account);
      const refresh = async () => {
        try {
          const tokens = await definition.oauth.refresh(
            account!.application,
            account!.tokens,
            signal,
          );
          account = { ...account!, tokens };
          await providerAccountStorage.writeAccount(providerId, account);
          signal.throwIfAborted();
        } catch (error) {
          const safe = providerAccountError(error, signal);
          if (safe.reason === 'authorization')
            await providerAccountStorage.writeAccount(providerId, {
              ...account!,
              authorized: false,
            });
          throw safe;
        }
      };
      let refreshed = false;
      if (
        account.tokens.expiresAt !== undefined &&
        account.tokens.expiresAt <= Date.now() + 60_000
      ) {
        await refresh();
        refreshed = true;
      }
      const withAccountToken = async <T>(
        request: (token: string, signal: AbortSignal) => Promise<T>,
      ) =>
        request(account!.tokens.accessToken, signal)
          .catch(async (error: unknown) => {
            if (refreshed || providerAccountError(error, signal).reason !== 'authorization')
              throw error;
            await refresh();
            refreshed = true;
            return request(account!.tokens.accessToken, signal);
          })
          .catch(async (error: unknown) => {
            if (providerAccountError(error, signal).reason === 'authorization')
              await providerAccountStorage.writeAccount(providerId, {
                ...account!,
                authorized: false,
              });
            throw error;
          });
      const balance = definition.getBalance ? await withAccountToken(definition.getBalance) : null;
      // Profile enrichment is optional when balance already established the account session.
      const profile = definition.getProfile
        ? definition.getBalance
          ? await definition.getProfile(account.tokens.accessToken, signal).catch(() => null)
          : await withAccountToken(definition.getProfile)
        : null;
      signal.throwIfAborted();
      account = { ...account, ...profile, balance, updatedAt: Date.now() };
      await providerAccountStorage.writeAccount(providerId, account);
      return accountStatus(account);
    }).finally(() => this.refreshes.delete(providerId));
    this.refreshes.set(providerId, result);
    return result;
  }

  getTopUpUrl(providerId: string) {
    return this.run(async () => {
      const { definition } = await this.requireProvider(providerId);
      if (!definition.getTopUpUrl) throw new ProviderAccountError('unsupported');
      const url = new URL(
        definition.getTopUpUrl({ returnUrl: getProviderAccountReturnUrl(providerId) }),
      );
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new ProviderAccountError('configuration');
      return url.href;
    });
  }

  logout(providerId: string) {
    this.active?.abort();
    return this.run(async (signal) => {
      const account = await providerAccountStorage.readAccount(providerId);
      await this.clearAccount(providerId, account);
      if (account)
        await this.definitions
          .get(account.definitionId)
          ?.oauth.revoke(account.tokens.accessToken, signal)
          .catch(() => undefined);
    });
  }

  /** Provider deletion clears credentials independently of any mounted account panel. */
  forget(providerId: string) {
    this.active?.abort();
    return this.run(async () => {
      await this.clearAccount(providerId, await providerAccountStorage.readAccount(providerId));
    });
  }

  private async requireProvider(providerId: string) {
    const provider = await this.store!.get(providerId);
    const definition = this.definitions.get(provider.presetProviderId ?? provider.id);
    if (!definition) throw new ProviderAccountError('unsupported');
    return { provider, definition };
  }

  private async clearAccount(providerId: string, account: StoredProviderAccount | null) {
    const pending = await providerAccountStorage.readPending();
    if (pending?.providerId === providerId) await providerAccountStorage.writePending(null);
    if (!account) return;
    await providerAccountStorage.writeAccount(providerId, null);
    try {
      await this.store!.replaceKeys(providerId, account.providerCreatedAt, account.ownedKeys, []);
    } catch (error) {
      await providerAccountStorage.writeAccount(providerId, account);
      throw error;
    }
  }

  private async readAccount(provider: AccountProvider, definitionId: string) {
    const account = await providerAccountStorage.readAccount(provider.id);
    if (
      account &&
      (account.providerCreatedAt !== provider.createdAt || account.definitionId !== definitionId)
    ) {
      await providerAccountStorage.writeAccount(provider.id, null);
      return null;
    }
    return account;
  }

  private async completeLogin(
    pending: PendingProviderAuthorization,
    code: string,
    signal: AbortSignal,
  ) {
    const { provider, definition } = await this.requireProvider(pending.providerId);
    if (provider.createdAt !== pending.providerCreatedAt || definition.id !== pending.definitionId)
      throw new ProviderAccountError('callback');
    const tokens = await definition.oauth.exchange(
      pending.application,
      code,
      pending.verifier,
      signal,
    );
    const keys = (await definition.getApiKeys?.(tokens.accessToken, signal)) ?? [];
    if (definition.getApiKeys && !keys.length) throw new ProviderAccountError('no-keys');
    const previous = await this.readAccount(provider, definition.id);
    const ownedKeys = keys.map((key) => ({
      id: randomUUID(),
      key,
      label: `${provider.name} OAuth`,
      isEnabled: true,
    }));
    const account: StoredProviderAccount = {
      definitionId: definition.id,
      application: pending.application,
      tokens,
      providerCreatedAt: pending.providerCreatedAt,
      ownedKeys,
      authorized: true,
      balance: null,
      displayName: null,
      email: null,
      updatedAt: null,
    };
    signal.throwIfAborted();
    // Once credential persistence starts, finish or compensate both stores before yielding ownership.
    await providerAccountStorage.writeAccount(pending.providerId, account);
    try {
      const saved = await this.store!.replaceKeys(
        pending.providerId,
        pending.providerCreatedAt,
        previous?.ownedKeys ?? [],
        ownedKeys,
      );
      if (!saved) throw new ProviderAccountError('callback');
    } catch (error) {
      await providerAccountStorage.writeAccount(pending.providerId, previous);
      throw error;
    }
  }

  protected async onStop() {
    this.stopped = true;
    this.active?.abort();
    await this.tail;
    this.callbacks.clear();
    this.refreshes.clear();
  }

  private run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      if (this.stopped || !this.store) throw new ProviderAccountError('cancelled');
      const controller = new AbortController();
      this.active = controller;
      try {
        return await operation(controller.signal);
      } catch (error) {
        throw providerAccountError(error, controller.signal);
      } finally {
        if (this.active === controller) this.active = undefined;
      }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}
