import type { OAuthProviderContext, OAuthTokenCredentials } from '@/shared/oauth';

import type { OAuthTokenResponse } from './PkceOAuthClient';

export interface OAuthTokenStoreData {
  accessToken?: string;
  accountId?: string;
  expiresAt?: number;
  refreshToken?: string;
}

export interface OAuthTokenStore {
  clear(
    providerId: string,
    options?: { disableProvider?: boolean; expectedRefreshToken?: string },
  ): Promise<void>;
  get(providerId: string): Promise<OAuthTokenStoreData | null>;
  set(
    providerId: string,
    data: OAuthTokenStoreData,
    clientId: string,
    options?: { expectedRefreshToken?: string },
  ): Promise<void>;
}

export type OAuthAuthenticatedFetch = (
  providerId: string,
  buildRequest: (credentials: OAuthTokenCredentials) => {
    init: RequestInit;
    input: RequestInfo | URL;
  },
  doFetch: (input: RequestInfo | URL, init: RequestInit) => Promise<Response>,
  options?: {
    context?: OAuthProviderContext;
    notSignedInMessage?: string;
    onUnauthorized?: (response: Response) => Promise<void> | void;
  },
) => Promise<Response>;

export interface OAuthRuntimeProviderDefinition {
  clearDisablesProvider?: boolean;
  clientId: string;
  extractAccountId?(accessToken: string): string | null;
  providerId: string;
  redirect: { path: string; scheme: string };
  resolveEndpoints(context?: OAuthProviderContext): { authorizeUrl: string; tokenUrl: string };
  scopes: string;
  afterPersistTokens?(
    tokenData: OAuthTokenResponse,
    context: OAuthProviderContext,
  ): Promise<{ apiKeys?: string } | void>;
  revokeToken?(accessToken: string, context: OAuthProviderContext): Promise<void>;
}
