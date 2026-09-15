import { createHash } from 'node:crypto';

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
const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
  isHttpError: () => false,
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
};
const signal = new AbortController().signal;
beforeEach(() => mockRequest.mockReset());

it('registers a public client once and reuses its persisted registration', async () => {
  const { store } = authorizationStoreFixture();
  mockRequest.mockResolvedValueOnce({ data: metadata }).mockResolvedValueOnce({
    data: { client_id: application.clientId, token_endpoint_auth_method: 'none' },
  });
  expect(await notionOauth.getApplication(store, signal)).toEqual(application);
  expect(await notionOauth.getApplication(store, signal)).toEqual(application);
  expect(mockRequest).toHaveBeenCalledTimes(2);
  expect(mockRequest.mock.calls[1][0]).toMatchObject({
    method: 'POST',
    path: '/register',
    redirect: 'error',
    body: {
      token_endpoint_auth_method: 'none',
      redirect_uris: [application.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
    },
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
    mockRequest.mockResolvedValue({ data: { ...metadata, token_endpoint: endpoint } });
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

it('binds each attempt to its native redirect, state, resource and unique S256 proof', async () => {
  const first = await notionOauth.challenge(application);
  const second = await notionOauth.challenge(application);
  const params = new URL(first.authorizationUrl).searchParams;
  expect(params.get('code_challenge')).toBe(
    createHash('sha256').update(first.verifier).digest('base64url'),
  );
  expect(params.get('state')).toBe(first.state);
  expect(params.get('redirect_uri')).toBe(application.redirectUrl);
  expect(params.get('resource')).toBe('https://mcp.notion.com/mcp');
  expect(first.state).not.toBe(second.state);
  expect(first.verifier).not.toBe(second.verifier);
  expect(first.authorizationUrl).not.toContain(first.verifier);
});

it('exchanges a code without a client secret and retains the newly rotated refresh token', async () => {
  mockRequest.mockResolvedValue({
    data: {
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      token_type: 'Bearer',
      expires_in: 3600,
    },
  });
  const tokens = await notionOauth.exchangeCode(
    application,
    'one-use-code',
    'private-proof',
    signal,
  );
  const params = new URLSearchParams(mockRequest.mock.calls[0][0].body);
  expect(params.get('code_verifier')).toBe('private-proof');
  expect(params.get('client_secret')).toBeNull();
  expect(tokens.refreshToken).toBe('new-refresh');
  mockRequest.mockResolvedValue({
    data: {
      access_token: 'later-access',
      refresh_token: 'later-refresh',
      token_type: 'bearer',
      expires_in: 3600,
    },
  });
  expect(await notionOauth.refresh(application, tokens, signal)).toMatchObject({
    refreshToken: 'later-refresh',
  });
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
