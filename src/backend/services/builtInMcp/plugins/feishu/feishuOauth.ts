import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import {
  FeishuApplicationSchema,
  type FeishuApplication,
  type FeishuTokens,
} from './feishuCredentials';
import { FEISHU_REQUIRED_SCOPES } from './feishuTools';

// Protocol reference: larksuite/cli 9aaedb981b036ca94bd8ec9c630adf0ead9b6d1c,
// internal/auth/{app_registration,device_flow,uat_client}.go. No CLI process or private web API.
const accounts = createHttpClient({ baseUrl: 'https://accounts.feishu.cn', timeoutMs: 15_000 });
const open = createHttpClient({ baseUrl: 'https://open.feishu.cn', timeoutMs: 15_000 });
const REGISTRATION_PATH = '/oauth/v1/app/registration';
const TOKEN_PATH = '/open-apis/authen/v2/oauth/token';

// Renewal capability is proven by an issued refresh token, not by an echoed scope name.
const FEISHU_REQUESTED_SCOPES = ['offline_access', ...FEISHU_REQUIRED_SCOPES];

const secret = z.string().min(1).max(16_384);
const OauthResponseSchema = z.looseObject({
  error: z.string().optional(),
  code: z.number().optional(),
});
const OAUTH_ERRORS = new Set([
  'authorization_pending',
  'slow_down',
  'access_denied',
  'expired_token',
  'invalid_grant',
  'invalid_client',
  'invalid_scope',
  'unauthorized_client',
]);

/** Decode only closed OAuth codes on non-2xx responses, never descriptions or secret payloads. */
async function request(
  client: typeof accounts,
  path: string,
  body: Record<string, string>,
  signal: AbortSignal,
  options: { basic?: string; json?: boolean } = {},
) {
  try {
    const response = await client.request<unknown>({
      method: 'POST',
      path,
      signal,
      body: options.json ? body : new URLSearchParams(body).toString(),
      headers: {
        'Content-Type': options.json ? 'application/json' : 'application/x-www-form-urlencoded',
        ...(options.basic ? { Authorization: `Basic ${options.basic}` } : {}),
      },
      redirect: 'error',
      maxResponseBytes: 65_536,
      errorDecoder: ({ data }) => {
        const parsed = OauthResponseSchema.safeParse(data);
        const code = parsed.success ? parsed.data.error : undefined;
        return code && OAUTH_ERRORS.has(code)
          ? { code, message: 'Feishu authorization did not complete.' }
          : undefined;
      },
    });
    return parse(OauthResponseSchema, response.data);
  } catch (error) {
    if (isHttpError(error) && error.code && OAUTH_ERRORS.has(error.code))
      return { error: error.code } as z.infer<typeof OauthResponseSchema>;
    throw safeFeishuError(error, signal);
  }
}

function safeFeishuError(error: unknown, signal: AbortSignal): PluginError {
  if (signal.aborted) return new PluginError('cancelled', 'Feishu authorization cancelled.');
  if (error instanceof PluginError) return error;
  if (isHttpError(error)) {
    if (error.status === 429) return new PluginError('quota', 'Feishu authorization rate limited.');
    if (error.status === 401)
      return new PluginError('authorization', 'Feishu authorization rejected.');
    if (error.status === 403) return new PluginError('access', 'Feishu application access denied.');
    if (error.status && error.status < 500)
      return new PluginError('request', 'Feishu authorization request rejected.');
  }
  return new PluginError('network', 'Could not reach Feishu authorization.');
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PluginError('request', 'Invalid Feishu authorization response.');
  return parsed.data;
}

function assertSuccess(data: z.infer<typeof OauthResponseSchema>) {
  if (data.error || (data.code !== undefined && data.code !== 0)) {
    throw new PluginError(
      data.error === 'invalid_scope' ? 'access' : 'authorization',
      'Feishu rejected authorization. Check application approval and permissions.',
    );
  }
}

function positiveSeconds(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function deviceChallenge(
  data: z.infer<typeof OauthResponseSchema>,
  registration: boolean,
  startedAt: number,
) {
  assertSuccess(data);
  const deviceCode = parse(secret, data.device_code);
  const userCode = parse(z.string().min(1).max(512), data.user_code);
  const verificationUrl = registration
    ? `https://open.feishu.cn/page/cli?${new URLSearchParams({ user_code: userCode })}`
    : parse(z.string().max(4096), data.verification_uri_complete || data.verification_uri);
  // Never open an arbitrary URL supplied alongside a device authorization response.
  let url: URL;
  try {
    url = new URL(verificationUrl);
  } catch {
    throw new PluginError('request', 'Invalid Feishu confirmation URL.');
  }
  if (
    url.protocol !== 'https:' ||
    !['open.feishu.cn', 'accounts.feishu.cn'].includes(url.host) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new PluginError('request', 'Untrusted Feishu confirmation URL.');
  const expiresIn = registration
    ? positiveSeconds(data.expire_in, positiveSeconds(data.expires_in, 600))
    : positiveSeconds(data.expires_in, 240);
  const intervalMs = positiveSeconds(data.interval, 5) * 1000;
  return {
    deviceCode,
    userCode,
    verificationUrl,
    expiresAt: startedAt + expiresIn * 1000,
    intervalMs,
    nextPollAt: Date.now() + intervalMs,
  };
}

function tokensFromResponse(
  data: z.infer<typeof OauthResponseSchema>,
  startedAt: number,
  previous?: FeishuTokens,
): FeishuTokens {
  assertSuccess(data);
  const response = parse(
    z.object({
      access_token: secret,
      expires_in: z.number().int().positive(),
      refresh_token: secret.optional(),
      refresh_token_expires_in: z.number().int().nonnegative().optional(),
      scope: z.string().max(16_384).optional(),
    }),
    data,
  );
  return {
    accessToken: response.access_token,
    expiresAt: startedAt + response.expires_in * 1000,
    refreshToken: response.refresh_token ?? previous?.refreshToken,
    refreshExpiresAt:
      response.refresh_token_expires_in !== undefined
        ? startedAt + response.refresh_token_expires_in * 1000
        : (previous?.refreshExpiresAt ?? 0),
    scope: response.scope ?? previous?.scope ?? '',
  };
}

/** Plugin scopes absent from the granted set; scope names are safe to display. */
export function missingFeishuScopes(tokens: FeishuTokens): string[] {
  const granted = new Set(tokens.scope.split(/\s+/));
  return FEISHU_REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
}

export const feishuOauth = {
  async beginRegistration(signal: AbortSignal) {
    const startedAt = Date.now();
    const data = await request(
      accounts,
      REGISTRATION_PATH,
      {
        action: 'begin',
        archetype: 'PersonalAgent',
        auth_method: 'client_secret',
        request_user_info: 'open_id tenant_brand',
      },
      signal,
    );
    return deviceChallenge(data, true, startedAt);
  },
  async pollRegistration(deviceCode: string, signal: AbortSignal) {
    const data = await request(
      accounts,
      REGISTRATION_PATH,
      { action: 'poll', device_code: deviceCode },
      signal,
    );
    const info = z.object({ tenant_brand: z.string().optional() }).safeParse(data.user_info);
    if (info.success && info.data.tenant_brand && info.data.tenant_brand !== 'feishu')
      return { status: 'unsupported-account' } as const;
    if (data.error) return { status: pollStatus(data.error) };
    assertSuccess(data);
    if (!data.client_id || !data.client_secret) return { status: 'pending' } as const;
    return {
      status: 'approved',
      application: parse(FeishuApplicationSchema, {
        appId: data.client_id,
        appSecret: data.client_secret,
      }),
    } as const;
  },
  async beginUser(application: FeishuApplication, signal: AbortSignal) {
    const startedAt = Date.now();
    const data = await request(
      accounts,
      '/oauth/v1/device_authorization',
      {
        client_id: application.appId,
        scope: FEISHU_REQUESTED_SCOPES.join(' '),
      },
      signal,
      { basic: btoa(`${application.appId}:${application.appSecret}`) },
    );
    return deviceChallenge(data, false, startedAt);
  },
  async pollUser(application: FeishuApplication, deviceCode: string, signal: AbortSignal) {
    const startedAt = Date.now();
    const data = await request(
      open,
      TOKEN_PATH,
      {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: application.appId,
        client_secret: application.appSecret,
      },
      signal,
    );
    if (data.error) return { status: pollStatus(data.error) };
    return { status: 'approved', tokens: tokensFromResponse(data, startedAt) } as const;
  },
  async refresh(application: FeishuApplication, tokens: FeishuTokens, signal: AbortSignal) {
    const startedAt = Date.now();
    const data = await request(
      open,
      TOKEN_PATH,
      {
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken!,
        client_id: application.appId,
        client_secret: application.appSecret,
      },
      signal,
      { json: true },
    );
    return tokensFromResponse(data, startedAt, tokens);
  },
  async getAccountLabel(accessToken: string, signal: AbortSignal) {
    try {
      const response = await open.request<unknown>({
        method: 'GET',
        path: '/open-apis/authen/v1/user_info',
        signal,
        headers: { Authorization: `Bearer ${accessToken}` },
        redirect: 'error',
        maxResponseBytes: 16_384,
      });
      const data = parse(
        z.object({
          code: z.literal(0),
          data: z.object({
            name: z.string().max(256).optional(),
            open_id: z.string().min(1).max(256),
          }),
        }),
        response.data,
      ).data;
      return data.name ? `${data.name} (${data.open_id})` : data.open_id;
    } catch (error) {
      throw safeFeishuError(error, signal);
    }
  },
};

function pollStatus(error: string): 'pending' | 'slow-down' | 'denied' | 'expired' {
  switch (error) {
    case 'authorization_pending':
      return 'pending';
    case 'slow_down':
      return 'slow-down';
    case 'access_denied':
      return 'denied';
    case 'expired_token':
    case 'invalid_grant':
      return 'expired';
    default:
      throw new PluginError('authorization', 'Feishu rejected authorization.');
  }
}
