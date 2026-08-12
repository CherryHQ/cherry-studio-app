import type { AuthConfig } from '@cherrystudio/universal/data/types/provider';

import { oauthProviderRepository } from '../providerRepository';
import type { OAuthTokenStore, OAuthTokenStoreData } from './types';

type OAuthAuthConfig = Extract<AuthConfig, { type: 'oauth' }>;

export type OAuthTokenStoreProviderRepository = {
  getAuthConfig(providerId: string): Promise<AuthConfig | null>;
  update(
    providerId: string,
    input: { authConfig?: AuthConfig; isEnabled?: boolean },
  ): Promise<unknown>;
};

/**
 * Stores the OAuth session inside the provider row's `authConfig`.
 *
 * Desktop's counterpart gets its compare-and-write atomicity for free: its
 * `getAuthConfig`/`update` are synchronous, so the read and the write share one
 * tick and no concurrent logout or re-login can interleave between them. Both
 * are async here (they hit SQLite), so that guarantee does not survive the port
 * — hence `enqueue` below. It is the mobile substitute for that synchronous
 * tick, not incidental noise: keep it across desktop syncs.
 */
export class ProviderAuthConfigOAuthTokenStore implements OAuthTokenStore {
  private readonly writeQueues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly providers: OAuthTokenStoreProviderRepository = oauthProviderRepository,
  ) {}

  async get(providerId: string): Promise<OAuthTokenStoreData | null> {
    const authConfig = await this.providers.getAuthConfig(providerId);

    if (authConfig?.type !== 'oauth') return null;

    return {
      accessToken: authConfig.accessToken,
      accountId: authConfig.accountId,
      expiresAt: authConfig.expiresAt,
      refreshToken: authConfig.refreshToken,
    };
  }

  set(
    providerId: string,
    data: OAuthTokenStoreData,
    clientId: string,
    options?: { expectedRefreshToken?: string },
  ): Promise<void> {
    return this.enqueue(providerId, async () => {
      const current = await this.providers.getAuthConfig(providerId);
      const currentOAuth = current?.type === 'oauth' ? current : null;

      // Refresh path: commit only if the stored session is the same one we
      // refreshed from — still OAuth and still holding that refresh token. This
      // rejects both a logout (→ api-key, no match) and a re-login (a different
      // session's refresh token) that landed during the network round-trip.
      if (
        options?.expectedRefreshToken !== undefined &&
        (!currentOAuth || currentOAuth.refreshToken !== options.expectedRefreshToken)
      ) {
        return;
      }

      const authConfig: OAuthAuthConfig = {
        type: 'oauth',
        clientId: clientId || currentOAuth?.clientId || '',
        ...(data.accessToken ? { accessToken: data.accessToken } : {}),
        ...(data.refreshToken ? { refreshToken: data.refreshToken } : {}),
        ...(data.expiresAt ? { expiresAt: data.expiresAt } : {}),
        ...(data.accountId ? { accountId: data.accountId } : {}),
      };

      await this.providers.update(providerId, { authConfig });
    });
  }

  clear(
    providerId: string,
    options?: { disableProvider?: boolean; expectedRefreshToken?: string },
  ): Promise<void> {
    return this.enqueue(providerId, async () => {
      // Conditional clear (terminal refresh failure): skip if this is no longer
      // the session that failed — a re-login during the failed refresh must
      // survive. A user-initiated logout omits the token and clears outright.
      if (options?.expectedRefreshToken !== undefined) {
        const current = await this.providers.getAuthConfig(providerId);

        if (current?.type !== 'oauth' || current.refreshToken !== options.expectedRefreshToken) {
          return;
        }
      }

      // Reset auth back to api-key mode (drops the OAuth tokens). Only flip
      // `isEnabled` when the caller owns the provider's enablement — disabling a
      // provider that also holds a manual API key would silently kill that key.
      await this.providers.update(providerId, {
        authConfig: { type: 'api-key' },
        ...(options?.disableProvider ? { isEnabled: false } : {}),
      });
    });
  }

  /**
   * Run `operation` after every mutation already queued for `providerId`, so a
   * read-compare-write never interleaves with another one. A rejected operation
   * does not stall the queue behind it.
   */
  private enqueue<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.writeQueues.get(providerId) ?? Promise.resolve();
    const next = previous.then(operation, operation);

    this.writeQueues.set(
      providerId,
      next.catch(() => undefined),
    );

    return next;
  }
}

/**
 * The one store the app writes through.
 *
 * Single by necessity, not by convention: `writeQueues` above lives on the
 * instance, so two stores would serialize against two different queues and a
 * refresh on one could still interleave a logout on the other — the exact race
 * the queue exists to close. Desktop keeps one instance too, as a field
 * initializer on its `OAuthRuntimeService`; here it has to be a module singleton
 * because the authorization side reaches it as well, through the adapters
 * `ProviderOAuthService` builds.
 */
export const oauthTokenStore = new ProviderAuthConfigOAuthTokenStore();
