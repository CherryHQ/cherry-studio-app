import { createHash } from 'node:crypto';

import { readSlackIdentity, slackRequest } from '../slackApi';
import { SLACK_READ_SCOPES, SlackScopeSchema } from '../slackCredentials';
import { slackOauth } from '../slackOauth';
import { SLACK_TOOLS } from '../slackTools';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'cherrystudio-dev' } },
}));
jest.mock('expo-crypto', () => ({
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
const application = slackOauth.application({ clientId: '123.456' });
const signal = new AbortController().signal;
const token = {
  access_token: 'access',
  refresh_token: 'refresh',
  token_type: 'user',
  scope: SLACK_READ_SCOPES.join(','),
  expires_in: 43200,
};
beforeEach(() => mockRequest.mockReset());

it('requests user scopes with S256 PKCE and no client secret', async () => {
  const challenge = await slackOauth.challenge(application);
  const params = new URL(challenge.authorizationUrl).searchParams;
  expect(params.get('scope')).toBe('');
  expect(params.get('user_scope')).toBe(token.scope);
  expect(params.get('code_challenge')).toBe(
    createHash('sha256').update(challenge.verifier).digest('base64url'),
  );
  mockRequest.mockResolvedValue({ data: { ok: true, authed_user: token } });
  const grant = await slackOauth.exchangeCode(application, 'code', challenge.verifier, signal);
  const form = new URLSearchParams(mockRequest.mock.calls[0][0].body);
  expect(form.get('client_secret')).toBeNull();
  expect(form.get('code_verifier')).toBe(challenge.verifier);
  expect(grant.refreshToken).toBe('refresh');
  mockRequest.mockResolvedValue({
    data: { ok: true, ...token, access_token: 'new-access', refresh_token: 'rotated' },
  });
  expect(await slackOauth.refresh(application, grant, signal)).toMatchObject({
    refreshToken: 'rotated',
    accessToken: 'new-access',
  });
});

it('refuses bot tokens and broader or incomplete scopes', async () => {
  mockRequest.mockResolvedValue({ data: { ok: true, ...token, token_type: 'bot' } });
  await expect(slackOauth.exchangeCode(application, 'code', 'proof', signal)).rejects.toMatchObject(
    { reason: 'access' },
  );
  expect(SlackScopeSchema.safeParse(token.scope + ',chat:write').success).toBe(false);
  expect(SlackScopeSchema.safeParse('search:read').success).toBe(false);
});

it('classifies Slack HTTP-200 API failures without leaking upstream details or retrying', async () => {
  mockRequest.mockResolvedValue({
    data: { ok: false, error: 'token_revoked', detail: 'private upstream content' },
  });
  await expect(slackRequest('auth.test', {}, signal, 'token')).rejects.toMatchObject({
    reason: 'authorization',
  });
  expect(mockRequest).toHaveBeenCalledTimes(1);
  mockRequest.mockResolvedValue({ data: { ok: false, error: 'ratelimited' } });
  await expect(slackRequest('conversations.history', {}, signal, 'token')).rejects.toMatchObject({
    reason: 'quota',
  });
});

it('distinguishes workspaces and validates bounded read routes', () => {
  const first = readSlackIdentity({ team_id: 'T1', user_id: 'U1', team: 'Work', user: 'me' });
  const second = readSlackIdentity({ team_id: 'T2', user_id: 'U1', team: 'Other', user: 'me' });
  expect(first.id).not.toBe(second.id);
  const history = SLACK_TOOLS.get('slack_get_history')!;
  expect(history.request({ channel: 'C123' })).toEqual({
    method: 'conversations.history',
    fields: { channel: 'C123', limit: '15' },
  });
  expect(() => history.request({ channel: 'C123', limit: 100 })).toThrow();
  expect(() => history.request({ channel: '../chat.postMessage' })).toThrow();
  expect(() => history.request({ channel: 'C123', text: 'send this' })).toThrow();
});
