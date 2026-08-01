export interface OAuthAccount {
  /** Provider account id associated with the OAuth session, when available. */
  accountId: string | null;
}

export interface OAuthTokenCredentials {
  accessToken: string;
  accountId?: string | null;
}

export interface OAuthTokenStoreData {
  accessToken?: string;
  accountId?: string;
  /** Absolute epoch milliseconds, not the `expires_in` offset. */
  expiresAt?: number;
  refreshToken?: string;
}

export interface OAuthTokenStore {
  clear(
    providerId: string,
    options?: {
      disableProvider?: boolean;
      /**
       * Conditional clear (a terminal refresh failure): only drop the session
       * when it still carries this refresh token, so a re-login that landed
       * during the failed refresh is not torn down with it. Omit for a
       * user-initiated logout, which clears unconditionally.
       */
      expectedRefreshToken?: string;
    },
  ): Promise<void>;
  get(providerId: string): Promise<OAuthTokenStoreData | null>;
  /**
   * Persist the OAuth session. When `expectedRefreshToken` is given the write is
   * a no-op unless the stored session is still OAuth *and* still carries that
   * exact refresh token — the refresh path uses it so a network round-trip that
   * resolves after a logout (session → api-key) or a re-login (a different
   * session) cannot clobber the current credential with its now-stale token.
   */
  set(
    providerId: string,
    data: OAuthTokenStoreData,
    clientId: string,
    options?: { expectedRefreshToken?: string },
  ): Promise<void>;
}

export interface OAuthProviderContext {
  apiHost?: string;
  /** Bypass the local expiry check and refresh anyway (the 401 retry path). */
  forceRefresh?: boolean;
  oauthServer?: string;
}

export interface OAuthEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
}

/**
 * Deep-link redirect parts rather than a finished URI: `expo-auth-session`'s
 * `makeRedirectUri` resolves a different URI under a dev client than in a
 * standalone build, so the frontend must assemble it. The assembled value
 * travels back through `OAuthModule.completeAuthorization` because RFC 6749
 * requires the exchange to echo the exact `redirect_uri` that was authorized.
 */
export interface OAuthRedirect {
  path: string;
  scheme: string;
}

/** The narrow view the frontend needs to build an authorization request. */
export interface OAuthAuthorizeConfig {
  authorizeUrl: string;
  clientId: string;
  redirect: OAuthRedirect;
  scopes: string;
}

export interface OAuthTokenExchangeSideEffectResult {
  apiKeys?: string;
}

export interface OAuthProviderDefinition {
  /**
   * Whether clearing the OAuth session (logout / unrecoverable token loss) also
   * disables the provider. `true` for OAuth-only providers where no credential
   * remains; `false`/omitted for providers that can fall back to a manual API
   * key (CherryIN), so logout never strips that key's enablement.
   */
  clearDisablesProvider?: boolean;
  clientId: string;
  extractAccountId?(accessToken: string): string | null;
  providerId: string;
  redirect: OAuthRedirect;
  resolveEndpoints(context?: OAuthProviderContext): OAuthEndpoints;
  scopes: string;
  /**
   * Post-exchange side effect, run *after* the tokens are persisted so a failure
   * here never discards a valid token (CherryIN fetches the user's API keys).
   */
  afterPersistTokens?(
    tokenData: { access_token: string; expires_in?: number; refresh_token?: string },
    context: OAuthProviderContext,
  ): Promise<OAuthTokenExchangeSideEffectResult | void>;
  /**
   * Tell the provider to invalidate the token server-side on logout. Best
   * effort: the local session is cleared whether or not this succeeds.
   */
  revokeToken?(accessToken: string, context: OAuthProviderContext): Promise<void>;
}
