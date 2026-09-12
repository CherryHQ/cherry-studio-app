import { createHash } from 'node:crypto';

import { authorizationStoreFixture } from '../../../authorization/__tests__/_authorizationStoreFixture';
import { GmailAuthorizationRuntime } from '../GmailAuthorizationRuntime';
import { GMAIL_READ_SCOPE, GmailCallbackPageSchema } from '../gmailCredentials';
import { gmailOauth } from '../gmailOauth';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'cherrystudio-dev' } },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
  getRandomBytes: (size: number) => jest.requireActual('node:crypto').randomBytes(size),
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async (algorithm: string, value: string, options: { encoding: string }) =>
    jest.requireActual('node:crypto').createHash(algorithm).update(value).digest(options.encoding),
}));
const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
  isHttpError: () => false,
}));
const fields = {
  clientId: '123-example.apps.googleusercontent.com',
  clientSecret: 'user-owned-secret',
  callbackUrl: 'https://callback.example/gmail.html',
};
const signal = new AbortController().signal;
beforeEach(() => mockRequest.mockReset());

it.each([
  'http://callback.example/a',
  'https://name:secret@callback.example/a',
  'https://callback.example/a?next=x',
  'https://callback.example/a#next',
])('rejects unsafe callback configuration: %s', (url) => {
  expect(GmailCallbackPageSchema.safeParse(url).success).toBe(false);
});

it('binds the Google code to S256 proof and the exact user-owned HTTPS redirect', async () => {
  const application = gmailOauth.application(fields);
  const challenge = await gmailOauth.challenge(application);
  const params = new URL(challenge.authorizationUrl).searchParams;
  expect(params.get('code_challenge')).toBe(
    createHash('sha256').update(challenge.verifier).digest('base64url'),
  );
  expect(params.get('redirect_uri')).toBe(fields.callbackUrl);
  expect(params.get('scope')).toBe(GMAIL_READ_SCOPE);
  expect(params.get('include_granted_scopes')).toBe('false');
  expect(challenge.state).toMatch(/^cherrystudio-dev\.[A-Za-z0-9_-]{43}$/);
  expect(challenge.authorizationUrl).not.toContain(fields.clientSecret);
});

it('preserves the refresh token and refuses a wider grant', async () => {
  const application = gmailOauth.application(fields);
  mockRequest.mockResolvedValue({
    data: {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: GMAIL_READ_SCOPE,
    },
  });
  const tokens = await gmailOauth.exchangeCode(application, 'one-use-code', 'proof', signal);
  const form = new URLSearchParams(mockRequest.mock.calls[0][0].body);
  expect(form.get('code_verifier')).toBe('proof');
  expect(form.get('redirect_uri')).toBe(fields.callbackUrl);
  mockRequest.mockResolvedValue({
    data: { access_token: 'new-access', expires_in: 3600, token_type: 'Bearer' },
  });
  expect(await gmailOauth.refresh(application, tokens, signal)).toMatchObject({
    accessToken: 'new-access',
    refreshToken: 'refresh',
  });
  mockRequest.mockResolvedValue({
    data: {
      access_token: 'wide',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: GMAIL_READ_SCOPE + ' https://www.googleapis.com/auth/gmail.send',
    },
  });
  await expect(gmailOauth.exchangeCode(application, 'code', 'proof', signal)).rejects.toMatchObject(
    { reason: 'access' },
  );
});

it('does not exchange a mismatched or duplicated callback, and saves only after confirmation', async () => {
  const { store } = authorizationStoreFixture();
  const runtime = new GmailAuthorizationRuntime(store);
  expect(await runtime.begin()).toEqual({ status: 'idle' });
  await runtime.useApplication(fields);
  const state = await runtime.begin();
  if (state.status !== 'callback') throw new Error('Expected callback');
  const value = new URL(state.authorizationUrl).searchParams.get('state')!;
  await expect(
    runtime.receiveCallback(state.attemptId, `${state.redirectUrl}?state=wrong&code=code`),
  ).rejects.toMatchObject({ reason: 'request' });
  expect(mockRequest).not.toHaveBeenCalled();
  mockRequest
    .mockResolvedValueOnce({
      data: {
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: GMAIL_READ_SCOPE,
      },
    })
    .mockResolvedValueOnce({ data: { emailAddress: 'owner@example.com' } });
  const callback = `${state.redirectUrl}?state=${value}&code=code`;
  expect(await runtime.receiveCallback(state.attemptId, callback)).toMatchObject({
    status: 'review',
    accountLabel: 'owner@example.com',
  });
  await runtime.receiveCallback(state.attemptId, callback);
  expect(mockRequest).toHaveBeenCalledTimes(2);
  expect(store.commit).not.toHaveBeenCalled();
  await runtime.confirm(state.attemptId);
  await runtime.commit(state.attemptId, 'owner@example.com', signal);
  expect(store.commit).toHaveBeenCalledTimes(1);
  await runtime.stop();
});
