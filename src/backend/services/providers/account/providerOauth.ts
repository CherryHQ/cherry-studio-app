import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';
import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { ProviderAccountError } from '@/shared/contracts/providerAccounts';

const secret = z.string().min(1).max(16_384).regex(/^\S+$/);
const NativeSchemeSchema = z.enum(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview']);
export const ProviderOauthApplicationSchema = z.object({
  clientId: z.string().min(1).max(256).regex(/^\S+$/),
  redirectUrl: z.enum([
    'cherrystudio://oauth/callback',
    'cherrystudio-dev://oauth/callback',
    'cherrystudio-preview://oauth/callback',
  ]),
});
export type ProviderOauthApplication = z.infer<typeof ProviderOauthApplicationSchema>;
export const ProviderOauthTokensSchema = z.object({
  accessToken: secret,
  refreshToken: secret.optional(),
  expiresAt: z.number().finite().optional(),
});
export type ProviderOauthTokens = z.infer<typeof ProviderOauthTokensSchema>;
const TokenResponseSchema = z.object({
  access_token: secret,
  refresh_token: secret.optional(),
  expires_in: z.number().positive().finite().optional(),
  token_type: z
    .string()
    .regex(/^bearer$/i)
    .optional(),
});
const OAuthErrorSchema = z.object({
  error: z.enum(['invalid_grant', 'invalid_client', 'unauthorized_client']),
});

export function providerAccountError(error: unknown, signal?: AbortSignal): ProviderAccountError {
  if (signal?.aborted) return new ProviderAccountError('cancelled');
  if (error instanceof ProviderAccountError) return error;
  if (isHttpError(error)) {
    if (error.code === 'invalid_client' || error.code === 'unauthorized_client')
      return new ProviderAccountError('configuration');
    if (error.code === 'invalid_grant' || error.status === 401)
      return new ProviderAccountError('authorization');
    return new ProviderAccountError(
      !error.status || error.status >= 500 || error.status === 429 ? 'network' : 'request',
    );
  }
  return new ProviderAccountError('request');
}

function nativeScheme() {
  const configured = Constants.expoConfig?.scheme;
  const parsed = NativeSchemeSchema.safeParse(
    Array.isArray(configured) ? configured[0] : configured,
  );
  if (!parsed.success) throw new ProviderAccountError('configuration');
  return parsed.data;
}

export function getProviderOauthApplication(clientId: string): ProviderOauthApplication {
  const parsed = ProviderOauthApplicationSchema.safeParse({
    clientId,
    redirectUrl: `${nativeScheme()}://oauth/callback`,
  });
  if (!parsed.success) throw new ProviderAccountError('configuration');
  return parsed.data;
}

/** A navigation-only recharge return; no payment result is trusted from this URL. */
export function getProviderAccountReturnUrl(providerId: string): string {
  return `${nativeScheme()}://settings/provider/${encodeURIComponent(providerId)}`;
}

const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomValue = () => base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));

function httpsUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new ProviderAccountError('configuration');
  return url;
}

function endpoint(value: string) {
  const url = httpsUrl(value);
  return {
    client: createHttpClient({ baseUrl: url.origin, timeoutMs: 15_000 }),
    path: url.pathname + url.search,
  };
}

/** Shared public-client authorization-code flow. All endpoints come from trusted adapter code. */
export function createProviderOauthClient(config: {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string;
  revokeUrl?: string;
}) {
  const authorizationUrl = httpsUrl(config.authorizationUrl);
  const tokenEndpoint = endpoint(config.tokenUrl);
  const revokeEndpoint = config.revokeUrl ? endpoint(config.revokeUrl) : undefined;

  async function tokenRequest(
    body: Record<string, string>,
    signal: AbortSignal,
  ): Promise<ProviderOauthTokens> {
    const startedAt = Date.now();
    try {
      const response = await tokenEndpoint.client.request<unknown>({
        method: 'POST',
        path: tokenEndpoint.path,
        body: new URLSearchParams(body).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        redirect: 'error',
        maxResponseBytes: 65_536,
        signal,
        errorDecoder: ({ data }) => {
          const parsed = OAuthErrorSchema.safeParse(data);
          return parsed.success
            ? { code: parsed.data.error, message: 'Provider authorization rejected.' }
            : undefined;
        },
      });
      const failure = OAuthErrorSchema.safeParse(response.data);
      if (failure.success)
        throw new ProviderAccountError(
          failure.data.error === 'invalid_grant' ? 'authorization' : 'configuration',
        );
      const parsed = TokenResponseSchema.safeParse(response.data);
      if (!parsed.success) throw new ProviderAccountError('request');
      const data = parsed.data;
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? startedAt + data.expires_in * 1000 : undefined,
      };
    } catch (error) {
      throw providerAccountError(error, signal);
    }
  }

  return {
    async challenge(application: ProviderOauthApplication) {
      const state = randomValue();
      const verifier = randomValue();
      const challenge = base64Url(
        await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
          encoding: CryptoEncoding.BASE64,
        }),
      );
      const url = new URL(authorizationUrl);
      for (const [name, value] of Object.entries({
        response_type: 'code',
        client_id: application.clientId,
        redirect_uri: application.redirectUrl,
        scope: config.scopes,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }))
        url.searchParams.set(name, value);
      return { state, verifier, authorizationUrl: url.href };
    },
    exchange(
      application: ProviderOauthApplication,
      code: string,
      verifier: string,
      signal: AbortSignal,
    ) {
      return tokenRequest(
        {
          grant_type: 'authorization_code',
          client_id: application.clientId,
          redirect_uri: application.redirectUrl,
          code,
          code_verifier: verifier,
        },
        signal,
      );
    },
    async refresh(
      application: ProviderOauthApplication,
      tokens: ProviderOauthTokens,
      signal: AbortSignal,
    ) {
      if (!tokens.refreshToken) throw new ProviderAccountError('authorization');
      const next = await tokenRequest(
        {
          grant_type: 'refresh_token',
          client_id: application.clientId,
          refresh_token: tokens.refreshToken,
        },
        signal,
      );
      return { ...next, refreshToken: next.refreshToken ?? tokens.refreshToken };
    },
    async revoke(token: string, signal: AbortSignal): Promise<void> {
      if (!revokeEndpoint) return;
      await revokeEndpoint.client.request({
        method: 'POST',
        path: revokeEndpoint.path,
        body: new URLSearchParams({ token, token_type_hint: 'access_token' }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        redirect: 'error',
        timeoutMs: 5_000,
        signal,
      });
    },
  };
}
export type ProviderOauthClient = ReturnType<typeof createProviderOauthClient>;
