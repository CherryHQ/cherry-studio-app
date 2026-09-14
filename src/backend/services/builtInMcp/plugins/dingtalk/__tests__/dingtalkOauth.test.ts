import { HttpError } from '@/backend/services/http/HttpError';

import type { DingtalkUserCredential } from '../dingtalkCredentials';
import { dingtalkOauth, dingtalkVerificationUrl } from '../dingtalkOauth';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => mockRequest(baseUrl, request),
  }),
  isHttpError: (error: unknown) =>
    error instanceof jest.requireActual('@/backend/services/http/HttpError').HttpError,
}));
const signal = new AbortController().signal;
const application = { clientId: 'managed-client' };
const challenge = {
  deviceCode: 'private-device',
  flowId: 'flow-1',
  verificationUrl: 'https://login.dingtalk.com/confirm',
  expiresAt: 901000,
  nextPollAt: 6000,
  intervalMs: 5000,
};
const credential: DingtalkUserCredential = {
  version: 1,
  ...application,
  account: { corpId: 'org-1', userId: 'user-1' },
  tokens: {
    accessToken: 'private-access',
    refreshToken: 'private-refresh',
    expiresAt: 1000,
    refreshExpiresAt: 900000,
  },
};
beforeEach(() => {
  mockRequest.mockReset();
  jest.spyOn(Date, 'now').mockReturnValue(1000);
});
afterEach(() => jest.restoreAllMocks());

it('fetches the official managed client and requests a device code without a bundled secret', async () => {
  mockRequest.mockResolvedValueOnce({ data: { success: true, result: application.clientId } });
  mockRequest.mockResolvedValueOnce({
    data: {
      success: true,
      result: {
        deviceCode: 'private-device',
        userCode: 'public-code',
        verificationUri: challenge.verificationUrl,
        flowId: 'flow-1',
        expiresIn: 900,
        interval: 5,
      },
    },
  });
  expect(await dingtalkOauth.begin(signal)).toMatchObject({ ...application, challenge });
  expect(mockRequest.mock.calls[0]).toEqual([
    'https://mcp.dingtalk.com',
    expect.objectContaining({ method: 'GET', path: '/cli/clientId', redirect: 'error' }),
  ]);
  const [origin, request] = mockRequest.mock.calls[1];
  expect(origin).toBe('https://login.dingtalk.com');
  expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
    client_id: application.clientId,
    scope: 'openid corpid',
  });
  expect(request.path).toBe('/oauth2/device/code.json');
  expect(request.headers.Authorization).toBeUndefined();
});

it('keeps data/result polling envelopes intact and accepts denied terminal states with success=false', async () => {
  mockRequest.mockResolvedValueOnce({
    data: {
      success: true,
      data: { status: 'PENDING' },
      result: { status: 'APPROVED', authCode: 'wrong-code' },
    },
  });
  expect(await dingtalkOauth.poll(challenge, application.clientId, signal)).toEqual({
    status: 'pending',
  });
  mockRequest.mockResolvedValueOnce({
    data: { success: true, data: {}, result: { status: 'APPROVED', authCode: 'right-code' } },
  });
  expect(await dingtalkOauth.poll(challenge, application.clientId, signal)).toEqual({
    status: 'approved',
    authCode: 'right-code',
  });
  mockRequest.mockResolvedValueOnce({ data: { success: false, result: { status: 'REJECTED' } } });
  expect(await dingtalkOauth.poll(challenge, application.clientId, signal)).toEqual({
    status: 'denied',
  });
});

it('uses the legacy device-token endpoint only when flowId is absent', async () => {
  mockRequest.mockResolvedValue({ data: { success: true, result: { authCode: 'private-code' } } });
  expect(
    await dingtalkOauth.poll({ ...challenge, flowId: undefined }, application.clientId, signal),
  ).toEqual({ status: 'approved', authCode: 'private-code' });
  const [origin, request] = mockRequest.mock.calls[0];
  expect(origin).toBe('https://login.dingtalk.com');
  expect(request.path).toBe('/oauth2/device/token.json');
  expect(Object.fromEntries(new URLSearchParams(request.body))).toMatchObject({
    device_code: 'private-device',
    client_id: application.clientId,
  });
});

it.each([
  'http://login.dingtalk.com/confirm',
  'https://login.dingtalk.com.evil.test/confirm',
  'https://user@login.dingtalk.com/confirm',
  'https://open-dev.dingtalk.com/fe/old#/other',
])('rejects untrusted authorization URLs: %s', (url) =>
  expect(() => dingtalkVerificationUrl(url)).toThrow(),
);

it('exchanges through MCP and preserves identity when refresh omits it', async () => {
  mockRequest.mockResolvedValue({
    data: {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
      corpId: 'org-1',
      userId: 'user-1',
    },
  });
  expect(await dingtalkOauth.exchange(application, 'private-code', signal)).toMatchObject({
    account: credential.account,
    tokens: { expiresAt: 3601000, refreshExpiresAt: 2592001000 },
  });
  expect(mockRequest.mock.calls[0]).toEqual([
    'https://mcp.dingtalk.com',
    expect.objectContaining({
      path: '/oauth2/getToken',
      body: {
        clientId: application.clientId,
        authCode: 'private-code',
        grantType: 'authorization_code',
      },
    }),
  ]);
  mockRequest.mockResolvedValue({ data: { accessToken: 'rotated-access', expiresIn: 3600 } });
  expect(await dingtalkOauth.refresh(credential, signal)).toMatchObject({
    account: credential.account,
    tokens: { refreshToken: 'private-refresh', refreshExpiresAt: 900000 },
  });
  mockRequest.mockResolvedValue({ data: { accessToken: 'other-access', corpId: 'other-org' } });
  await expect(dingtalkOauth.refresh(credential, signal)).rejects.toMatchObject({
    reason: 'authorization',
  });
});

it('routes approved server-issued app credentials to the direct token endpoint', async () => {
  mockRequest.mockResolvedValue({
    data: { accessToken: 'direct-access', refreshToken: 'direct-refresh', corpId: 'org-1' },
  });
  const direct = { ...application, clientSecret: 'private-app-secret' };
  await dingtalkOauth.exchange(direct, 'private-code', signal);
  expect(mockRequest.mock.calls[0]).toEqual([
    'https://api.dingtalk.com',
    expect.objectContaining({
      path: '/v1.0/oauth2/userAccessToken',
      body: { ...direct, code: 'private-code', grantType: 'authorization_code' },
    }),
  ]);
});

it('fails closed on organization policy and never returns upstream diagnostics', async () => {
  mockRequest.mockResolvedValue({
    data: { success: true, result: { cliAuthEnabled: false }, errorMsg: 'private-diagnostic' },
  });
  await expect(dingtalkOauth.checkAccess('private-access', signal)).rejects.toMatchObject({
    reason: 'access',
  });
  mockRequest.mockRejectedValue(new HttpError('private-diagnostic', { kind: 'http', status: 500 }));
  await expect(dingtalkOauth.exchange(application, 'private-code', signal)).rejects.toMatchObject({
    reason: 'network',
    message: 'Could not reach Dingtalk authorization.',
  });
});

it('accepts the official empty successful revoke response', async () => {
  mockRequest.mockResolvedValue({ data: '' });
  await expect(dingtalkOauth.revoke(credential, signal)).resolves.toBeUndefined();
});
