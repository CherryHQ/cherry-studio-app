import { loggerService } from "@logger";
import { Buffer } from "buffer";
import * as Crypto from "expo-crypto";
import { AppState, type AppStateStatus, Linking } from "react-native";
import * as z from "zod";
import { CHERRYIN_CONFIG } from "@/config/constants";
import type { ProviderService } from "@/data/services/ProviderService";
import type { AuthConfig } from "@/data/types/provider";

const logger = loggerService.withContext("CherryInOauthService");
const CHERRYIN_PROVIDER_ID = "cherryin";

// Zod schemas for API response validation
const BalanceDataSchema = z.object({
  quota: z.number(),
  used_quota: z.number(),
});

const BalanceResponseSchema = z.object({
  success: z.boolean(),
  data: BalanceDataSchema,
});

// API key can be either a string or an object with key/token property, transform to string
const ApiKeyItemSchema = z
  .union([
    z.string(),
    z.object({ key: z.string() }),
    z.object({ token: z.string() }),
  ])
  .transform((item): string => {
    if (typeof item === "string") return item;
    if ("key" in item) return item.key;
    return item.token;
  });

// Response can be array or object with data array, transform to string array
const ApiKeysResponseSchema = z
  .union([
    z.array(ApiKeyItemSchema),
    z.object({ data: z.array(ApiKeyItemSchema) }),
  ])
  .transform((data): string[] => (Array.isArray(data) ? data : data.data));

// Token response schema
const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
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
      .passthrough()
      .transform((payload) => payload.data),
    UserSelfProfileSchema.transform((profile) => profile),
  ])
  .transform((payload): CherryINProfile | null => {
    const profile = payload;

    if (!profile) {
      return null;
    }

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

export interface OauthFlowParams {
  authUrl: string;
  state: string;
}

const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;
const OAUTH_FLOW_CLEANUP_INTERVAL_MS = 60 * 1000;

// Store pending OAuth flows with PKCE verifiers (keyed by state parameter).
interface PendingOauthFlow {
  codeVerifier: string;
  oauthServer: string;
  apiHost: string;
  timestamp: number;
}

interface TokenRefreshResult {
  accessToken: string | null;
  attempted: boolean;
}

export class CherryInOauthService {
  private providerService: ProviderService | null = null;
  private pendingOAuthFlows: Map<string, PendingOauthFlow> = new Map();
  private pendingFlowPromises: Map<
    string,
    { resolve: (apiKeys: string) => void; reject: (error: Error) => void }
  > = new Map();
  private refreshAccessTokenPromise: Promise<TokenRefreshResult> | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private deepLinkSubscription: { remove: () => void } | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private listenersAttached = false;
  public isActivated = false;

  /** Must be called before any OAuth operations. */
  setProviderService(providerService: ProviderService): void {
    this.providerService = providerService;
  }

  private getProviderService(): ProviderService {
    if (!this.providerService) {
      throw new CherryInOauthServiceError(
        "CherryInOauthService: providerService not set. Call setProviderService() before using OAuth methods.",
        undefined,
        "ProviderNotSet",
      );
    }
    return this.providerService;
  }

  /**
   * Activate the service - start cleanup timer and set up listeners
   */
  async activate(): Promise<void> {
    if (this.isActivated) return;

    this.setupListeners();
    this.startCleanupInterval();
    this.isActivated = true;
    logger.debug("CherryInOauthService activated");
  }

  /**
   * Deactivate the service - stop cleanup timer and remove listeners
   */
  deactivate(): void {
    if (!this.isActivated) return;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.deepLinkSubscription) {
      this.deepLinkSubscription.remove();
      this.deepLinkSubscription = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.listenersAttached = false;
    this.isActivated = false;
    logger.debug("CherryInOauthService deactivated");
  }

  /**
   * Destroy the service - clear all state
   */
  destroy(): void {
    this.deactivate();
    this.pendingOAuthFlows.clear();
    for (const { reject } of this.pendingFlowPromises.values()) {
      reject(
        new CherryInOauthServiceError(
          "OAuth service destroyed",
          undefined,
          "ServiceDestroyed",
        ),
      );
    }
    this.pendingFlowPromises.clear();
    this.refreshAccessTokenPromise = null;
    logger.debug("CherryInOauthService destroyed");
  }

  private deactivateIfIdle(): void {
    if (this.pendingOAuthFlows.size > 0) {
      return;
    }
    this.deactivate();
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredFlows();
    }, OAUTH_FLOW_CLEANUP_INTERVAL_MS);
  }

  private cleanupExpiredFlows(): void {
    const now = Date.now();
    for (const [state, flow] of this.pendingOAuthFlows.entries()) {
      if (now - flow.timestamp > OAUTH_FLOW_TTL_MS) {
        this.pendingOAuthFlows.delete(state);
      }
    }

    this.deactivateIfIdle();
  }

  private setupListeners(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    // Handle deep links when app is already open
    this.deepLinkSubscription = Linking.addEventListener(
      "url",
      this.handleDeepLink,
    );

    // Handle initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        this.handleDeepLink({ url });
      }
    });

    // Monitor app state for foreground transitions
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (nextAppState === "active") {
          logger.debug("App returned to foreground");
        }
      },
    );
  }

  private handleDeepLink = (event: { url: string }): void => {
    const { url: urlString } = event;
    if (!urlString.startsWith(CHERRYIN_CONFIG.REDIRECT_URI)) {
      return;
    }

    try {
      const url = new URL(urlString);
      this.handleOAuthCallback(url);
    } catch (error) {
      logger.error("Failed to parse OAuth callback URL:", error as Error);
    }
  };

  private getOAuthAuthConfig = async (): Promise<Extract<
    AuthConfig,
    { type: "oauth" }
  > | null> => {
    const authConfig =
      await this.getProviderService().getAuthConfig(CHERRYIN_PROVIDER_ID);
    return authConfig?.type === "oauth" ? authConfig : null;
  };

  /**
   * Validate API host against allowlist to prevent SSRF attacks
   */
  private validateApiHost(apiHost: string): void {
    if (!CHERRYIN_CONFIG.ALLOWED_HOSTS.includes(apiHost)) {
      throw new CherryInOauthServiceError(
        `Unauthorized API host: ${apiHost}`,
        undefined,
        "InvalidHost",
      );
    }
  }

  /**
   * Generate a cryptographically random string for PKCE code_verifier
   */
  private async generateRandomString(length: number): Promise<string> {
    const charset =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = await Crypto.getRandomBytesAsync(length);
    return Array.from(bytes, (byte) => charset[byte % charset.length]).join("");
  }

  /**
   * Base64URL encode a Uint8Array (no padding, URL-safe characters)
   */
  private base64UrlEncode(buffer: Uint8Array): string {
    const base64 = Buffer.from(buffer).toString("base64");
    return base64
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  /**
   * Generate PKCE code_challenge from code_verifier using S256 method
   */
  private async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
    );
    // Convert hex string to Uint8Array
    const hashBytes = new Uint8Array(
      hash.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    return this.base64UrlEncode(hashBytes);
  }

  /**
   * Start OAuth flow - generates PKCE params, opens the browser,
   * returns a promise that resolves with API keys on successful callback.
   * @param oauthServer - OAuth server URL (e.g., https://open.cherryin.ai)
   * @param apiHost - API host URL (defaults to oauthServer)
   * @returns promise that resolves with API keys string
   */
  startOAuthFlow = async (
    oauthServer: string,
    apiHost?: string,
  ): Promise<string> => {
    this.cleanupExpiredFlows();
    this.validateApiHost(oauthServer);

    const resolvedApiHost = apiHost ?? oauthServer;
    if (apiHost) {
      this.validateApiHost(apiHost);
    }

    // Generate PKCE parameters
    const codeVerifier = await this.generateRandomString(64);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = await this.generateRandomString(32);

    const flow: PendingOauthFlow = {
      codeVerifier,
      oauthServer,
      apiHost: resolvedApiHost,
      timestamp: Date.now(),
    };

    // Store verifier and config for later use (keyed by state for CSRF protection)
    this.pendingOAuthFlows.set(state, flow);

    // Create promise that will resolve/reject when OAuth callback arrives
    const promise = new Promise<string>((resolve, reject) => {
      this.pendingFlowPromises.set(state, { resolve, reject });
    });

    await this.activate();

    // Build and open authorization URL
    const authUrl = new URL(`${oauthServer}/oauth2/auth`);
    authUrl.searchParams.set("client_id", CHERRYIN_CONFIG.CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", CHERRYIN_CONFIG.REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", CHERRYIN_CONFIG.SCOPES);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    logger.debug("Started OAuth flow, opening browser");

    // Open the auth URL in the system browser
    await this.openAuthUrl(authUrl.toString());

    return promise;
  };

  /**
   * Open the OAuth URL in the system browser
   */
  async openAuthUrl(authUrl: string): Promise<void> {
    try {
      const canOpen = await Linking.canOpenURL(authUrl);
      if (canOpen) {
        await Linking.openURL(authUrl);
      } else {
        throw new CherryInOauthServiceError(
          `Cannot open URL: ${authUrl}`,
          undefined,
          "CannotOpenUrl",
        );
      }
    } catch (error) {
      throw new CherryInOauthServiceError(
        "Failed to open OAuth URL",
        error,
        "OpenUrlFailed",
      );
    }
  }

  /**
   * Handle the OAuth deep-link callback (cherrystudio://oauth/callback?...).
   * Routed here from the deep link handler.
   */
  handleOAuthCallback = async (url: URL): Promise<void> => {
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const code = url.searchParams.get("code");

    if (!state) {
      logger.warn("OAuth callback missing state parameter, ignoring");
      return;
    }

    const flow = this.pendingOAuthFlows.get(state);
    if (!flow) {
      logger.warn("OAuth callback for unknown or expired state, ignoring");
      return;
    }
    this.pendingOAuthFlows.delete(state);

    const pendingPromise = this.pendingFlowPromises.get(state);
    this.pendingFlowPromises.delete(state);

    try {
      if (errorParam) {
        const description =
          url.searchParams.get("error_description") || errorParam;
        logger.error(`OAuth provider returned error: ${description}`);
        pendingPromise?.reject(
          new CherryInOauthServiceError(
            description,
            undefined,
            "OAuthProviderError",
          ),
        );
        return;
      }

      if (!code) {
        pendingPromise?.reject(
          new CherryInOauthServiceError(
            "No authorization code received",
            undefined,
            "MissingAuthCode",
          ),
        );
        return;
      }

      const apiKeys = await this.performTokenExchange(code, flow);
      pendingPromise?.resolve(apiKeys);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        "Token exchange failed during OAuth callback",
        error as Error,
      );
      pendingPromise?.reject(
        error instanceof CherryInOauthServiceError
          ? error
          : new CherryInOauthServiceError(
            message,
            error,
            "TokenExchangeFailed",
          ),
      );
    } finally {
      this.deactivateIfIdle();
    }
  };

  /**
   * Exchange an authorization code for tokens and fetch the user's API keys.
   */
  private performTokenExchange = async (
    code: string,
    flow: PendingOauthFlow,
  ): Promise<string> => {
    const { codeVerifier, oauthServer, apiHost } = flow;

    logger.debug("Exchanging code for token");

    try {
      const tokenResponse = await fetch(`${oauthServer}/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CHERRYIN_CONFIG.CLIENT_ID,
          code,
          redirect_uri: CHERRYIN_CONFIG.REDIRECT_URI,
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error("Token exchange failed", {
          status: tokenResponse.status,
          body: this.redactDiagnosticValue(errorText),
        });
        throw new CherryInOauthServiceError(
          `Failed to exchange code for token: ${tokenResponse.status}`,
          undefined,
          "TokenExchangeFailed",
        );
      }

      const tokenJson = await tokenResponse.json();
      const tokenData = TokenResponseSchema.parse(tokenJson);

      const { access_token: accessToken, refresh_token: refreshToken } =
        tokenData;
      logger.debug("Successfully obtained access token, fetching API keys");

      // Persist the token only after the api-keys fetch + validation succeeds
      const apiKeysResponse = await fetch(`${apiHost}/api/v1/oauth/tokens`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!apiKeysResponse.ok) {
        const errorText = await apiKeysResponse.text();
        logger.error("Failed to fetch API keys", {
          status: apiKeysResponse.status,
          body: this.redactDiagnosticValue(errorText),
        });
        throw new CherryInOauthServiceError(
          `Failed to fetch API keys: ${apiKeysResponse.status}`,
          undefined,
          "ApiKeysFetchFailed",
        );
      }

      const apiKeysJson = await apiKeysResponse.json();
      const keysArray = ApiKeysResponseSchema.parse(apiKeysJson);
      const apiKeys = keysArray.filter(Boolean).join(",");

      if (!apiKeys) {
        throw new CherryInOauthServiceError(
          "No API keys received",
          undefined,
          "NoApiKeysReceived",
        );
      }

      await this.saveTokenInternal(accessToken, refreshToken);
      logger.debug("Successfully obtained API keys");
      return apiKeys;
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error("Invalid response format", { issues: error.issues });
      }
      throw error;
    }
  };

  /**
   * Reset CherryIN provider authConfig back to api-key mode
   */
  private clearOAuthSession = async (): Promise<void> => {
    await this.getProviderService().update(CHERRYIN_PROVIDER_ID, {
      authConfig: { type: "api-key" },
    });
  };

  /**
   * Internal method to save OAuth tokens to the v2 provider auth config.
   */
  private saveTokenInternal = async (
    accessToken: string,
    refreshToken?: string,
  ): Promise<void> => {
    const currentConfig = await this.getOAuthAuthConfig();
    const nextRefreshToken = refreshToken || currentConfig?.refreshToken;

    await this.getProviderService().update(CHERRYIN_PROVIDER_ID, {
      authConfig: {
        type: "oauth",
        clientId: currentConfig?.clientId || CHERRYIN_CONFIG.CLIENT_ID,
        accessToken,
        ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {}),
      },
    });
    logger.debug("Successfully saved CherryIN OAuth tokens to auth config");
  };

  /**
   * Save OAuth tokens to provider auth config
   */
  saveToken = async (
    accessToken: string,
    refreshToken?: string,
  ): Promise<void> => {
    try {
      await this.saveTokenInternal(accessToken, refreshToken);
    } catch (error) {
      logger.error("Failed to save token:", error as Error);
      throw new CherryInOauthServiceError(
        "Failed to save OAuth token",
        error,
        "SaveTokenFailed",
      );
    }
  };

  /**
   * Read OAuth access token from provider auth config
   */
  getToken = async (): Promise<string | null> => {
    const authConfig = await this.getOAuthAuthConfig();
    return authConfig?.accessToken || null;
  };

  /**
   * Read OAuth refresh token from provider auth config
   */
  private getRefreshToken = async (): Promise<string | null> => {
    const authConfig = await this.getOAuthAuthConfig();
    return authConfig?.refreshToken || null;
  };

  /**
   * Check if OAuth token exists
   */
  hasToken = async (): Promise<boolean> => {
    const token = await this.getToken();
    return !!token;
  };

  /**
   * Refresh access token using refresh token
   */
  private doRefreshAccessToken = async (
    apiHost: string,
  ): Promise<TokenRefreshResult> => {
    try {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        logger.warn("No refresh token available");
        return { accessToken: null, attempted: false };
      }

      logger.info("Attempting to refresh access token");

      const response = await fetch(`${apiHost}/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: CHERRYIN_CONFIG.CLIENT_ID,
        }).toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Token refresh failed", {
          status: response.status,
          body: this.redactDiagnosticValue(errorText),
        });
        return { accessToken: null, attempted: true };
      }

      const tokenJson = await response.json();
      const tokenData = TokenResponseSchema.parse(tokenJson);
      const { access_token: newAccessToken, refresh_token: newRefreshToken } =
        tokenData;

      // Save new tokens using internal method
      await this.saveTokenInternal(newAccessToken, newRefreshToken);
      logger.info("Successfully refreshed access token");
      return { accessToken: newAccessToken, attempted: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error("Invalid token refresh response format:", {
          issues: error.issues,
        });
        return { accessToken: null, attempted: true };
      }
      logger.error("Failed to refresh token:", error as Error);
      return { accessToken: null, attempted: true };
    }
  };

  private refreshAccessToken = async (
    apiHost: string,
  ): Promise<TokenRefreshResult> => {
    if (this.refreshAccessTokenPromise) {
      logger.debug("Joining in-flight CherryIN OAuth token refresh");
      return this.refreshAccessTokenPromise;
    }

    this.refreshAccessTokenPromise = this.doRefreshAccessToken(apiHost).finally(
      () => {
        this.refreshAccessTokenPromise = null;
      },
    );

    return this.refreshAccessTokenPromise;
  };

  private redactDiagnosticValue = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value
        .replace(/Bearer\s+\S+/gi, "Bearer <redacted>")
        .replace(
          /\b(refresh_token|access_token|code|client_secret)=([^&\s]+)/gi,
          "$1=<redacted>",
        )
        .replace(/[\w-]*token["']?\s*:\s*["'][^"']+["']/gi, (match) =>
          match.replace(/:\s*["'][^"']+["']/, ': "<redacted>"'),
        );
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactDiagnosticValue(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          /token|authorization|api[-_]?key/i.test(key)
            ? "<redacted>"
            : this.redactDiagnosticValue(item),
        ]),
      );
    }

    return value;
  };

  private readResponseBodyForDiagnostics = async (
    response: Response,
  ): Promise<unknown> => {
    if (typeof response.clone !== "function") {
      return null;
    }

    try {
      const text = await response.clone().text();
      if (!text) {
        return null;
      }

      try {
        return this.redactDiagnosticValue(JSON.parse(text));
      } catch {
        return this.redactDiagnosticValue(text);
      }
    } catch (error) {
      logger.warn(
        "Failed to read CherryIN error response body for diagnostics:",
        error as Error,
      );
      return null;
    }
  };

  private logUnauthorizedResponse = async (
    apiHost: string,
    endpoint: string,
    response: Response,
    requestOptions: RequestInit,
  ): Promise<void> => {
    logger.error("CherryIN request returned 401 Unauthorized", {
      stage: endpoint,
      request: {
        url: `${apiHost}${endpoint}`,
        method: requestOptions.method ?? "GET",
        headers: this.redactDiagnosticValue(requestOptions.headers ?? {}),
        body: requestOptions.body
          ? this.redactDiagnosticValue(String(requestOptions.body))
          : null,
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: {},
        body: await this.readResponseBodyForDiagnostics(response),
      },
    });
  };

  /**
   * Make authenticated API request with automatic token refresh on 401
   */
  private authenticatedFetch = async (
    apiHost: string,
    endpoint: string,
    options: RequestInit = {},
  ): Promise<Response> => {
    const token = await this.getToken();
    if (!token) {
      throw new CherryInOauthServiceError(
        "No OAuth token found",
        undefined,
        "NoTokenFound",
      );
    }

    const makeRequest = async (accessToken: string): Promise<Response> => {
      const requestOptions: RequestInit = {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      };

      return fetch(`${apiHost}${endpoint}`, requestOptions);
    };

    let response = await makeRequest(token);

    if (response.status === 401) {
      logger.info("Got 401, attempting token refresh");
      const refreshResult = await this.refreshAccessToken(apiHost);
      if (refreshResult.accessToken) {
        response = await makeRequest(refreshResult.accessToken);
      } else {
        // No usable access token after refresh — clear the OAuth session so the
        // UI stops reporting "logged in" and surface a typed error for the caller.
        // Guard the clear: if ProviderService.update rejects (DB write failure,
        // schema validation), we still need OAuthSessionExpired to surface so
        // the caller doesn't see a raw DB error and the UI keeps thinking it's
        // logged in. The clear-failure is logged for diagnostics.
        try {
          await this.clearOAuthSession();
        } catch (clearError) {
          logger.error(
            "Failed to clear OAuth session after refresh failure",
            clearError as Error,
          );
        }
        throw new CherryInOauthServiceError(
          refreshResult.attempted
            ? "OAuth session expired: failed to refresh access token"
            : "OAuth session expired: no refresh token available",
          undefined,
          "OAuthSessionExpired",
        );
      }
    }

    if (response.status === 401) {
      await this.logUnauthorizedResponse(apiHost, endpoint, response, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: "Bearer <redacted>",
          "Content-Type": "application/json",
        },
      });
    }

    return response;
  };

  private getProfile = async (
    apiHost: string,
  ): Promise<CherryINProfile | null> => {
    try {
      const response = await this.authenticatedFetch(apiHost, "/api/user/self");

      if (!response.ok) {
        logger.warn("Failed to fetch CherryIN profile", {
          status: response.status,
          statusText: response.statusText,
          body: await this.readResponseBodyForDiagnostics(response),
        });
        return null;
      }

      const json = await response.json();
      return UserSelfResponseSchema.parse(json);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn("Failed to parse CherryIN profile response:", {
          issues: error.issues,
        });
      } else {
        logger.warn("Failed to fetch CherryIN profile:", error as Error);
      }
      return null;
    }
  };

  /**
   * Get user balance from CherryIN API
   */
  getBalance = async (apiHost: string): Promise<BalanceResponse> => {
    this.validateApiHost(apiHost);

    try {
      const response = await this.authenticatedFetch(
        apiHost,
        "/api/v1/oauth/balance",
      );

      if (!response.ok) {
        throw new CherryInOauthServiceError(
          `HTTP ${response.status} ${response.statusText} from /api/v1/oauth/balance`,
          undefined,
          "BalanceFetchFailed",
        );
      }

      const json = await response.json();
      logger.debug("Balance API raw response:", json);
      const parsed = BalanceResponseSchema.parse(json);

      if (!parsed.success) {
        throw new CherryInOauthServiceError(
          "API returned success: false",
          undefined,
          "BalanceApiError",
        );
      }

      const { quota, used_quota: usedQuota } = parsed.data;
      const profile = await this.getProfile(apiHost);
      // quota = remaining balance
      // Convert to USD: 500000 units = 1 USD
      const balance = quota / 500000;
      const monthlySpend = usedQuota / 500000;
      logger.info("Balance fetched successfully", {
        balance,
        usedQuota,
        monthlySpend,
      });
      return {
        balance,
        profile,
        monthlyUsageTokens: null,
        monthlySpend,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error("Invalid balance response format:", {
          issues: error.issues,
        });
        throw new CherryInOauthServiceError(
          "Invalid response format from server",
          error,
          "BalanceParseError",
        );
      }
      logger.error("Failed to get balance:", error as Error);
      const detail =
        error instanceof Error && error.message ? `: ${error.message}` : "";
      throw new CherryInOauthServiceError(
        `Failed to get balance${detail}`,
        error,
        "BalanceFetchFailed",
      );
    }
  };

  /**
   * Revoke OAuth token and clear it from provider auth config
   */
  logout = async (apiHost: string): Promise<void> => {
    this.validateApiHost(apiHost);

    try {
      const token = await this.getToken();

      if (token) {
        try {
          await fetch(`${apiHost}/oauth2/revoke`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              token: token,
              token_type_hint: "access_token",
            }).toString(),
          });
          logger.debug("Successfully revoked token on server");
        } catch (revokeError) {
          logger.warn(
            "Failed to revoke token on server:",
            revokeError as Error,
          );
        }
      }

      await this.getProviderService().update(CHERRYIN_PROVIDER_ID, {
        authConfig: {
          type: "api-key",
        },
      });
      logger.debug(
        "Successfully cleared CherryIN OAuth tokens from auth config",
      );
    } catch (error) {
      logger.error("Failed to logout:", error as Error);
      throw new CherryInOauthServiceError(
        "Failed to logout",
        error,
        "LogoutFailed",
      );
    }
  };
}

class CherryInOauthServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "CherryInOauthServiceError";
  }
}

export const cherryInOauthService = new CherryInOauthService();
