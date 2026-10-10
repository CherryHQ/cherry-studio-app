import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
} from '@modelcontextprotocol/client';
import * as SecureStore from 'expo-secure-store';

import { McpOAuthRuntime } from '../McpOAuthRuntime';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'cherrystudio-dev' } },
}));
jest.mock('expo/fetch', () => ({
  fetch: jest.fn(async () => new Response(null, { status: 401 })),
}));
jest.mock('@modelcontextprotocol/client', () => ({
  ...jest.requireActual('@modelcontextprotocol/client'),
  discoverOAuthServerInfo: jest.fn(),
  exchangeAuthorization: jest.fn(),
  refreshAuthorization: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  getRandomBytes: () => new Uint8Array(32).fill(7),
  digestStringAsync: async () => 'Y2hhbGxlbmdl',
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const endpointUrl = 'https://mcp.example/mcp';
const issuer = 'https://auth.example';
const token = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'Bearer' };
const storage = new Map<string, string>();
beforeEach(() => {
  jest.clearAllMocks();
  storage.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => storage.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    storage.set(key, value);
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    storage.delete(key);
  });
  jest.mocked(discoverOAuthServerInfo).mockResolvedValue({
    authorizationServerUrl: issuer,
    resourceMetadata: { resource: endpointUrl, authorization_servers: [issuer] },
    authorizationServerMetadata: {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    },
  });
  jest.mocked(exchangeAuthorization).mockResolvedValue(token);
});
async function begin(runtime: McpOAuthRuntime) {
  const attempt = await runtime.begin({ name: 'Server', endpointUrl, clientId: 'public-client' });
  const callback = new URL(attempt.redirectUrl);
  callback.searchParams.set('state', new URL(attempt.authorizationUrl).searchParams.get('state')!);
  callback.searchParams.set('code', 'test-code');
  callback.searchParams.set('iss', issuer);
  return { attempt, callback };
}

describe('native remote MCP authorization', () => {
  it.each(['state', 'iss'] as const)(
    'rejects a mismatched %s before exchanging a code',
    async (parameter) => {
      const runtime = new McpOAuthRuntime();
      const { attempt, callback } = await begin(runtime);
      callback.searchParams.set(parameter, 'https://different.example');
      await expect(runtime.complete(attempt.attemptId, callback.href)).rejects.toMatchObject({
        code: 'invalid_response',
      });
      expect(exchangeAuthorization).not.toHaveBeenCalled();
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      await runtime.stop();
    },
  );

  it('binds the grant to the endpoint and stores secrets only in native credential storage', async () => {
    const runtime = new McpOAuthRuntime();
    const { attempt, callback } = await begin(runtime);
    const authorization = new URL(attempt.authorizationUrl);
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('resource')).toBe(endpointUrl);
    const result = await runtime.complete(attempt.attemptId, callback.href);
    expect(JSON.stringify(result)).not.toContain('test-access');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.stringContaining(result.authorizationId),
      expect.stringContaining('test-access'),
      { keychainAccessible: 'device-only' },
    );
    const config = {
      endpointUrl,
      oauth: { authorizationId: result.authorizationId, clientId: result.clientId },
    };
    await expect(runtime.token(config, new AbortController().signal)).resolves.toBe('test-access');
    await expect(
      runtime.token(
        { ...config, endpointUrl: 'https://different.example/mcp' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'reauthorize' });
    await runtime.remove(result.authorizationId);
    await expect(runtime.token(config, new AbortController().signal)).rejects.toMatchObject({
      code: 'reauthorize',
    });
    await runtime.stop();
  });

  it('shares refresh work and never restores a grant revoked while refresh was pending', async () => {
    const runtime = new McpOAuthRuntime();
    jest.mocked(exchangeAuthorization).mockResolvedValue({ ...token, expires_in: 0 });
    const { attempt, callback } = await begin(runtime);
    const result = await runtime.complete(attempt.attemptId, callback.href);
    const config = {
      endpointUrl,
      oauth: { authorizationId: result.authorizationId, clientId: result.clientId },
    };
    let release!: (value: typeof token) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    jest.mocked(refreshAuthorization).mockImplementation(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const settled = Promise.allSettled([
      runtime.token(config, new AbortController().signal),
      runtime.token(config, new AbortController().signal),
    ]);
    await started;
    await runtime.remove(result.authorizationId);
    release(token);
    expect((await settled).every((item) => item.status === 'rejected')).toBe(true);
    expect(refreshAuthorization).toHaveBeenCalledTimes(1);
    expect(storage.size).toBe(0);
    await runtime.stop();
  });
});
