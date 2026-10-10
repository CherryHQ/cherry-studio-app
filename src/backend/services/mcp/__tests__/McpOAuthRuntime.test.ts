import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
} from '@modelcontextprotocol/client';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';

import { createHttpClient, HttpError } from '@/backend/services/http';

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
  registerClient: jest.fn(),
}));
const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: jest.fn(() => ({ request: mockRequest })),
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
  mockRequest.mockResolvedValue({ data: '{}', headers: {}, status: 200 });
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
  it('routes SDK discovery, registration, exchange and refresh through the shared HTTP transport', async () => {
    const discovery =
      await jest.mocked(discoverOAuthServerInfo).getMockImplementation()!(endpointUrl);
    jest.mocked(discoverOAuthServerInfo).mockImplementationOnce(async (_url, options) => {
      await options!.fetchFn!(`${endpointUrl}/metadata`);
      await options!.fetchFn!(`${issuer}/.well-known/oauth-authorization-server`);
      return {
        ...discovery,
        authorizationServerMetadata: {
          ...discovery.authorizationServerMetadata!,
          registration_endpoint: `${issuer}/register`,
        },
      };
    });
    jest.mocked(registerClient).mockImplementationOnce(async (_url, options) => {
      await options.fetchFn!(`${issuer}/register`, {
        method: 'POST',
        body: JSON.stringify(options.clientMetadata),
        headers: { 'Content-Type': 'application/json' },
      });
      return { ...options.clientMetadata, client_id: 'registered-client' };
    });
    jest.mocked(exchangeAuthorization).mockImplementationOnce(async (_url, options) => {
      await options.fetchFn!(`${issuer}/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: options.authorizationCode,
        }),
      });
      return { ...token, expires_in: 0 };
    });
    jest.mocked(refreshAuthorization).mockImplementationOnce(async (_url, options) => {
      await options.fetchFn!(`${issuer}/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: options.refreshToken,
        }),
      });
      return token;
    });
    const runtime = new McpOAuthRuntime();
    const attempt = await runtime.begin({ name: 'Server', endpointUrl });
    const callback = new URL(attempt.redirectUrl);
    callback.searchParams.set(
      'state',
      new URL(attempt.authorizationUrl).searchParams.get('state')!,
    );
    callback.searchParams.set('code', 'test-code');
    callback.searchParams.set('iss', issuer);
    const grant = await runtime.complete(attempt.attemptId, callback.href);
    await expect(
      runtime.token({ endpointUrl, oauth: grant }, new AbortController().signal),
    ).resolves.toBe('test-access');
    expect(jest.mocked(createHttpClient).mock.calls).toEqual([
      [{ baseUrl: 'https://mcp.example', statusPolicy: 'all' }],
      [{ baseUrl: issuer, statusPolicy: 'all' }],
    ]);
    expect(mockRequest.mock.calls.map(([request]) => request.path)).toEqual([
      '/mcp/metadata',
      '/.well-known/oauth-authorization-server',
      '/register',
      '/token',
      '/token',
    ]);
    // Only the MCP challenge probe can open a stream and uses the specialized fetch path.
    expect(expoFetch).toHaveBeenCalledTimes(1);
    expect(expoFetch).toHaveBeenCalledWith(endpointUrl, expect.objectContaining({ method: 'GET' }));
    await runtime.stop();
  });

  it('maps the shared response-size failure to the safe authorization error', async () => {
    jest.mocked(discoverOAuthServerInfo).mockImplementationOnce(async (_url, options) => {
      await options!.fetchFn!(`${issuer}/metadata`);
      throw new Error('Unreachable');
    });
    mockRequest.mockRejectedValueOnce(
      new HttpError('Oversized response.', { kind: 'invalid_response' }),
    );
    const runtime = new McpOAuthRuntime();
    await expect(begin(runtime)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    await runtime.stop();
  });

  it('closes the MCP challenge stream without waiting for its body to finish', async () => {
    const cancel = jest.fn();
    jest.mocked(expoFetch).mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel }), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const runtime = new McpOAuthRuntime();
    const { attempt } = await begin(runtime);
    expect(cancel).toHaveBeenCalledTimes(1);
    runtime.cancel(attempt.attemptId);
    await runtime.stop();
  });

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
