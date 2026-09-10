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
import type { PluginRepositoryAccess } from '@/shared/data/types/plugin';

export const GITHUB_USER_CREDENTIAL_PREFIX = 'github-user:';
export const isGithubUserCredential = (credential: string) =>
  credential.startsWith(GITHUB_USER_CREDENTIAL_PREFIX);

const secret = z.string().min(1).max(16_384).regex(/^\S+$/);
export const GithubApplicationSchema = z.object({
  clientId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_.]+$/),
  clientSecret: secret,
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9-]+$/),
  redirectUrl: z.enum([
    'cherrystudio://plugins/github/callback',
    'cherrystudio-dev://plugins/github/callback',
    'cherrystudio-preview://plugins/github/callback',
  ]),
});
export type GithubApplication = z.infer<typeof GithubApplicationSchema>;

/** GitHub documents this as a public-client credential, not a confidential application secret. */
export function getGithubApplication(): GithubApplication | undefined {
  const configuredScheme = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme;
  const parsed = GithubApplicationSchema.safeParse({
    clientId: process.env.EXPO_PUBLIC_GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.EXPO_PUBLIC_GITHUB_APP_CLIENT_SECRET,
    slug: process.env.EXPO_PUBLIC_GITHUB_APP_SLUG,
    redirectUrl: `${scheme}://plugins/github/callback`,
  });
  return parsed.success ? parsed.data : undefined;
}

export const GithubTokensSchema = z.object({
  accessToken: secret,
  refreshToken: secret.optional(),
  expiresAt: z.number().finite().optional(),
  refreshExpiresAt: z.number().finite().optional(),
});
export type GithubTokens = z.infer<typeof GithubTokensSchema>;
export const GithubAccountSchema = z.object({
  id: z.number().int().positive().safe().transform(String),
  login: z.string().min(1).max(100),
});

const oauth = createHttpClient({ baseUrl: 'https://github.com', timeoutMs: 15_000 });
const api = createHttpClient({ baseUrl: 'https://api.github.com', timeoutMs: 15_000 });
const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
};
const invalidGrantCodes = new Set(['bad_refresh_token', 'invalid_grant', 'bad_verification_code']);
const OAuthErrorSchema = z.object({
  error: z.enum(['bad_refresh_token', 'invalid_grant', 'bad_verification_code']),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PluginError('request', 'Invalid GitHub authorization response.');
  return result.data;
}

function safeError(error: unknown, signal?: AbortSignal): PluginError {
  if (signal?.aborted) return new PluginError('cancelled', 'GitHub authorization cancelled.');
  if (error instanceof PluginError) return error;
  if (isHttpError(error)) {
    if (error.code && invalidGrantCodes.has(error.code))
      return new PluginError('authorization', 'GitHub authorization requires reconnecting.');
    if (error.status === 401)
      return new PluginError('authorization', 'GitHub authorization is no longer valid.');
    if (error.status === 429 || error.retryAfter)
      return new PluginError('quota', 'GitHub authorization rate limited.');
    if (error.status === 403) return new PluginError('access', 'GitHub denied resource access.');
    if (error.status && error.status < 500)
      return new PluginError('request', 'GitHub rejected the authorization request.');
  }
  return new PluginError('network', 'Could not reach GitHub authorization.');
}

const TokenResponseSchema = z.object({
  access_token: secret,
  token_type: z.literal('bearer'),
  refresh_token: secret.optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});

async function exchange(body: Record<string, string>, signal: AbortSignal): Promise<GithubTokens> {
  const startedAt = Date.now();
  try {
    const response = await oauth.request<unknown>({
      method: 'POST',
      path: '/login/oauth/access_token',
      body: new URLSearchParams(body).toString(),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      redirect: 'error',
      maxResponseBytes: 65_536,
      signal,
      errorDecoder: ({ data }) => {
        const error = OAuthErrorSchema.safeParse(data);
        return error.success ? { code: error.data.error } : undefined;
      },
    });
    // GitHub can return OAuth failures with HTTP 200. Never expose error_description.
    const failure = z.object({ error: z.string() }).safeParse(response.data);
    if (failure.success) {
      const reason = invalidGrantCodes.has(failure.data.error) ? 'authorization' : 'request';
      throw new PluginError(reason, 'GitHub could not complete authorization.');
    }
    const tokens = parse(TokenResponseSchema, response.data);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? startedAt + tokens.expires_in * 1000 : undefined,
      refreshExpiresAt: tokens.refresh_token_expires_in
        ? startedAt + tokens.refresh_token_expires_in * 1000
        : undefined,
    };
  } catch (error) {
    throw safeError(error, signal);
  }
}

async function get(path: string, token: string, signal: AbortSignal, page = 1, perPage = 100) {
  try {
    const result = await api.request<unknown>({
      method: 'GET',
      path,
      query: { page, per_page: perPage },
      headers: { ...API_HEADERS, Authorization: `Bearer ${token}` },
      signal,
      redirect: 'error',
      maxResponseBytes: 2_000_000,
    });
    return result.data;
  } catch (error) {
    throw safeError(error, signal);
  }
}

const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomValue = () => base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));

export const githubOauth = {
  async challenge(application: GithubApplication) {
    const state = randomValue();
    const verifier = randomValue();
    const challenge = base64Url(
      await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: CryptoEncoding.BASE64,
      }),
    );
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: application.clientId,
      redirect_uri: application.redirectUrl,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return { state, verifier, authorizationUrl: url.href };
  },

  exchangeCode(
    application: GithubApplication,
    code: string,
    verifier: string,
    signal: AbortSignal,
  ) {
    return exchange(
      {
        client_id: application.clientId,
        client_secret: application.clientSecret,
        redirect_uri: application.redirectUrl,
        code,
        code_verifier: verifier,
      },
      signal,
    );
  },

  async refresh(application: GithubApplication, tokens: GithubTokens, signal: AbortSignal) {
    if (!tokens.refreshToken)
      throw new PluginError('authorization', 'GitHub authorization requires reconnecting.');
    const rotated = await exchange(
      {
        client_id: application.clientId,
        client_secret: application.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      },
      signal,
    );
    if (
      !rotated.refreshToken ||
      rotated.expiresAt === undefined ||
      rotated.refreshExpiresAt === undefined
    )
      throw new PluginError(
        'authorization',
        'GitHub returned an incomplete token rotation. Reconnect GitHub.',
      );
    return rotated;
  },

  async getAccount(token: string, signal: AbortSignal) {
    return parse(GithubAccountSchema, await get('/user', token, signal));
  },

  async getRepositoryAccess(token: string, signal: AbortSignal): Promise<PluginRepositoryAccess> {
    const InstallationPageSchema = z.object({
      total_count: z.number().int().nonnegative(),
      installations: z.array(
        z.object({
          id: z.number().int().positive().safe(),
          account: z.object({ login: z.string().min(1).max(100) }).nullable(),
          suspended_at: z.string().nullable(),
        }),
      ),
    });
    let repositoryCount = 0;
    const accounts = new Set<string>();
    const seen = new Set<number>();
    for (let page = 1; page <= 20; page++) {
      const result = parse(
        InstallationPageSchema,
        await get('/user/installations', token, signal, page),
      );
      for (const installation of result.installations) {
        if (seen.has(installation.id))
          throw new PluginError('request', 'GitHub installation pagination changed. Try again.');
        seen.add(installation.id);
        if (installation.suspended_at || !installation.account) continue;
        // total_count is the user's actual accessible subset; never claim all installation repos.
        const repos = parse(
          z.object({ total_count: z.number().int().nonnegative() }),
          await get(`/user/installations/${installation.id}/repositories`, token, signal, 1, 1),
        );
        repositoryCount += repos.total_count;
        if (repos.total_count) accounts.add(installation.account.login);
      }
      if (seen.size >= result.total_count)
        return { repositoryCount, accounts: [...accounts], checkedAt: Date.now() };
      if (!result.installations.length) break;
    }
    throw new PluginError('request', 'Could not finish checking GitHub repository access.');
  },

  async revoke(application: GithubApplication, accessToken: string, signal: AbortSignal) {
    try {
      await api.request({
        method: 'DELETE',
        path: `/applications/${application.clientId}/token`,
        body: { access_token: accessToken },
        headers: {
          ...API_HEADERS,
          Authorization: `Basic ${btoa(`${application.clientId}:${application.clientSecret}`)}`,
        },
        redirect: 'error',
        maxResponseBytes: 16_384,
        signal,
      });
    } catch (error) {
      throw safeError(error, signal);
    }
  },
};
