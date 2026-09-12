import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';
import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import {
  GMAIL_READ_SCOPE,
  GmailApplicationSchema,
  type GmailApplication,
  type GmailTokens,
} from './gmailCredentials';

const oauth = createHttpClient({ baseUrl: 'https://oauth2.googleapis.com', timeoutMs: 15_000 });
const api = createHttpClient({ baseUrl: 'https://gmail.googleapis.com', timeoutMs: 15_000 });
const secret = z.string().min(1).max(16_384).regex(/^\S+$/);
const TokenResponseSchema = z.object({
  access_token: secret,
  token_type: z.string().refine((value) => value.toLowerCase() === 'bearer'),
  expires_in: z.number().int().positive(),
  refresh_token: secret.optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  scope: z.string().max(4096).optional(),
});

function safeError(error: unknown, signal: AbortSignal): PluginError {
  if (signal.aborted) return new PluginError('cancelled', 'Gmail authorization cancelled.');
  if (error instanceof PluginError) return error;
  if (isHttpError(error)) {
    if (error.status === 401 || error.code === 'invalid_grant' || error.code === 'invalid_client')
      return new PluginError(
        'authorization',
        'Gmail authorization expired or was revoked. Reconnect your account.',
      );
    if (error.status === 403)
      return new PluginError(
        'access',
        'Google denied access. Check Gmail API and application permissions.',
      );
    if (error.status === 429) return new PluginError('quota', 'Google authorization rate limited.');
    if (error.status && error.status < 500)
      return new PluginError(
        'request',
        'Google rejected the application or callback configuration.',
      );
  }
  return new PluginError('network', 'Could not reach Google authorization.');
}

async function exchange(
  application: GmailApplication,
  body: Record<string, string>,
  signal: AbortSignal,
  previous?: GmailTokens,
): Promise<GmailTokens> {
  const startedAt = Date.now();
  try {
    const response = await oauth.request<unknown>({
      method: 'POST',
      path: '/token',
      signal,
      redirect: 'error',
      maxResponseBytes: 65_536,
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...body,
        client_id: application.clientId,
        client_secret: application.clientSecret,
      }).toString(),
      errorDecoder: ({ data }) => {
        const parsed = z.object({ error: z.string() }).safeParse(data);
        return parsed.success
          ? { code: parsed.data.error, message: 'Google authorization failed.' }
          : undefined;
      },
    });
    const parsed = TokenResponseSchema.safeParse(response.data);
    if (!parsed.success) throw new PluginError('request', 'Invalid Google token response.');
    const tokens = parsed.data;
    const scopes = (tokens.scope ?? previous?.scope ?? '').trim().split(/\s+/);
    if (scopes.length !== 1 || scopes[0] !== GMAIL_READ_SCOPE)
      throw new PluginError('access', 'Authorize only gmail.readonly with this application.');
    const refreshToken = tokens.refresh_token ?? previous?.refreshToken;
    if (!refreshToken)
      throw new PluginError(
        'access',
        'Google did not grant offline access. Reauthorize with consent.',
      );
    return {
      accessToken: tokens.access_token,
      refreshToken,
      expiresAt: startedAt + tokens.expires_in * 1000,
      refreshExpiresAt: tokens.refresh_token_expires_in
        ? startedAt + tokens.refresh_token_expires_in * 1000
        : previous?.refreshExpiresAt,
      scope: GMAIL_READ_SCOPE,
    };
  } catch (error) {
    throw safeError(error, signal);
  }
}

const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomValue = () => base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));

export const gmailOauth = {
  application(fields: Record<string, string>): GmailApplication {
    const schemes = Constants.expoConfig?.scheme;
    const scheme = Array.isArray(schemes) ? schemes[0] : schemes;
    const parsed = GmailApplicationSchema.safeParse({
      version: 1,
      clientId: fields.clientId,
      clientSecret: fields.clientSecret,
      oauthRedirectUrl: fields.callbackUrl,
      redirectUrl: `${scheme}://plugins/gmail/callback`,
    });
    if (!parsed.success)
      throw new PluginError(
        'request',
        'Enter a Google Web application client and your HTTPS callback page.',
      );
    return parsed.data;
  },
  async challenge(application: GmailApplication) {
    // The static callback page uses only this allowlisted scheme hint to return to the native app.
    const state = `${new URL(application.redirectUrl).protocol.slice(0, -1)}.${randomValue()}`;
    const verifier = randomValue();
    const challenge = base64Url(
      await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: CryptoEncoding.BASE64,
      }),
    );
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: application.clientId,
      redirect_uri: application.oauthRedirectUrl,
      response_type: 'code',
      scope: GMAIL_READ_SCOPE,
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'false',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return { state, verifier, authorizationUrl: url.href };
  },
  exchangeCode(application: GmailApplication, code: string, verifier: string, signal: AbortSignal) {
    return exchange(
      application,
      {
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: application.oauthRedirectUrl,
      },
      signal,
    );
  },
  refresh(application: GmailApplication, tokens: GmailTokens, signal: AbortSignal) {
    return exchange(
      application,
      { grant_type: 'refresh_token', refresh_token: tokens.refreshToken },
      signal,
      tokens,
    );
  },
  async getAccount(token: string, signal: AbortSignal) {
    try {
      const response = await api.request<unknown>({
        method: 'GET',
        path: '/gmail/v1/users/me/profile',
        signal,
        redirect: 'error',
        maxResponseBytes: 65_536,
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = z.object({ emailAddress: z.email().max(320) }).safeParse(response.data);
      if (!parsed.success)
        throw new PluginError('request', 'Gmail did not return an account identity.');
      return { id: parsed.data.emailAddress.toLowerCase(), label: parsed.data.emailAddress };
    } catch (error) {
      throw safeError(error, signal);
    }
  },
  async revoke(token: string, signal: AbortSignal) {
    try {
      await oauth.request({
        method: 'POST',
        path: '/revoke',
        signal,
        redirect: 'error',
        maxResponseBytes: 65_536,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch (error) {
      throw safeError(error, signal);
    }
  },
};
