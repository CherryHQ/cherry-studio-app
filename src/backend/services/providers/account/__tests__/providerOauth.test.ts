import { createHash } from 'node:crypto';

import Constants from 'expo-constants';

import { HttpError } from '@/backend/services/http/HttpError';

import { createProviderOauthClient, getProviderOauthApplication } from '../providerOauth';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'cherrystudio-dev' } },
}));
const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => mockRequest(baseUrl, request),
  }),
  isHttpError: (error: unknown) =>
    error instanceof jest.requireActual('@/backend/services/http/HttpError').HttpError,
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (size: number) => jest.requireActual('node:crypto').randomBytes(size),
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async (algorithm: string, value: string, options: { encoding: string }) =>
    jest.requireActual('node:crypto').createHash(algorithm).update(value).digest(options.encoding),
}));
const application = {
  clientId: 'public-client',
  redirectUrl: 'cherrystudio-dev://oauth/callback' as const,
};
const oauth = createProviderOauthClient({
  authorizationUrl: 'https://auth.provider.test/authorize',
  tokenUrl: 'https://auth.provider.test/oauth2/token',
  scopes: 'profile balance',
});
const signal = new AbortController().signal;
beforeEach(() => {
  mockRequest.mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('uses fresh S256 proofs with the active build callback and no verifier in the browser URL', async () => {
  expect(getProviderOauthApplication(application.clientId).redirectUrl).toBe(
    application.redirectUrl,
  );
  const first = await oauth.challenge(application);
  const second = await oauth.challenge(application);
  const url = new URL(first.authorizationUrl);
  expect(url.origin).toBe('https://auth.provider.test');
  expect(url.searchParams.get('redirect_uri')).toBe(application.redirectUrl);
  expect(url.searchParams.get('code_challenge')).toBe(
    createHash('sha256').update(first.verifier).digest('base64url'),
  );
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(first.state).not.toBe(second.state);
  expect(first.authorizationUrl).not.toContain(first.verifier);
  jest.replaceProperty(Constants, 'expoConfig', { scheme: 'unregistered' });
  expect(() => getProviderOauthApplication(application.clientId)).toThrow();
});

it('exchanges form-encoded PKCE credentials only with the fixed token endpoint', async () => {
  mockRequest.mockResolvedValue({
    data: {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    },
  });
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  expect(
    await oauth.exchange(application, 'one-use-code', 'private-verifier', signal),
  ).toMatchObject({ accessToken: 'access', expiresAt: 3601000 });
  const [baseUrl, request] = mockRequest.mock.calls[0];
  expect(baseUrl).toBe('https://auth.provider.test');
  expect(request).toMatchObject({ method: 'POST', path: '/oauth2/token', redirect: 'error' });
  expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
    grant_type: 'authorization_code',
    client_id: application.clientId,
    redirect_uri: application.redirectUrl,
    code: 'one-use-code',
    code_verifier: 'private-verifier',
  });
});

it('retains an unchanged refresh token and reports grant failures without upstream secret text', async () => {
  mockRequest.mockResolvedValueOnce({ data: { access_token: 'next', token_type: 'bearer' } });
  expect(
    await oauth.refresh(application, { accessToken: 'old', refreshToken: 'renewable' }, signal),
  ).toMatchObject({ accessToken: 'next', refreshToken: 'renewable' });
  mockRequest.mockResolvedValueOnce({
    data: { error: 'invalid_grant', error_description: 'private-refresh-token' },
  });
  const error = await oauth
    .refresh(application, { accessToken: 'old', refreshToken: 'renewable' }, signal)
    .catch((error: unknown) => error);
  expect(error).toMatchObject({ reason: 'authorization' });
  expect(String(error)).not.toContain('private-refresh-token');
  mockRequest.mockRejectedValueOnce(
    new HttpError('private-client-value', { kind: 'http', status: 401, code: 'invalid_client' }),
  );
  await expect(oauth.exchange(application, 'code', 'verifier', signal)).rejects.toMatchObject({
    reason: 'configuration',
  });
});
