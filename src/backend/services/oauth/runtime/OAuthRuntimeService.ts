import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { randomUUID } from 'expo-crypto';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  describeOAuthError,
  OAuthServiceError,
  OAuthTransientError,
  oauthProviderDefinitions,
} from '@/shared/oauth';
import type {
  OAuthAccount,
  OAuthProviderContext,
  OAuthProviderDefinition,
  OAuthTokenCredentials,
  OAuthTokenStore,
} from '@/shared/oauth';
import { OAuthHttpError, PkceOAuthClient } from './PkceOAuthClient';

const logger = loggerService.withContext('OAuthRuntimeService');

const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

/** Marks the API keys an OAuth exchange minted, so logout can drop just those. */
const OAUTH_API_KEY_LABEL = 'OAuth';

/**
 * Outcome of a refresh attempt. `terminal` means the refresh token itself is
 * rejected (4xx) — the session is unrecoverable and must be cleared. `retriable`
 * means a transient failure (network, 5xx, rate-limit) — the stored token is
 * kept so the next request can try again instead of logging the user out.
 */
type RefreshResult =
  | { accessToken: string; status: 'ok' }
  | { status: 'retriable' }
  | { status: 'terminal' };

/**
 * A 4xx from the token endpoint means the refresh token is dead — except the
 * transient ones: 429 (rate limit), 408 (request timeout) and 425 (too early)
 * are retriable, so they must NOT clear the session and log the user out.
 */
const TRANSIENT_4XX = new Set([408, 425, 429]);

function isTerminalRefreshError(error: unknown): boolean {
  return (
    error instanceof OAuthHttpError &&
    error.status >= 400 &&
    error.status < 500 &&
    !TRANSIENT_4XX.has(error.status)
  );
}

type OAuthProviderRepository = {
  listApiKeys(providerId: string): Promise<{ keys: ApiKeyEntry[] }>;
  replaceApiKeys(providerId: string, apiKeys: ApiKeyEntry[]): Promise<unknown>;
  update(providerId: string, input: { isEnabled?: boolean }): Promise<unknown>;
};

export type OAuthRuntimeServiceDependencies = {
  /** Defaults to the shared registry; injected so tests can register fakes. */
  definitions?: Record<string, OAuthProviderDefinition>;
  providers: OAuthProviderRepository;
  tokenStore: OAuthTokenStore;
};

export class OAuthRuntimeService {
  private readonly definitions: Record<string, OAuthProviderDefinition>;
  private readonly refreshPromises = new Map<string, Promise<RefreshResult>>();

  constructor(private readonly dependencies: OAuthRuntimeServiceDependencies) {
    this.definitions = dependencies.definitions ?? oauthProviderDefinitions;
  }

  /**
   * Finish a flow the frontend authorized: exchange the code for tokens, store
   * them, then run the provider's post-auth side effect.
   */
  async completeAuthorization(input: {
    code: string;
    codeVerifier: string;
    context?: OAuthProviderContext;
    providerId: string;
    redirectUri: string;
  }): Promise<void> {
    const definition = this.getDefinition(input.providerId);
    const context = input.context ?? {};

    try {
      const client = this.createClient(definition, context);
      const tokenData = await client.exchangeCode(
        input.code,
        input.codeVerifier,
        input.redirectUri,
      );

      // Persist before the side effect: the authorization code is spent by now,
      // so a failing post-persist hook must not discard a valid token and force
      // the user through the whole browser flow again.
      await this.persistTokens(definition, tokenData);

      const sideEffect = await definition.afterPersistTokens?.(tokenData, context);

      if (sideEffect?.apiKeys) {
        await this.persistMintedApiKeys(definition.providerId, sideEffect.apiKeys);
      }

      await this.dependencies.providers.update(definition.providerId, { isEnabled: true });
      logger.info(`${input.providerId} sign-in succeeded`);
    } catch (error) {
      logger.error(`${input.providerId} sign-in failed`, describeOAuthError(error));
      throw error instanceof OAuthServiceError
        ? error
        : new OAuthServiceError(`${input.providerId} sign-in failed`, error);
    }
  }

  async getAccount(providerId: string): Promise<OAuthAccount> {
    this.getDefinition(providerId);

    const config = await this.dependencies.tokenStore.get(providerId);

    return { accountId: config?.accountId ?? null };
  }

  async hasToken(providerId: string): Promise<boolean> {
    const definition = this.getDefinition(providerId);
    const config = await this.dependencies.tokenStore.get(providerId);

    if (!config?.accessToken) return false;

    // Expired with no way back: drop the dead session instead of reporting a
    // signed-in state the next request cannot honour.
    if (this.isExpired(config.expiresAt) && !config.refreshToken) {
      await this.clearSession(definition);
      return false;
    }

    return true;
  }

  async logout(providerId: string, context: OAuthProviderContext = {}): Promise<void> {
    const definition = this.getDefinition(providerId);

    if (definition.revokeToken) {
      const config = await this.dependencies.tokenStore.get(providerId);

      if (config?.accessToken) {
        try {
          await definition.revokeToken(config.accessToken, context);
        } catch (error) {
          // Best effort — a provider that will not revoke must not block the
          // user from signing out locally.
          logger.warn(`Failed to revoke ${providerId} token`, describeOAuthError(error));
        }
      }
    }

    await this.clearSession(definition);
    await this.dropMintedApiKeys(providerId);
    logger.info(`Cleared ${providerId} OAuth tokens`);
  }

  async getValidAccessToken(
    providerId: string,
    context: OAuthProviderContext = {},
  ): Promise<OAuthTokenCredentials | null> {
    const definition = this.getDefinition(providerId);
    const config = await this.dependencies.tokenStore.get(providerId);

    if (!config?.accessToken) return null;

    if (!context.forceRefresh && !this.isExpired(config.expiresAt)) {
      return { accessToken: config.accessToken, accountId: config.accountId ?? null };
    }

    if (!config.refreshToken) {
      await this.clearSession(definition);
      return null;
    }

    const result = await this.refreshAccessToken(definition, config.refreshToken, context);

    // Only clear on a terminal failure (refresh token rejected). A transient
    // failure keeps the stored token so the next request retries instead of
    // logging the user out over a flaky network or a 5xx.
    if (result.status === 'terminal') {
      // Pass the refresh token we started from so a re-login that replaced the
      // session mid-refresh is not cleared by this stale terminal result.
      await this.clearSession(definition, config.refreshToken);
      return null;
    }

    if (result.status !== 'ok') {
      // Retriable: the session is intact. Signal a retry rather than returning
      // null, which authenticatedFetch would otherwise report as "not signed in
      // — sign in again", forcing an unnecessary browser OAuth round.
      throw new OAuthTransientError(
        `Temporary failure refreshing ${providerId} token, please retry`,
      );
    }

    // Confirm our refreshed token actually landed. If the session was replaced
    // (logout → api-key, or a re-login with a different refresh token) while we
    // were refreshing, the store's compare-and-write skipped the write and now
    // holds a different session's token — which we must NOT hand to this
    // in-flight request (that would silently switch accounts). Fail closed; the
    // caller retries against the current session.
    const refreshed = await this.dependencies.tokenStore.get(providerId);

    if (refreshed?.accessToken !== result.accessToken) return null;

    return { accessToken: result.accessToken, accountId: refreshed?.accountId ?? null };
  }

  /**
   * Run a request authenticated with the provider's OAuth token, refreshing once
   * on a 401 (a server-revoked token can 401 before its local expiry). The
   * caller supplies `buildRequest` so the retry re-shapes headers/body with the
   * fresh token; this owns token fetch, the not-signed-in guard, and the retry —
   * keeping that logic in one place instead of per-provider fetch wrappers.
   *
   * `options.context` is threaded into token fetch/refresh (CherryIN needs its
   * `apiHost`); `options.onUnauthorized` runs when the request is still 401
   * after the retry, for the caller's diagnostic logging.
   */
  async authenticatedFetch(
    providerId: string,
    buildRequest: (credentials: OAuthTokenCredentials) => {
      init: RequestInit;
      input: RequestInfo | URL;
    },
    doFetch: (input: RequestInfo | URL, init: RequestInit) => Promise<Response>,
    options: {
      context?: OAuthProviderContext;
      notSignedInMessage?: string;
      onUnauthorized?: (response: Response) => Promise<void> | void;
    } = {},
  ): Promise<Response> {
    this.getDefinition(providerId);

    const { context, notSignedInMessage, onUnauthorized } = options;
    const credentials = await this.getValidAccessToken(providerId, context);

    if (!credentials?.accessToken) {
      throw new OAuthServiceError(
        notSignedInMessage ?? `Not signed in to ${providerId}`,
        undefined,
        'OAuthSessionExpired',
      );
    }

    const first = buildRequest(credentials);
    let response = await doFetch(first.input, first.init);

    if (response.status === 401) {
      let refreshed: OAuthTokenCredentials | null;

      try {
        refreshed = await this.getValidAccessToken(providerId, { ...context, forceRefresh: true });
      } catch (error) {
        void response.body?.cancel?.();
        throw error;
      }

      if (refreshed?.accessToken) {
        void response.body?.cancel?.();
        const retry = buildRequest(refreshed);
        response = await doFetch(retry.input, retry.init);
      }
    }

    if (response.status === 401) {
      await onUnauthorized?.(response);
    }

    return response;
  }

  private getDefinition(providerId: string): OAuthProviderDefinition {
    const definition = this.definitions[providerId];

    if (!definition) {
      throw new OAuthServiceError(
        `No OAuth provider is registered for ${providerId}`,
        undefined,
        'UnknownOAuthProvider',
      );
    }

    return definition;
  }

  private createClient(
    definition: OAuthProviderDefinition,
    context: OAuthProviderContext,
  ): PkceOAuthClient {
    return new PkceOAuthClient({
      clientId: definition.clientId,
      tokenUrl: definition.resolveEndpoints(context).tokenUrl,
    });
  }

  private isExpired(expiresAt: number | undefined): boolean {
    return expiresAt !== undefined && Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  }

  private async persistTokens(
    definition: OAuthProviderDefinition,
    tokenData: { access_token: string; expires_in?: number; refresh_token?: string },
    options?: { expectedRefreshToken?: string },
  ): Promise<void> {
    const current = await this.dependencies.tokenStore.get(definition.providerId);
    const accountId = definition.extractAccountId?.(tokenData.access_token) ?? current?.accountId;

    await this.dependencies.tokenStore.set(
      definition.providerId,
      {
        accessToken: tokenData.access_token,
        // Most providers omit `refresh_token` when refreshing; dropping the
        // stored one here would make the session unrefreshable after one cycle.
        refreshToken: tokenData.refresh_token ?? current?.refreshToken,
        expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
        ...(accountId ? { accountId } : {}),
      },
      definition.clientId,
      options,
    );
  }

  private clearSession(
    definition: OAuthProviderDefinition,
    expectedRefreshToken?: string,
  ): Promise<void> {
    return this.dependencies.tokenStore.clear(definition.providerId, {
      disableProvider: definition.clearDisablesProvider,
      ...(expectedRefreshToken !== undefined ? { expectedRefreshToken } : {}),
    });
  }

  /** Replace the previously minted keys, keeping every manually entered one. */
  private async persistMintedApiKeys(providerId: string, apiKeys: string): Promise<void> {
    const retained = await this.readManualApiKeys(providerId);
    const retainedValues = new Set(retained.map((entry) => entry.key));

    const minted = apiKeys
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key && !retainedValues.has(key))
      .map((key) => ({
        id: `oauth-${randomUUID()}`,
        isEnabled: true,
        key,
        label: OAUTH_API_KEY_LABEL,
      }));

    await this.dependencies.providers.replaceApiKeys(providerId, [...retained, ...minted]);
  }

  private async dropMintedApiKeys(providerId: string): Promise<void> {
    const retained = await this.readManualApiKeys(providerId);
    await this.dependencies.providers.replaceApiKeys(providerId, retained);
  }

  private async readManualApiKeys(providerId: string): Promise<ApiKeyEntry[]> {
    const { keys } = await this.dependencies.providers.listApiKeys(providerId);
    return keys.filter((entry) => entry.label !== OAUTH_API_KEY_LABEL);
  }

  private refreshAccessToken(
    definition: OAuthProviderDefinition,
    refreshToken: string,
    context: OAuthProviderContext,
  ): Promise<RefreshResult> {
    // Key by refresh token, not just providerId: a re-login mid-refresh installs
    // a new session with a different refresh token, and its requests must run
    // their OWN refresh — never reuse (and act on the terminal result of) the
    // superseded session's in-flight refresh, which would clear the new session.
    const key = `${definition.providerId}:${refreshToken}`;
    let refreshPromise = this.refreshPromises.get(key);

    if (!refreshPromise) {
      refreshPromise = this.doRefresh(definition, refreshToken, context).finally(() => {
        this.refreshPromises.delete(key);
      });
      this.refreshPromises.set(key, refreshPromise);
    }

    return refreshPromise;
  }

  private async doRefresh(
    definition: OAuthProviderDefinition,
    refreshToken: string,
    context: OAuthProviderContext,
  ): Promise<RefreshResult> {
    try {
      const client = this.createClient(definition, context);
      const tokenData = await client.refresh(refreshToken);

      await this.persistTokens(definition, tokenData, { expectedRefreshToken: refreshToken });

      return { accessToken: tokenData.access_token, status: 'ok' };
    } catch (error) {
      logger.error(`Failed to refresh ${definition.providerId} token`, describeOAuthError(error));

      return { status: isTerminalRefreshError(error) ? 'terminal' : 'retriable' };
    }
  }
}
