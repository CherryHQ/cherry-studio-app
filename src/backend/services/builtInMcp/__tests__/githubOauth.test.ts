import { createHash } from 'node:crypto';

import { HttpError } from '@/backend/services/http/HttpError';

import { githubOauth } from '../githubOauth';

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
  clientId: 'Iv1.cherry',
  clientSecret: 'public-client-secret',
  slug: 'cherry-studio',
  redirectUrl: 'cherrystudio-dev://plugins/github/callback' as const,
};
const signal = new AbortController().signal;
const response = {
  access_token: 'private-access',
  token_type: 'bearer',
  refresh_token: 'private-refresh',
  expires_in: 28_800,
  refresh_token_expires_in: 15_552_000,
};
beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue({ data: response });
  jest.spyOn(Date, 'now').mockReturnValue(1000);
});
afterEach(() => jest.restoreAllMocks());

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

it('does not accept an incomplete rotation that could silently discard the renewable grant', async () => {
  mockRequest.mockResolvedValue({
    data: { access_token: 'next', token_type: 'bearer', expires_in: 100 },
  });
  await expect(
    githubOauth.refresh(
      application,
      { accessToken: 'old', refreshToken: 'private-refresh' },
      signal,
    ),
  ).rejects.toMatchObject({ reason: 'authorization' });
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
  ).toEqual({ code: 'bad_refresh_token' });
  expect(decoder({ data: { error: 'private-refresh' } })).toBeUndefined();
});

it('counts only user-accessible repositories across installations and pagination', async () => {
  mockRequest.mockImplementation(async (_base, request) => {
    if (request.path === '/user/installations')
      return {
        data: {
          total_count: 3,
          installations:
            request.query.page === 1
              ? [{ id: 1, account: { login: 'personal' }, suspended_at: null }]
              : [
                  { id: 2, account: { login: 'org' }, suspended_at: null },
                  { id: 3, account: { login: 'suspended' }, suspended_at: '2026-09-10' },
                ],
        },
      };
    return { data: { total_count: request.path.includes('/1/') ? 2 : 4 } };
  });
  expect(await githubOauth.getRepositoryAccess('private-access', signal)).toEqual({
    repositoryCount: 6,
    accounts: ['personal', 'org'],
    checkedAt: 1000,
  });
  expect(mockRequest.mock.calls.filter(([, request]) => request.path.includes('/3/'))).toHaveLength(
    0,
  );
  expect(
    mockRequest.mock.calls.every(
      ([base, request]) =>
        base === 'https://api.github.com' &&
        request.headers.Authorization === 'Bearer private-access' &&
        request.redirect === 'error',
    ),
  ).toBe(true);
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
      path: '/applications/Iv1.cherry/token',
      body: { access_token: 'private-access' },
      headers: expect.objectContaining({
        Authorization: `Basic ${btoa('Iv1.cherry:public-client-secret')}`,
      }),
      redirect: 'error',
    }),
  );
});
