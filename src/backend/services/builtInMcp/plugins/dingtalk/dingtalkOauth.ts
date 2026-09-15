import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import { DingtalkUserCredentialSchema, type DingtalkUserCredential } from './dingtalkCredentials';

// DingTalk-Real-AI/dingtalk-workspace-cli at 8cacb01951d2567b2c0466d14cb6c5c9d0267a68,
// internal/auth/{device_flow,oauth_helpers,endpoints}.go. No embedded application secret.
const login = createHttpClient({ baseUrl: 'https://login.dingtalk.com', timeoutMs: 15_000 });
const mcp = createHttpClient({ baseUrl: 'https://mcp.dingtalk.com', timeoutMs: 15_000 });
const open = createHttpClient({ baseUrl: 'https://api.dingtalk.com', timeoutMs: 15_000 });
export const DINGTALK_MANAGEMENT_URL =
  'https://open-dev.dingtalk.com/fe/old#/personalAuthorization';
const secret = z
  .string()
  .min(1)
  .max(16_384)
  .regex(/^[^\r\n\0]+$/);
const identifier = z.string().min(1).max(256).regex(/^\S+$/);
const EnvelopeSchema = z.looseObject({
  success: z.boolean().optional(),
  errorCode: z.string().optional(),
  errorMsg: z.string().optional(),
  error: z.string().optional(),
});
const pendingCodes = new Set([
  'authorization_pending',
  'slow_down',
  'access_denied',
  'expired_token',
]);
type Application = Pick<DingtalkUserCredential, 'clientId' | 'clientSecret'>;
export type DingtalkChallenge = {
  verificationUrl: string;
  userCode?: string;
  deviceCode?: string;
  flowId?: string;
  expiresAt: number;
  intervalMs: number;
  nextPollAt: number;
};
type PollResult =
  | { status: 'pending' | 'slow-down' | 'denied' | 'expired' }
  | { status: 'approved'; authCode?: string };

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PluginError('request', 'Invalid Dingtalk authorization response.');
  return result.data;
}

async function request(
  client: typeof login,
  path: string,
  signal: AbortSignal,
  body?: Record<string, string>,
  options: { form?: boolean; token?: string; empty?: boolean } = {},
): Promise<z.infer<typeof EnvelopeSchema>> {
  try {
    const response = await client.request<unknown>({
      path,
      signal,
      ...(body
        ? {
            method: 'POST' as const,
            body: options.form ? new URLSearchParams(body).toString() : body,
          }
        : { method: 'GET' as const }),
      headers: {
        ...(body
          ? {
              'Content-Type': options.form
                ? 'application/x-www-form-urlencoded'
                : 'application/json',
            }
          : {}),
        ...(options.token ? { 'x-user-access-token': options.token } : {}),
      },
      redirect: 'error',
      maxResponseBytes: 65_536,
      errorDecoder: ({ data }) => {
        const parsed = EnvelopeSchema.safeParse(data);
        const code = parsed.success ? (parsed.data.error ?? parsed.data.errorCode) : undefined;
        return code && pendingCodes.has(code)
          ? { code, message: 'Dingtalk authorization pending.' }
          : undefined;
      },
    });
    return options.empty && (response.data === '' || response.data == null)
      ? {}
      : parse(EnvelopeSchema, response.data);
  } catch (error) {
    if (signal.aborted) throw new PluginError('cancelled', 'Dingtalk authorization cancelled.');
    if (error instanceof PluginError) throw error;
    if (isHttpError(error)) {
      if (error.code && pendingCodes.has(error.code)) return { error: error.code };
      if (error.status === 401)
        throw new PluginError('authorization', 'Dingtalk authorization rejected.');
      if (error.status === 403)
        throw new PluginError('access', 'Dingtalk organization access denied.');
      if (error.status === 429)
        throw new PluginError('quota', 'Dingtalk authorization rate limited.');
      if (error.status && error.status < 500)
        throw new PluginError('request', 'Dingtalk authorization request rejected.');
    }
    throw new PluginError('network', 'Could not reach Dingtalk authorization.');
  }
}

function assertSuccess(data: z.infer<typeof EnvelopeSchema>) {
  if (data.success === false || data.errorCode || data.errorMsg || data.error)
    throw new PluginError('authorization', 'Dingtalk rejected authorization.');
}

function seconds(value: unknown, fallback: number, max: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, max)
    : fallback;
}

/** Only official HTTPS authorization pages may leave the backend. */
export function dingtalkVerificationUrl(raw: string): string {
  try {
    if (raw.length > 8192) throw new Error();
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    if (url.host === 'login.dingtalk.com' && !url.hash) return url.href;
    if (url.host !== 'open-dev.dingtalk.com' || url.pathname !== '/fe/old') throw new Error();
    const route = decodeURIComponent(
      url.hash.slice(1) || url.searchParams.get('hash') || '',
    ).replace(/^#/, '');
    if (!route.startsWith('/personalAuthorization?')) throw new Error();
    const query = new URLSearchParams(route.slice('/personalAuthorization?'.length));
    if (!query.get('flowId') || !query.get('userCode')) throw new Error();
    // Normalize the official legacy encoded hash route.
    url.searchParams.set('hash', `#${route}`);
    url.hash = route;
    return url.href;
  } catch {
    throw new PluginError('request', 'Untrusted Dingtalk authorization URL.');
  }
}

function tokensFromResponse(
  data: z.infer<typeof EnvelopeSchema>,
  application: Application,
  startedAt: number,
  previous?: DingtalkUserCredential,
): DingtalkUserCredential {
  assertSuccess(data);
  const corpId = data.corpId || previous?.account.corpId;
  const userId = data.userId || previous?.account.userId;
  if (
    previous &&
    (corpId !== previous.account.corpId ||
      (previous.account.userId && userId !== previous.account.userId))
  )
    throw new PluginError('authorization', 'Dingtalk refresh changed the account.');
  return parse(DingtalkUserCredentialSchema, {
    version: 1,
    ...application,
    tokens: {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || previous?.tokens.refreshToken,
      expiresAt: startedAt + seconds(data.expiresIn, 7200, 86400) * 1000,
      refreshExpiresAt: data.refreshToken
        ? startedAt + 30 * 86400_000
        : previous?.tokens.refreshExpiresAt,
    },
    account: {
      corpId,
      userId,
      corpName: data.corpName || data.corp_name || data.orgName || previous?.account.corpName,
      userName: data.userName || previous?.account.userName,
    },
  });
}

function pollStatus(code: string): PollResult {
  switch (code) {
    case 'PENDING':
    case 'authorization_pending':
      return { status: 'pending' };
    case 'slow_down':
      return { status: 'slow-down' };
    case 'REJECTED':
    case 'CANCELLED':
    case 'access_denied':
      return { status: 'denied' };
    case 'EXPIRED':
    case 'expired_token':
      return { status: 'expired' };
    default:
      throw new PluginError('request', 'Invalid Dingtalk authorization status.');
  }
}

export const dingtalkOauth = {
  async begin(signal: AbortSignal, application?: Application, extraScope?: string) {
    let clientId = application?.clientId;
    if (!clientId) {
      const data = await request(mcp, '/cli/clientId', signal);
      assertSuccess(data);
      clientId = parse(identifier, data.result);
    }
    const startedAt = Date.now();
    const envelope = await request(
      login,
      '/oauth2/device/code.json',
      signal,
      {
        client_id: clientId,
        scope: ['openid corpid', extraScope].filter(Boolean).join(' '),
      },
      { form: true },
    );
    assertSuccess(envelope);
    const result = parse(
      z.object({
        deviceCode: secret,
        userCode: z.string().min(1).max(512),
        verificationUri: z.string(),
        verificationUriComplete: z.string().optional(),
        flowId: identifier.optional(),
        expiresIn: z.number().optional(),
        interval: z.number().optional(),
      }),
      envelope.result,
    );
    const intervalMs = Math.max(5, seconds(result.interval, 5, 60)) * 1000;
    return {
      clientId,
      ...(application?.clientSecret ? { clientSecret: application.clientSecret } : {}),
      challenge: {
        deviceCode: result.deviceCode,
        flowId: result.flowId,
        userCode: result.userCode,
        verificationUrl: dingtalkVerificationUrl(
          result.verificationUriComplete || result.verificationUri,
        ),
        expiresAt: startedAt + seconds(result.expiresIn, 900, 960) * 1000,
        intervalMs,
        nextPollAt: Date.now() + intervalMs,
      } satisfies DingtalkChallenge,
    };
  },
  async poll(
    challenge: DingtalkChallenge,
    clientId: string,
    signal: AbortSignal,
    token?: string,
  ): Promise<PollResult> {
    if (challenge.flowId) {
      const envelope = await request(
        mcp,
        `/cli/oauth/device/poll?${new URLSearchParams({ flowId: challenge.flowId })}`,
        signal,
        undefined,
        { token },
      );
      const payload = z.object({ status: z.string(), authCode: secret.optional() });
      const data = payload.safeParse(envelope.data);
      const result = data.success && data.data.status ? data.data : parse(payload, envelope.result);
      if (result.status === 'APPROVED' && envelope.success === true)
        return { status: 'approved', authCode: result.authCode };
      return pollStatus(result.status);
    }
    const envelope = await request(
      login,
      '/oauth2/device/token.json',
      signal,
      {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: parse(secret, challenge.deviceCode),
        client_id: clientId,
      },
      { form: true },
    );
    if (envelope.error) return pollStatus(envelope.error);
    if (envelope.errorCode && pendingCodes.has(envelope.errorCode))
      return pollStatus(envelope.errorCode);
    const result = parse(
      z.object({ authCode: secret.optional(), error: z.string().optional() }),
      envelope.result,
    );
    if (result.error) return pollStatus(result.error);
    assertSuccess(envelope);
    return { status: 'approved', authCode: parse(secret, result.authCode) };
  },
  async exchange(application: Application, authCode: string, signal: AbortSignal) {
    const startedAt = Date.now();
    const data = application.clientSecret
      ? await request(open, '/v1.0/oauth2/userAccessToken', signal, {
          ...application,
          clientSecret: application.clientSecret,
          code: authCode,
          grantType: 'authorization_code',
        })
      : await request(mcp, '/oauth2/getToken', signal, {
          clientId: application.clientId,
          authCode,
          grantType: 'authorization_code',
        });
    return tokensFromResponse(data, application, startedAt);
  },
  async checkAccess(token: string, signal: AbortSignal) {
    const data = await request(mcp, '/cli/cliAuthEnabled', signal, undefined, { token });
    const result = z.object({ cliAuthEnabled: z.literal(true) }).safeParse(data.result);
    if (data.success !== true || data.errorCode || !result.success)
      throw new PluginError(
        'access',
        'Ask your Dingtalk organization administrator to enable CLI data access for this account and channel.',
      );
  },
  async refresh(credential: DingtalkUserCredential, signal: AbortSignal) {
    const startedAt = Date.now();
    const application = { clientId: credential.clientId, clientSecret: credential.clientSecret };
    const body = {
      clientId: credential.clientId,
      refreshToken: credential.tokens.refreshToken,
      grantType: 'refresh_token',
    };
    const data = credential.clientSecret
      ? await request(open, '/v1.0/oauth2/userAccessToken', signal, {
          ...body,
          clientSecret: credential.clientSecret,
        })
      : await request(mcp, '/oauth2/refreshToken', signal, body);
    return tokensFromResponse(data, application, startedAt, credential);
  },
  async revoke(credential: DingtalkUserCredential, signal: AbortSignal) {
    // The official direct-token protocol has no remote revocation endpoint.
    if (credential.clientSecret)
      throw new PluginError('unavailable', 'Revoke this authorization in Dingtalk.');
    const data = await request(
      mcp,
      '/oauth2/revokeToken',
      signal,
      {
        clientId: credential.clientId,
        accessToken: credential.tokens.accessToken,
      },
      { empty: true },
    );
    assertSuccess(data);
  },
};
