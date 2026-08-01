import * as z from 'zod';

/**
 * Token endpoint response. A superset of what every provider returns — the
 * fields only some providers care about (`id_token`, `expires_in`) are optional
 * so one schema validates CherryIN and every provider added later.
 */
export const OAuthTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  id_token: z.string().optional(),
  refresh_token: z.string().optional(),
  token_type: z.string().optional(),
});

export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;

export interface PkceOAuthClientConfig {
  clientId: string;
  /** Full token endpoint URL, used for both code exchange and refresh. */
  tokenUrl: string;
}

/**
 * Thrown when the token endpoint returns a non-2xx response. Carries the raw
 * status and body: the status is what `OAuthRuntimeService` grades a refresh
 * failure by (terminal vs retriable), and the body is left to the caller to
 * redact rather than being logged here.
 */
export class OAuthHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'OAuthHttpError';
  }
}

/**
 * The token half of an Authorization Code + PKCE flow: it turns a `code` into
 * tokens and exchanges refresh tokens.
 *
 * The authorization half — PKCE generation, the authorize URL, the browser
 * round-trip and `state` verification — belongs to `expo-auth-session` in the
 * frontend, so this deliberately has no `createAuthorizationRequest`. Token
 * persistence and post-auth side effects stay with the caller.
 */
export class PkceOAuthClient {
  constructor(private readonly config: PkceOAuthClientConfig) {}

  /**
   * Exchange an authorization `code` (plus its PKCE verifier) for tokens.
   *
   * `redirectUri` is a parameter rather than client config because
   * `expo-auth-session` resolves a different URI under a dev client than in a
   * standalone build, and RFC 6749 requires this request to echo the exact URI
   * the code was authorized against.
   */
  exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<OAuthTokenResponse> {
    return this.postToken(
      {
        client_id: this.config.clientId,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      },
      'Failed to exchange code for token',
    );
  }

  /** Exchange a refresh token for a fresh access token. */
  refresh(refreshToken: string): Promise<OAuthTokenResponse> {
    return this.postToken(
      {
        client_id: this.config.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      'Failed to refresh access token',
    );
  }

  private async postToken(
    params: Record<string, string>,
    errorPrefix: string,
  ): Promise<OAuthTokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      body: new URLSearchParams(params).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new OAuthHttpError(`${errorPrefix}: ${response.status}`, response.status, body);
    }

    return OAuthTokenResponseSchema.parse(await response.json());
  }
}
