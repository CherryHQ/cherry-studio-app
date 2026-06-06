import { loggerService } from '@logger';
import { randomUUID } from 'expo-crypto';
import * as z from 'zod';
import { CHERRYIN_CONFIG } from '@/config/constants';
import type { ProviderService } from '@/data/services/ProviderService';
import type { ApiKeyEntry, AuthConfig } from '@/data/types/provider';

const logger = loggerService.withContext('CherryInOauthService');
const CHERRYIN_PROVIDER_ID = 'cherryin';

/** Conversion factor from quota units to balance/spend (1 unit = 500000 quota) */
const QUOTA_TO_BALANCE_DIVISOR = 500000;

// Zod schemas for API response validation
const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});

const ApiKeyItemSchema = z
  .union([z.string(), z.object({ key: z.string() }), z.object({ token: z.string() })])
  .transform((item): string => {
    if (typeof item === 'string') return item;
    if ('key' in item) return item.key;
    return item.token;
  });

const ApiKeysResponseSchema = z
  .union([z.array(ApiKeyItemSchema), z.object({ data: z.array(ApiKeyItemSchema) })])
  .transform((data): string[] => (Array.isArray(data) ? data : data.data));

const BalanceDataSchema = z.object({
  quota: z.number(),
  used_quota: z.number(),
});

const BalanceResponseSchema = z.object({
  success: z.boolean(),
  data: BalanceDataSchema,
});

const UserSelfProfileSchema = z.object({
  display_name: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  group: z.string().optional().nullable(),
});

const UserSelfResponseSchema = z
  .union([
    z
      .object({ data: UserSelfProfileSchema.nullable() })
      .strip()
      .transform((payload) => payload.data),
    UserSelfProfileSchema.transform((profile) => profile),
  ])
  .transform((payload): CherryINProfile | null => {
    const profile = payload;
    if (!profile) return null;
    return {
      displayName: profile.display_name ?? null,
      username: profile.username ?? null,
      email: profile.email ?? null,
      group: profile.group ?? null,
    };
  });

// Export types for use in other modules
export interface BalanceResponse {
  balance: number;
  profile: CherryINProfile | null;
  monthlyUsageTokens: number | null;
  monthlySpend: number | null;
}

export interface CherryINProfile {
  displayName: string | null;
  username: string | null;
  email: string | null;
  group: string | null;
}

interface TokenRefreshResult {
  accessToken: string | null;
  attempted: boolean;
}

class CherryInOauthServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'CherryInOauthServiceError';
  }
}

export class CherryInOauthService {
  private static instance: CherryInOauthService | null = null;
  private refreshAccessTokenPromise: Promise<TokenRefreshResult> | null = null;

  private constructor(private providerService: ProviderService) {}

  static getInstance(providerService: ProviderService): CherryInOauthService {
    if (!CherryInOauthService.instance) {
      CherryInOauthService.instance = new CherryInOauthService(providerService);
    } else {
      // Update providerService if a new instance is provided
      CherryInOauthService.instance.providerService = providerService;
    }
    return CherryInOauthService.instance;
  }
  /**
   * Complete OAuth flow (code + verifier → API keys).
   * Used when the OAuth callback is handled externally and all params
   * are provided at once.
   */
  async completeOAuth({
    oauthServer,
    apiHost,
    code,
    codeVerifier,
    redirectUri,
  }: {
    oauthServer: string;
    apiHost: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<string> {
    this.validateApiHost(oauthServer);
    this.validateApiHost(apiHost);

    const { accessToken, refreshToken } = await this.exchangeAuthorizationCode(
      oauthServer,
      code,
      codeVerifier,
      redirectUri,
    );
    const apiKeys = await this.fetchCherryInApiKeys(apiHost, accessToken);
    await this.saveOAuthConfig(accessToken, refreshToken);
    return apiKeys;
  }

  /**
   * Parse a comma-separated API keys string into structured entries.
   */
  parseApiKeys(apiKeysString: string): ApiKeyEntry[] {
    const keys = apiKeysString
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean);

    return keys.map((key) => ({
      id: `oauth-${randomUUID()}`,
      isEnabled: true,
      key,
      label: 'OAuth' as const,
    }));
  }

  /**
   * Get non-OAuth API keys from the provider's full key list.
   */
  async getNonOAuthApiKeys(providerId: string): Promise<ApiKeyEntry[]> {
    const { keys } = await this.providerService.listApiKeys(providerId);
    return keys.filter((k) => k.label !== 'OAuth');
  }

  /**
   * Complete OAuth login persistence
   */
  async saveOAuthResult(providerId: string, apiKeysString: string): Promise<void> {
    const { keys: existingKeys } = await this.providerService.listApiKeys(providerId);
    const nonOAuthKeys = existingKeys.filter((k) => k.label !== 'OAuth');
    const newOAuthKeys = this.parseApiKeys(apiKeysString);
    const existingKeySet = new Set(nonOAuthKeys.map((k) => k.key));
    const dedupedOAuthKeys = newOAuthKeys.filter((k) => !existingKeySet.has(k.key));
    await this.providerService.replaceApiKeys(providerId, [...nonOAuthKeys, ...dedupedOAuthKeys]);
    await this.providerService.update(providerId, { isEnabled: true });
  }

  /**
   * Refresh access token using refresh token.
   * Returns the new access token, or null if refresh is not possible.
   * Includes in-flight deduplication to prevent concurrent refresh requests.
   */
  async refreshAccessToken(apiHost: string): Promise<string | null> {
    // Check if there's already an in-flight refresh request
    if (this.refreshAccessTokenPromise) {
      logger.debug('Joining in-flight CherryIN OAuth token refresh');
      const result = await this.refreshAccessTokenPromise;
      return result.accessToken;
    }

    // Create new refresh promise with deduplication
    this.refreshAccessTokenPromise = this.doRefreshAccessTokenInternal(apiHost).finally(() => {
      this.refreshAccessTokenPromise = null;
    });

    const result = await this.refreshAccessTokenPromise;
    return result.accessToken;
  }

  /**
   * Logout — revoke token on server and clear local auth config.
   */
  async logout(apiHost: string): Promise<void> {
    this.validateApiHost(apiHost);

    try {
      const token = await this.getToken();

      if (token) {
        try {
          await fetch(`${apiHost}/oauth2/revoke`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              token,
              token_type_hint: 'access_token',
            }).toString(),
          });
          logger.debug('Successfully revoked token on server');
        } catch (revokeError) {
          logger.warn('Failed to revoke token on server:', revokeError as Error);
        }
      }

      await this.clearOAuthSession();
      logger.debug('Successfully cleared CherryIN OAuth tokens from auth config');
    } catch (error) {
      logger.error('Failed to logout:', error as Error);
      throw new CherryInOauthServiceError('Failed to logout', error, 'LogoutFailed');
    }
  }

  /**
   * Read OAuth access token from provider auth config.
   */
  async getToken(): Promise<string | null> {
    const authConfig = await this.getOAuthAuthConfig();
    return authConfig?.accessToken ?? null;
  }

  /**
   * Check if OAuth token exists.
   */
  async hasToken(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  /**
   * Get user balance from CherryIN API.
   */
  async getBalance(apiHost: string): Promise<BalanceResponse> {
    this.validateApiHost(apiHost);

    try {
      const response = await this.authenticatedFetch(apiHost, '/api/v1/oauth/balance');

      if (!response.ok) {
        throw new CherryInOauthServiceError(
          `HTTP ${response.status} ${response.statusText} from /api/v1/oauth/balance`,
          undefined,
          'BalanceFetchFailed',
        );
      }

      const json = await response.json();
      logger.debug('Balance API raw response:', json);
      const parsed = BalanceResponseSchema.parse(json);

      if (!parsed.success) {
        throw new CherryInOauthServiceError(
          'API returned success: false',
          undefined,
          'BalanceApiError',
        );
      }

      const { quota, used_quota: usedQuota } = parsed.data;
      const profile = await this.getProfile(apiHost);
      const balance = quota / QUOTA_TO_BALANCE_DIVISOR;
      const monthlySpend = usedQuota / QUOTA_TO_BALANCE_DIVISOR;
      logger.info('Balance fetched successfully', { balance, usedQuota, monthlySpend });
      return { balance, profile, monthlyUsageTokens: null, monthlySpend };
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid balance response format:', { issues: error.issues });
        throw new CherryInOauthServiceError(
          'Invalid response format from server',
          error,
          'BalanceParseError',
        );
      }
      logger.error('Failed to get balance:', error as Error);
      const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
      throw new CherryInOauthServiceError(
        `Failed to get balance${detail}`,
        error,
        'BalanceFetchFailed',
      );
    }
  }

  /**
   * Exchange authorization code for access/refresh tokens.
   */
  private async exchangeAuthorizationCode(
    oauthServer: string,
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    logger.debug('Exchanging code for token');

    const tokenResponse = await fetch(`${oauthServer}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CHERRYIN_CONFIG.CLIENT_ID,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('Token exchange failed', {
        status: tokenResponse.status,
        body: this.redactDiagnosticValue(errorText),
      });
      throw new CherryInOauthServiceError(
        `Failed to exchange code for token: ${tokenResponse.status}`,
        undefined,
        'TokenExchangeFailed',
      );
    }

    const tokenJson = await tokenResponse.json();
    const tokenData = TokenResponseSchema.parse(tokenJson);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
    };
  }

  /**
   * Fetch CherryIN API keys using the access token.
   */
  private async fetchCherryInApiKeys(apiHost: string, accessToken: string): Promise<string> {
    logger.debug('Fetching API keys');

    const response = await fetch(`${apiHost}/api/v1/oauth/tokens`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to fetch API keys', {
        status: response.status,
        body: this.redactDiagnosticValue(errorText),
      });
      throw new CherryInOauthServiceError(
        `Failed to fetch API keys: ${response.status}`,
        undefined,
        'ApiKeysFetchFailed',
      );
    }

    const json = await response.json();
    const keysArray = ApiKeysResponseSchema.parse(json);
    const apiKeys = keysArray.filter(Boolean).join(',');

    if (!apiKeys) {
      throw new CherryInOauthServiceError('No API keys received', undefined, 'NoApiKeysReceived');
    }

    return apiKeys;
  }

  /**
   * Save OAuth tokens to provider auth config.
   */
  private async saveOAuthConfig(accessToken: string, refreshToken?: string): Promise<void> {
    const currentConfig = await this.getOAuthAuthConfig();
    const nextRefreshToken = refreshToken || currentConfig?.refreshToken;

    await this.providerService.update(CHERRYIN_PROVIDER_ID, {
      authConfig: {
        type: 'oauth',
        clientId: currentConfig?.clientId || CHERRYIN_CONFIG.CLIENT_ID,
        accessToken,
        ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {}),
      },
    });
    logger.debug('Successfully saved CherryIN OAuth tokens to auth config');
  }

  private async getOAuthAuthConfig(): Promise<Extract<AuthConfig, { type: 'oauth' }> | null> {
    const authConfig = await this.providerService.getAuthConfig(CHERRYIN_PROVIDER_ID);
    return authConfig?.type === 'oauth' ? authConfig : null;
  }

  private async getRefreshToken(): Promise<string | null> {
    const authConfig = await this.getOAuthAuthConfig();
    return authConfig?.refreshToken ?? null;
  }

  private async clearOAuthSession(): Promise<void> {
    await this.providerService.update(CHERRYIN_PROVIDER_ID, {
      authConfig: { type: 'api-key' },
    });
  }

  private async doRefreshAccessTokenInternal(apiHost: string): Promise<TokenRefreshResult> {
    try {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        logger.warn('No refresh token available');
        return { accessToken: null, attempted: false };
      }

      logger.info('Attempting to refresh access token');

      const response = await fetch(`${apiHost}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: CHERRYIN_CONFIG.CLIENT_ID,
        }).toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Token refresh failed', {
          status: response.status,
          body: this.redactDiagnosticValue(errorText),
        });
        return { accessToken: null, attempted: true };
      }

      const tokenJson = await response.json();
      const tokenData = TokenResponseSchema.parse(tokenJson);
      const { access_token: newAccessToken, refresh_token: newRefreshToken } = tokenData;

      await this.saveOAuthConfig(newAccessToken, newRefreshToken);
      logger.info('Successfully refreshed access token');
      return { accessToken: newAccessToken, attempted: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid token refresh response format:', { issues: error.issues });
        return { accessToken: null, attempted: true };
      }
      logger.error('Failed to refresh token:', error as Error);
      return { accessToken: null, attempted: true };
    }
  }

  private authenticatedFetch = async (
    apiHost: string,
    endpoint: string,
    options: RequestInit = {},
  ): Promise<Response> => {
    const token = await this.getToken();
    if (!token) {
      throw new CherryInOauthServiceError('No OAuth token found', undefined, 'NoTokenFound');
    }

    const makeRequest = async (accessToken: string): Promise<Response> => {
      const requestOptions: RequestInit = {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      };
      return fetch(`${apiHost}${endpoint}`, requestOptions);
    };

    let response = await makeRequest(token);

    if (response.status === 401) {
      logger.info('Got 401, attempting token refresh');
      const newToken = await this.refreshAccessToken(apiHost);
      if (newToken) {
        response = await makeRequest(newToken);
      } else {
        const hadRefreshToken = !!(await this.getRefreshToken());
        try {
          await this.clearOAuthSession();
        } catch (clearError) {
          logger.error('Failed to clear OAuth session after refresh failure', clearError as Error);
        }
        throw new CherryInOauthServiceError(
          hadRefreshToken
            ? 'OAuth session expired: failed to refresh access token'
            : 'OAuth session expired: no refresh token available',
          undefined,
          'OAuthSessionExpired',
        );
      }
    }

    return response;
  };

  private async getProfile(apiHost: string): Promise<CherryINProfile | null> {
    try {
      const response = await this.authenticatedFetch(apiHost, '/api/user/self');
      if (!response.ok) {
        logger.warn('Failed to fetch CherryIN profile', {
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }
      const json = await response.json();
      return UserSelfResponseSchema.parse(json);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Failed to parse CherryIN profile response:', { issues: error.issues });
      } else {
        logger.warn('Failed to fetch CherryIN profile:', error as Error);
      }
      return null;
    }
  }

  private validateApiHost(apiHost: string): void {
    if (!CHERRYIN_CONFIG.ALLOWED_HOSTS.includes(apiHost)) {
      throw new CherryInOauthServiceError(
        `Unauthorized API host: ${apiHost}`,
        undefined,
        'InvalidHost',
      );
    }
  }

  private redactDiagnosticValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value
        .replace(/Bearer\s+\S+/gi, 'Bearer <redacted>')
        .replace(/\b(refresh_token|access_token|code|client_secret)=([^&\s]+)/gi, '$1=<redacted>')
        .replace(/[\w-]*token["']?\s*:\s*["'][^"']+["']/gi, (match) =>
          match.replace(/:\s*["'][^"']+["']/, ': "<redacted>"'),
        );
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactDiagnosticValue(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          /token|authorization|api[-_]?key/i.test(key)
            ? '<redacted>'
            : this.redactDiagnosticValue(item),
        ]),
      );
    }

    return value;
  }
}
