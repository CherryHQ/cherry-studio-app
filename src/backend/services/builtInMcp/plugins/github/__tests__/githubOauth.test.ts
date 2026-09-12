import { createHash } from 'node:crypto';

import Constants from 'expo-constants';

import { HttpError } from '@/backend/services/http/HttpError';

import { getGithubApplication, githubOauth } from '../githubOauth';

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
  clientId: 'cherry_oauth_client',
  clientSecret: 'public-client-secret',
  redirectUrl: 'cherrystudio-dev://plugins/github/callback' as const,
};
const originalOauthEnv = [
  'EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID',
  'EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_SECRET',
].map((name) => [name, process.env[name]] as const);
const signal = new AbortController().signal;
const response = {
  access_token: 'private-access',
  token_type: 'bearer',
  scope: 'repo',
  refresh_token: 'private-refresh',
  expires_in: 28_800,
  refresh_token_expires_in: 15_552_000,
};
beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue({ data: response });
  jest.spyOn(Date, 'now').mockReturnValue(1000);
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const [name, value] of originalOauthEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

it('loads only OAuth App credentials and derives the callback from the native scheme', () => {
  // Expo's virtual env module retains this object, so update its entries in place.
  Object.assign(process.env, {
    EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID: application.clientId,
    EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_SECRET: application.clientSecret,
  });
  expect(getGithubApplication()).toEqual(application);
  jest.replaceProperty(Constants, 'expoConfig', {
    ...Constants.expoConfig!,
    scheme: 'unregistered',
  });
  expect(getGithubApplication()).toBeUndefined();
});

it('keeps browser authorization unavailable when OAuth credentials are incomplete', () => {
  process.env.EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID = application.clientId;
  delete process.env.EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_SECRET;
  expect(getGithubApplication()).toBeUndefined();
});

it('binds browser authorization to a fresh S256 proof and exact redirect without sending the verifier', async () => {
  const first = await githubOauth.challenge(application);
  const second = await githubOauth.challenge(application);
  const url = new URL(first.authorizationUrl);
  expect(url.origin).toBe('https://github.com');
  expect(url.searchParams.get('code_challenge')).toBe(
    createHash('sha256').update(first.verifier).digest('base64url'),
  );
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('redirect_uri')).toBe(application.redirectUrl);
  expect(url.searchParams.get('state')).toBe(first.state);
  expect(url.searchParams.get('scope')).toBe('repo offline_access');
  expect(first.state).not.toBe(second.state);
  expect(first.verifier).not.toBe(second.verifier);
  expect(first.authorizationUrl).not.toContain(first.verifier);
  expect(first.authorizationUrl).not.toContain(application.clientSecret);
});

it('exchanges the one-time code with PKCE and derives expiry from the returned lifetime', async () => {
  const tokens = await githubOauth.exchangeCode(
    application,
    'private-code',
    'private-verifier',
    signal,
  );
  expect(tokens).toMatchObject({ expiresAt: 28_801_000, refreshExpiresAt: 15_552_001_000 });
  const [baseUrl, request] = mockRequest.mock.calls[0];
  expect(baseUrl).toBe('https://github.com');
  expect(request).toMatchObject({
    method: 'POST',
    path: '/login/oauth/access_token',
    redirect: 'error',
  });
  expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
    client_id: application.clientId,
    client_secret: application.clientSecret,
    redirect_uri: application.redirectUrl,
    code: 'private-code',
    code_verifier: 'private-verifier',
  });
});

it('rejects HTTP-200 OAuth errors without exposing upstream credential-bearing descriptions', async () => {
  mockRequest.mockResolvedValue({
    data: { error: 'bad_refresh_token', error_description: 'private-refresh' },
  });
  const error = await githubOauth
    .refresh(application, { accessToken: 'old', refreshToken: 'private-refresh' }, signal)
    .catch((value) => value);
  expect(error).toMatchObject({ reason: 'authorization' });
  expect(JSON.stringify(error)).not.toContain('private-refresh');
  expect(error.message).not.toContain('private-refresh');
});

it('accepts a non-expiring OAuth token without inventing refresh credentials', async () => {
  mockRequest.mockResolvedValue({
    data: { access_token: 'private-access', token_type: 'bearer', scope: 'repo' },
  });
  const tokens = await githubOauth.exchangeCode(application, 'code', 'verifier', signal);
  expect(tokens.accessToken).toBe('private-access');
  expect(tokens.refreshToken).toBeUndefined();
  expect(tokens.expiresAt).toBeUndefined();
  expect(tokens.refreshExpiresAt).toBeUndefined();
});

it.each(['', 'read:user', 'public_repo', 'repo:status'])(
  'rejects insufficient OAuth scope: %s',
  async (scope) => {
    mockRequest.mockResolvedValue({ data: { ...response, scope } });
    await expect(
      githubOauth.exchangeCode(application, 'code', 'verifier', signal),
    ).rejects.toMatchObject({ reason: 'access' });
  },
);

it('accepts the repository scope in a normalized comma-separated grant', async () => {
  mockRequest.mockResolvedValue({ data: { ...response, scope: 'read:user,repo' } });
  await expect(
    githubOauth.exchangeCode(application, 'code', 'verifier', signal),
  ).resolves.toMatchObject({ accessToken: 'private-access' });
});

it('does not accept an incomplete rotation that could silently discard the renewable grant', async () => {
  mockRequest.mockResolvedValue({
    data: { access_token: 'next', token_type: 'bearer', scope: 'repo', expires_in: 100 },
  });
  await expect(
    githubOauth.refresh(
      application,
      { accessToken: 'old', refreshToken: 'private-refresh' },
      signal,
    ),
  ).rejects.toMatchObject({ reason: 'request' });
});

it('also recognizes definitive refresh rejection on non-2xx responses through a closed decoder', async () => {
  mockRequest.mockRejectedValue(
    new HttpError('safe', { kind: 'http', status: 400, code: 'bad_refresh_token' }),
  );
  await expect(
    githubOauth.refresh(
      application,
      { accessToken: 'old', refreshToken: 'private-refresh' },
      signal,
    ),
  ).rejects.toMatchObject({ reason: 'authorization' });
  const decoder = mockRequest.mock.calls[0][1].errorDecoder;
  expect(
    decoder({ data: { error: 'bad_refresh_token', error_description: 'private-refresh' } }),
  ).toEqual({ code: 'bad_refresh_token', message: 'GitHub authorization failed.' });
  expect(decoder({ data: { error: 'private-refresh' } })).toBeUndefined();
});

it('distinguishes account revocation from resource denial and temporary network failure', async () => {
  for (const [error, reason] of [
    [new HttpError('safe', { kind: 'http', status: 401 }), 'authorization'],
    [new HttpError('safe', { kind: 'http', status: 403 }), 'access'],
    [new Error('private-body'), 'network'],
  ] as const) {
    mockRequest.mockRejectedValueOnce(error);
    await expect(githubOauth.getAccount('private-access', signal)).rejects.toMatchObject({
      reason,
    });
  }
});

it('revokes only the current token using GitHub’s DELETE body contract', async () => {
  await githubOauth.revoke(application, 'private-access', signal);
  expect(mockRequest).toHaveBeenCalledWith(
    'https://api.github.com',
    expect.objectContaining({
      method: 'DELETE',
      path: `/applications/${application.clientId}/token`,
      body: { access_token: 'private-access' },
      headers: expect.objectContaining({
        Authorization: `Basic ${btoa(`${application.clientId}:${application.clientSecret}`)}`,
      }),
      redirect: 'error',
    }),
  );
});
