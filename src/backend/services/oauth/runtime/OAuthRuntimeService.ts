import { fetch as expoFetch } from 'expo/fetch';

import { BaseService, Injectable } from '@/backend/core/lifecycle';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { describeOAuthError, OAuthServiceError, OAuthTransientError } from '@/shared/oauth';
import type { OAuthAccount, OAuthProviderContext, OAuthTokenCredentials } from '@/shared/oauth';

import { OAuthApiKeyStore, type OAuthApiKeyRepository } from '../authorization/OAuthApiKeyStore';
import { oauthProviderRepository } from '../providerRepository';
import { oauthTokenStore } from './OAuthTokenStore';
import { OAuthHttpError, PkceOAuthClient } from './PkceOAuthClient';
import { createOAuthProviderDefinitions } from './providerDefinitions';
import type { OAuthRuntimeProviderDefinition, OAuthTokenStore } from './types';

const logger = loggerService.withContext('OAuthRuntimeService');
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;
const TRANSIENT_4XX = new Set([408, 425, 429]);

type RefreshResult =
  | { accessToken: string; status: 'ok' }
  | { status: 'retriable' }
  | { status: 'terminal' };

function isTerminalRefreshError(error: unknown): boolean {
  return (
    error instanceof OAuthHttpError &&
    error.status >= 400 &&
    error.status < 500 &&
    !TRANSIENT_4XX.has(error.status)
  );
}

export type OAuthRuntimeProviderRepository = OAuthApiKeyRepository & {
  update(providerId: string, input: { isEnabled?: boolean }): Promise<unknown>;
};

/** Every entry is optional so the container can construct this with no arguments. */
export type OAuthRuntimeServiceDependencies = {
  apiKeys?: OAuthApiKeyStore;
  definitions?: Record<string, OAuthRuntimeProviderDefinition>;
  fetch?: typeof globalThis.fetch;
  providers?: OAuthRuntimeProviderRepository;
  tokenStore?: OAuthTokenStore;
};

/**
 * Long-lived provider OAuth sessions. Authorization transports and one-shot
 * API-key flows live in ProviderOAuthService and its adapters.
 */
@Injectable('OAuthRuntimeService')
export class OAuthRuntimeService extends BaseService {
  private readonly apiKeys: OAuthApiKeyStore;
  private readonly definitions: Record<string, OAuthRuntimeProviderDefinition>;
  private readonly fetch: typeof globalThis.fetch;
  private readonly providers: OAuthRuntimeProviderRepository;
  private readonly tokenStore: OAuthTokenStore;
  private readonly refreshPromises = new Map<string, Promise<RefreshResult>>();

  constructor(dependencies: OAuthRuntimeServiceDependencies = {}) {
    super();
    // Expo's fetch, not `globalThis.fetch`: this is what the composition passed
    // before the container owned construction, and the two are different clients
    // on this runtime. Defaulting to the global one would quietly change which
    // stack every token request goes through.
    this.fetch = dependencies.fetch ?? (expoFetch as typeof globalThis.fetch);
    this.definitions = dependencies.definitions ?? createOAuthProviderDefinitions(this.fetch);
    this.providers = dependencies.providers ?? oauthProviderRepository;
    this.tokenStore = dependencies.tokenStore ?? oauthTokenStore;
    this.apiKeys = dependencies.apiKeys ?? new OAuthApiKeyStore(this.providers);
  }

  protected onStop(): void {
    this.refreshPromises.clear();
  }

  async completeAuthorization(input: {
    code: string;
    codeVerifier: string;
    context?: OAuthProviderContext;
    providerId: string;
    redirectUri: string;
    signal?: AbortSignal;
  }): Promise<void> {
    const definition = this.getDefinition(input.providerId);
    const context = input.context ?? {};

    try {
      const client = this.createClient(definition, context);
      const tokenData = await client.exchangeCode(
        input.code,
        input.codeVerifier,
        input.redirectUri,
        input.signal,
      );
      if (input.signal?.aborted) {
        throw input.signal.reason ?? new Error('OAuth authorization cancelled');
      }

      // The authorization code is spent after exchange. Persist first so a
      // transient post-exchange side effect never discards a valid session.
      await this.persistTokens(definition, tokenData);
      const sideEffect = await definition.afterPersistTokens?.(tokenData, context);
      if (sideEffect?.apiKeys) {
        await this.apiKeys.replace(definition.providerId, sideEffect.apiKeys);
      }

      await this.providers.update(definition.providerId, { isEnabled: true });
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
    const config = await this.tokenStore.get(providerId);
    return { accountId: config?.accountId ?? null };
  }

  async hasToken(providerId: string): Promise<boolean> {
    const definition = this.getDefinition(providerId);
    const config = await this.tokenStore.get(providerId);
    if (!config?.accessToken) return false;

    if (this.isExpired(config.expiresAt) && !config.refreshToken) {
      await this.clearSession(definition);
      return false;
    }
    return true;
  }

  async logout(providerId: string, context: OAuthProviderContext = {}): Promise<void> {
    const definition = this.getDefinition(providerId);

    if (definition.revokeToken) {
      const config = await this.tokenStore.get(providerId);
      if (config?.accessToken) {
        try {
          await definition.revokeToken(config.accessToken, context);
        } catch (error) {
          logger.warn(`Failed to revoke ${providerId} token`, describeOAuthError(error));
        }
      }
    }

    await this.clearSession(definition);
    await this.apiKeys.clear(providerId);
    logger.info(`Cleared ${providerId} OAuth tokens`);
  }

  async getValidAccessToken(
    providerId: string,
    context: OAuthProviderContext = {},
  ): Promise<OAuthTokenCredentials | null> {
    const definition = this.getDefinition(providerId);
    const config = await this.tokenStore.get(providerId);
    if (!config?.accessToken) return null;

    if (!context.forceRefresh && !this.isExpired(config.expiresAt)) {
      return { accessToken: config.accessToken, accountId: config.accountId ?? null };
    }

    if (!config.refreshToken) {
      await this.clearSession(definition);
      return null;
    }

    const result = await this.refreshAccessToken(definition, config.refreshToken, context);
    if (result.status === 'terminal') {
      await this.clearSession(definition, config.refreshToken);
      return null;
    }
    if (result.status !== 'ok') {
      throw new OAuthTransientError(
        `Temporary failure refreshing ${providerId} token, please retry`,
      );
    }

    // The conditional store rejects a stale refresh after logout or re-login.
    // Never return credentials that did not actually become the active session.
    const refreshed = await this.tokenStore.get(providerId);
    if (refreshed?.accessToken !== result.accessToken) return null;
    return { accessToken: result.accessToken, accountId: refreshed.accountId ?? null };
  }

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
        refreshed = await this.getValidAccessToken(providerId, {
          ...context,
          forceRefresh: true,
        });
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

  private async persistTokens(
    definition: OAuthRuntimeProviderDefinition,
    tokenData: { access_token: string; expires_in?: number; refresh_token?: string },
    options?: { expectedRefreshToken?: string },
  ): Promise<void> {
    const current = await this.tokenStore.get(definition.providerId);
    const accountId = definition.extractAccountId?.(tokenData.access_token) ?? current?.accountId;

    await this.tokenStore.set(
      definition.providerId,
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? current?.refreshToken,
        expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
        ...(accountId ? { accountId } : {}),
      },
      definition.clientId,
      options,
    );
  }

  private getDefinition(providerId: string): OAuthRuntimeProviderDefinition {
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
    definition: OAuthRuntimeProviderDefinition,
    context: OAuthProviderContext,
  ): PkceOAuthClient {
    return new PkceOAuthClient({
      clientId: definition.clientId,
      fetch: this.fetch,
      tokenUrl: definition.resolveEndpoints(context).tokenUrl,
    });
  }

  private isExpired(expiresAt: number | undefined): boolean {
    return expiresAt !== undefined && Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  }

  private clearSession(
    definition: OAuthRuntimeProviderDefinition,
    expectedRefreshToken?: string,
  ): Promise<void> {
    return this.tokenStore.clear(definition.providerId, {
      disableProvider: definition.clearDisablesProvider,
      ...(expectedRefreshToken !== undefined ? { expectedRefreshToken } : {}),
    });
  }

  private refreshAccessToken(
    definition: OAuthRuntimeProviderDefinition,
    refreshToken: string,
    context: OAuthProviderContext,
  ): Promise<RefreshResult> {
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
    definition: OAuthRuntimeProviderDefinition,
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
