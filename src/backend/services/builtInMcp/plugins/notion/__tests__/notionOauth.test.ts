import { createHash } from 'node:crypto';

import { createHttpClient, HttpError } from '@/backend/services/http';

import { authorizationStoreFixture } from '../../../authorization/__tests__/_authorizationStoreFixture';
import { NotionApplicationSchema, type NotionApplication } from '../notionCredentials';
import { notionOauth } from '../notionOauth';
import { parseNotionSelf } from '../notionSelf';

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
// The real SDK and fetch bridge run; only the shared transport is replaced, so these tests see
// the exact requests Notion receives.
const mockRequest = jest.fn();
jest.mock('@/backend/services/http/createHttpClient', () => ({
  createHttpClient: jest.fn(() => ({ request: (request: unknown) => mockRequest(request) })),
}));
jest.mock('../../../transport/createOfficialMcpClient');

const application: NotionApplication = {
  version: 1,
  clientId: 'public-client',
  authorizationEndpoint: 'https://mcp.notion.com/authorize',
  tokenEndpoint: 'https://mcp.notion.com/token',
  redirectUrl: 'cherrystudio-dev://plugins/notion/callback',
};
const metadata = {
  issuer: 'https://mcp.notion.com',
  authorization_endpoint: application.authorizationEndpoint,
  token_endpoint: application.tokenEndpoint,
  registration_endpoint: 'https://mcp.notion.com/register',
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
  authorization_response_iss_parameter_supported: true,
};
const registrationBody = {
  client_name: 'Cherry Studio',
  client_uri: 'https://github.com/CherryHQ/cherry-studio-app',
  redirect_uris: [application.redirectUrl],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
};
const issued = (access: string, refresh?: string) => ({
  access_token: access,
  ...(refresh && { refresh_token: refresh }),
  token_type: 'Bearer',
  expires_in: 3600,
});
const reply = (status: number, body: unknown) => ({
  status,
  data: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});
const sent = (index: number) => mockRequest.mock.calls[index][0];
const signal = new AbortController().signal;

beforeEach(() => {
  mockRequest.mockReset();
  jest.mocked(createHttpClient).mockClear();
});

it('discovers, registers, authorizes and exchanges with the request shapes Notion already accepts', async () => {
  const { store } = authorizationStoreFixture();
  mockRequest
    .mockResolvedValueOnce(reply(200, metadata))
    .mockResolvedValueOnce(
      reply(201, { ...registrationBody, client_id: application.clientId, issuer: 'ignored' }),
    )
    .mockResolvedValueOnce(reply(200, issued('new-access', 'new-refresh')));

  expect(await notionOauth.getApplication(store, signal)).toEqual(application);
  expect(store.writeApplication).toHaveBeenCalledWith(application);
  expect(createHttpClient).toHaveBeenCalledWith({
    baseUrl: 'https://mcp.notion.com',
    statusPolicy: 'all',
  });
  expect(sent(0)).toMatchObject({
    method: 'GET',
    path: '/.well-known/oauth-authorization-server',
    redirect: 'error',
    maxResponseBytes: 65_536,
    timeoutMs: 15_000,
  });
  expect(sent(0).body).toBeUndefined();
  expect(sent(1)).toMatchObject({
    method: 'POST',
    path: '/register',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
  });
  expect(sent(1).body).toBe(JSON.stringify(registrationBody));

  const attempt = await notionOauth.challenge(application);
  const url = new URL(attempt.authorizationUrl);
  expect(`${url.origin}${url.pathname}`).toBe(application.authorizationEndpoint);
  expect([...url.searchParams.keys()]).toEqual([
    'client_id',
    'redirect_uri',
    'response_type',
    'state',
    'code_challenge',
    'code_challenge_method',
    'resource',
  ]);
  expect(url.searchParams.get('client_id')).toBe(application.clientId);
  expect(url.searchParams.get('scope')).toBeNull();

  const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  const tokens = await notionOauth.exchangeCode(application, 'one-use-code', 'proof', signal);
  now.mockRestore();
  expect(tokens).toEqual({
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
    expiresAt: 3_601_000,
  });
  expect(sent(2)).toMatchObject({
    method: 'POST',
    path: '/token',
    redirect: 'error',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
  });
  expect(sent(2).headers.authorization).toBeUndefined();
  // Same parameters and order as the previous hand-written body; no client_secret or scope.
  expect(sent(2).body).toBe(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: 'one-use-code',
      code_verifier: 'proof',
      redirect_uri: application.redirectUrl,
      resource: 'https://mcp.notion.com/mcp',
      client_id: application.clientId,
    }).toString(),
  );
});

it('reuses a registration saved by an earlier build and renews its stored grant unchanged', async () => {
  const { data, store } = authorizationStoreFixture();
  data.application = { ...application };
  expect(await notionOauth.getApplication(store, signal)).toEqual(application);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(store.writeApplication).not.toHaveBeenCalled();

  mockRequest.mockResolvedValueOnce(reply(200, issued('later-access', 'later-refresh')));
  const stored = { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: 0 };
  expect(await notionOauth.refresh(application, stored, signal)).toMatchObject({
    accessToken: 'later-access',
    refreshToken: 'later-refresh',
  });
  expect(sent(0)).toMatchObject({ method: 'POST', path: '/token', redirect: 'error' });
  expect(sent(0).body).toBe(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
      resource: 'https://mcp.notion.com/mcp',
      client_id: application.clientId,
    }).toString(),
  );
});

it('keeps the current refresh token when a renewal does not rotate it', async () => {
  mockRequest.mockResolvedValueOnce(reply(200, issued('later-access')));
  const stored = { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: 0 };
  expect(await notionOauth.refresh(application, stored, signal)).toMatchObject({
    accessToken: 'later-access',
    refreshToken: 'old-refresh',
  });
});

it.each([
  'https://attacker.invalid/token',
  'http://mcp.notion.com/token',
  'https://mcp.notion.com@attacker.invalid/token',
  'https://mcp.notion.com/token?forward=elsewhere',
])(
  'rejects an untrusted token endpoint in discovery and stored credentials: %s',
  async (endpoint) => {
    const { store } = authorizationStoreFixture();
    mockRequest.mockResolvedValue(reply(200, { ...metadata, token_endpoint: endpoint }));
    await expect(notionOauth.getApplication(store, signal)).rejects.toMatchObject({
      reason: 'request',
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(store.writeApplication).not.toHaveBeenCalled();
    expect(
      NotionApplicationSchema.safeParse({ ...application, tokenEndpoint: endpoint }).success,
    ).toBe(false);
  },
);

it('rejects metadata from another issuer and never registers with it', async () => {
  const { store } = authorizationStoreFixture();
  mockRequest.mockResolvedValue(reply(200, { ...metadata, issuer: 'https://mcp.notion.com/x' }));
  await expect(notionOauth.getApplication(store, signal)).rejects.toMatchObject({
    reason: 'request',
  });
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it('reports unavailable metadata by its HTTP status', async () => {
  const { store } = authorizationStoreFixture();
  mockRequest.mockResolvedValue(reply(404, {}));
  await expect(notionOauth.getApplication(store, signal)).rejects.toMatchObject({
    reason: 'request',
    statusCode: 404,
  });
  expect(store.writeApplication).not.toHaveBeenCalled();
});

it.each([
  [400, { error: 'invalid_grant' }, 'authorization'],
  [400, { error: 'invalid_client' }, 'authorization'],
  [401, {}, 'authorization'],
  [403, {}, 'access'],
  [429, {}, 'quota'],
  [400, { error: 'invalid_request' }, 'request'],
  [503, {}, 'network'],
])('maps a %i %j token response to %s', async (status, body, reason) => {
  mockRequest.mockResolvedValueOnce(reply(status, body));
  const stored = { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: 0 };
  await expect(notionOauth.refresh(application, stored, signal)).rejects.toMatchObject({
    reason,
    statusCode: status,
  });
});

it('maps a rejected registration and transport failures without leaking response text', async () => {
  const { store } = authorizationStoreFixture();
  mockRequest
    .mockResolvedValueOnce(reply(200, metadata))
    .mockResolvedValueOnce(reply(401, { error: 'invalid_client' }));
  await expect(notionOauth.getApplication(store, signal)).rejects.toMatchObject({
    reason: 'authorization',
    statusCode: 401,
  });
  expect(store.writeApplication).not.toHaveBeenCalled();

  mockRequest.mockRejectedValueOnce(new HttpError('offline', { kind: 'network' }));
  await expect(
    notionOauth.exchangeCode(application, 'one-use-code', 'proof', signal),
  ).rejects.toMatchObject({ reason: 'network' });
});

it.each([
  ['no refresh token', issued('new-access')],
  ['a non-bearer token', { ...issued('new-access', 'new-refresh'), token_type: 'mac' }],
  ['no lifetime', { ...issued('new-access', 'new-refresh'), expires_in: undefined }],
])('rejects an issued grant with %s', async (_, body) => {
  mockRequest.mockResolvedValueOnce(reply(200, body));
  await expect(
    notionOauth.exchangeCode(application, 'one-use-code', 'proof', signal),
  ).rejects.toMatchObject({ reason: 'request' });
});

it('cancels before sending and while a request is in flight', async () => {
  const before = new AbortController();
  before.abort();
  await expect(
    notionOauth.exchangeCode(application, 'one-use-code', 'proof', before.signal),
  ).rejects.toMatchObject({ reason: 'cancelled' });
  expect(mockRequest).not.toHaveBeenCalled();

  const during = new AbortController();
  mockRequest.mockImplementationOnce(async () => {
    during.abort();
    throw new HttpError('cancelled', { kind: 'cancelled' });
  });
  await expect(
    notionOauth.exchangeCode(application, 'one-use-code', 'proof', during.signal),
  ).rejects.toMatchObject({ reason: 'cancelled' });
});

it('binds each attempt to its native redirect, state, resource and unique S256 proof', async () => {
  const first = await notionOauth.challenge(application);
  const second = await notionOauth.challenge(application);
  const params = new URL(first.authorizationUrl).searchParams;
  expect(params.get('code_challenge')).toBe(
    createHash('sha256').update(first.verifier).digest('base64url'),
  );
  expect(params.get('code_challenge_method')).toBe('S256');
  expect(params.get('state')).toBe(first.state);
  expect(params.get('redirect_uri')).toBe(application.redirectUrl);
  expect(params.get('resource')).toBe('https://mcp.notion.com/mcp');
  expect(first.state).not.toBe(second.state);
  expect(first.verifier).not.toBe(second.verifier);
  expect(first.authorizationUrl).not.toContain(first.verifier);
});

it('includes both workspace and user in the stable account identity', () => {
  const user = { id: '22222222-2222-4222-8222-222222222222', name: 'Member' };
  const first = parseNotionSelf({
    self: { workspace: { id: '11111111-1111-4111-8111-111111111111', name: 'Work' }, user },
  });
  const second = parseNotionSelf({
    self: { workspace: { id: '33333333-3333-4333-8333-333333333333', name: 'Personal' }, user },
  });
  expect(first.id).not.toBe(second.id);
  expect(first.label).toBe('Work · Member');
});
