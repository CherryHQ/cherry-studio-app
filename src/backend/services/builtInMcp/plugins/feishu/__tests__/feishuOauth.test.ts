import { HttpError } from '@/backend/services/http/HttpError';

import { FEISHU_DOCUMENT_SCOPES, feishuOauth, missingFeishuDocumentScopes } from '../feishuOauth';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => mockRequest(baseUrl, request),
  }),
  isHttpError: (error: unknown) =>
    error instanceof jest.requireActual('@/backend/services/http/HttpError').HttpError,
}));

const application = { appId: 'cli_cherry', appSecret: 'private-secret' };
const signal = new AbortController().signal;
const response = {
  device_code: 'private-device',
  user_code: 'confirm-code',
  interval: 5,
  expire_in: 600,
};
beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue({ data: response });
  jest.spyOn(Date, 'now').mockReturnValue(1000);
});
afterEach(() => jest.restoreAllMocks());

it('begins registration without credentials and uses the official user-code page without impersonating CLI tracking', async () => {
  const challenge = await feishuOauth.beginRegistration(signal);
  expect(challenge).toMatchObject({ expiresAt: 601000, nextPollAt: 6000, intervalMs: 5000 });
  const [baseUrl, request] = mockRequest.mock.calls[0];
  expect(baseUrl).toBe('https://accounts.feishu.cn');
  expect(request).toMatchObject({
    method: 'POST',
    path: '/oauth/v1/app/registration',
    redirect: 'error',
  });
  expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
    action: 'begin',
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id tenant_brand',
  });
  expect(request.headers.Authorization).toBeUndefined();
  expect(challenge.verificationUrl).toBe('https://open.feishu.cn/page/cli?user_code=confirm-code');
});

it('requests only document tool dependencies plus offline access, with application credentials restricted to official endpoints', async () => {
  mockRequest.mockResolvedValueOnce({
    data: {
      ...response,
      expires_in: 240,
      verification_uri_complete: 'https://accounts.feishu.cn/oauth/confirm?code=confirm-code',
    },
  });
  await feishuOauth.beginUser(application, signal);
  const [baseUrl, request] = mockRequest.mock.calls[0];
  expect(baseUrl).toBe('https://accounts.feishu.cn');
  expect(request.headers.Authorization).toBe(`Basic ${btoa('cli_cherry:private-secret')}`);
  expect(new URLSearchParams(request.body).get('scope')?.split(' ')).toEqual([
    'offline_access',
    ...FEISHU_DOCUMENT_SCOPES,
  ]);
  expect(request.body).not.toContain('private-secret');
});

it.each([
  'http://accounts.feishu.cn/confirm',
  'https://accounts.feishu.cn.evil.test/confirm',
  'https://evil.test/confirm',
  'https://name@open.feishu.cn/confirm',
])('rejects an untrusted verification URL: %s', async (verification_uri_complete) => {
  mockRequest.mockResolvedValue({ data: { ...response, verification_uri_complete } });
  await expect(feishuOauth.beginUser(application, signal)).rejects.toMatchObject({
    reason: 'request',
  });
});

it('handles non-2xx OAuth pending responses through a closed decoder without exposing error payloads', async () => {
  mockRequest.mockRejectedValue(
    new HttpError('safe', { kind: 'http', status: 400, code: 'authorization_pending' }),
  );
  await expect(feishuOauth.pollUser(application, 'private-device', signal)).resolves.toEqual({
    status: 'pending',
  });
  const decoder = mockRequest.mock.calls[0][1].errorDecoder;
  expect(
    JSON.stringify(
      decoder({ data: { error: 'authorization_pending', error_description: 'private-secret' } }),
    ),
  ).not.toContain('private-secret');
  expect(decoder({ data: { error: 'private-secret' } })).toBeUndefined();
});

it('stops a cross-brand registration before sending credentials to another region', async () => {
  mockRequest.mockResolvedValue({
    data: { error: 'authorization_pending', user_info: { tenant_brand: 'lark' } },
  });
  await expect(feishuOauth.pollRegistration('private-device', signal)).resolves.toEqual({
    status: 'unsupported-account',
  });
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it('uses token response lifetimes and actual scopes rather than assuming requested scopes were granted', async () => {
  mockRequest.mockResolvedValue({
    data: {
      access_token: 'private-user-token',
      expires_in: 300,
      refresh_token: 'private-refresh',
      refresh_token_expires_in: 600,
      scope: 'docx:document:readonly',
    },
  });
  const result = await feishuOauth.pollUser(application, 'private-device', signal);
  expect(result.status).toBe('approved');
  if (result.status !== 'approved') throw new Error('Expected a token response');
  expect(result.tokens).toMatchObject({ expiresAt: 301000, refreshExpiresAt: 601000 });
  expect(missingFeishuDocumentScopes(result.tokens)).toEqual(
    FEISHU_DOCUMENT_SCOPES.filter((scope) => scope !== 'docx:document:readonly'),
  );
});

it('rotates refresh tokens using JSON and preserves omitted scope/refresh-expiry metadata', async () => {
  mockRequest.mockResolvedValue({
    data: { code: 0, access_token: 'next-access', refresh_token: 'next-refresh', expires_in: 3600 },
  });
  const tokens = await feishuOauth.refresh(
    application,
    {
      accessToken: 'previous-access',
      refreshToken: 'previous-refresh',
      expiresAt: 1000,
      refreshExpiresAt: 999999,
      scope: FEISHU_DOCUMENT_SCOPES.join(' '),
    },
    signal,
  );
  expect(tokens).toMatchObject({
    accessToken: 'next-access',
    refreshToken: 'next-refresh',
    refreshExpiresAt: 999999,
    scope: FEISHU_DOCUMENT_SCOPES.join(' '),
  });
  expect(mockRequest.mock.calls[0]).toEqual([
    'https://open.feishu.cn',
    expect.objectContaining({
      path: '/open-apis/authen/v2/oauth/token',
      headers: { 'Content-Type': 'application/json' },
      body: {
        grant_type: 'refresh_token',
        refresh_token: 'previous-refresh',
        client_id: 'cli_cherry',
        client_secret: 'private-secret',
      },
    }),
  ]);
});
