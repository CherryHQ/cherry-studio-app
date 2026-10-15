import { createFetchBridge } from '../createFetchBridge';
import { createHttpClient } from '../createHttpClient';
import { HttpError } from '../HttpError';

const mockRequest = jest.fn();
jest.mock('../createHttpClient', () => ({
  createHttpClient: jest.fn(() => ({ request: mockRequest })),
}));

class DomainError extends Error {}

function assertUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new DomainError('destination');
  return url;
}

let bridge: typeof globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  bridge = createFetchBridge({
    assertUrl,
    unsupportedMethodError: () => new DomainError('method'),
    maxResponseBytes: 4096,
    timeoutMs: 5_000,
  });
  mockRequest.mockResolvedValue({ data: '{"ok":true}', headers: {}, status: 200 });
});

it('preserves form bytes and repeated query values on a bounded, redirect-rejecting route', async () => {
  await bridge('https://auth.example/token?audience=one&audience=two', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'token+value' }),
  });
  expect(createHttpClient).toHaveBeenCalledWith({
    baseUrl: 'https://auth.example',
    statusPolicy: 'all',
  });
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/token',
      query: { audience: ['one', 'two'] },
      body: 'grant_type=refresh_token&refresh_token=token%2Bvalue',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      maxResponseBytes: 4096,
      timeoutMs: 5_000,
      redirect: 'error',
      responseType: 'text',
    }),
  );
});

it('keeps an explicit form content type and credentials on the scoped request', async () => {
  await bridge('https://auth.x.ai/oauth2/token?token=query-secret', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer account-secret',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ refresh_token: 'refresh+value' }),
  });
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      query: { token: ['query-secret'] },
      body: 'refresh_token=refresh%2Bvalue',
      headers: {
        authorization: 'Bearer account-secret',
        'content-type': 'application/x-www-form-urlencoded',
      },
    }),
  );
});

it('reuses an origin route without making one credential the route default', async () => {
  await bridge('https://api.github.com/copilot_internal/v2/token', {
    method: 'POST',
    headers: { Authorization: 'Bearer first', 'Content-Type': 'application/json' },
    body: '{"client_name":"Cherry Studio"}',
  });
  await bridge('https://api.github.com/copilot_internal/v2/token', {
    headers: { Authorization: 'Bearer second' },
  });
  await bridge('https://auth.x.ai/oauth2/token');
  expect(jest.mocked(createHttpClient).mock.calls).toEqual([
    [{ baseUrl: 'https://api.github.com', statusPolicy: 'all' }],
    [{ baseUrl: 'https://auth.x.ai', statusPolicy: 'all' }],
  ]);
  expect(mockRequest.mock.calls.map(([request]) => request.headers.authorization)).toEqual([
    'Bearer first',
    'Bearer second',
    undefined,
  ]);
  expect(mockRequest.mock.calls[0][0].body).toBe('{"client_name":"Cherry Studio"}');
  expect(mockRequest.mock.calls[2][0]).not.toHaveProperty('body');
});

it.each([400, 401, 403, 429])(
  'returns HTTP %s and its protocol body to the SDK without replay',
  async (status) => {
    mockRequest.mockResolvedValueOnce({
      status,
      data: '{"error":"invalid_grant"}',
      headers: { 'www-authenticate': 'Bearer error="invalid_token"', 'retry-after': '5' },
    });
    const response = await bridge('https://auth.example/token', {
      method: 'POST',
      body: 'grant_type=refresh_token',
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(status);
    expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"');
    expect(response.headers.get('retry-after')).toBe('5');
    await expect(response.json()).resolves.toEqual({ error: 'invalid_grant' });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  },
);

it.each([204, 205, 304])('returns HTTP %s without a body', async (status) => {
  mockRequest.mockResolvedValueOnce({ status, data: '', headers: {} });
  const response = await bridge('https://auth.example/revoke', { method: 'POST' });
  expect(response.status).toBe(status);
  expect(response.body).toBeNull();
});

it('preserves Request inputs and carries cancellation to the shared transport', async () => {
  const controller = new AbortController();
  const source = new Request('https://auth.example/token', {
    method: 'POST',
    body: 'code=fixture',
    signal: controller.signal,
  });
  await bridge(source);
  expect(mockRequest.mock.calls[0][0].body).toBe('code=fixture');
  controller.abort();
  expect(mockRequest.mock.calls[0][0].signal.aborted).toBe(true);
  mockRequest.mockClear();
  await expect(bridge(source)).rejects.toBeDefined();
  expect(mockRequest).not.toHaveBeenCalled();
});

it('rejects with the domain errors before any route exists', async () => {
  await expect(bridge('http://auth.example/token')).rejects.toThrow('destination');
  await expect(bridge('https://auth.example/token', { method: 'PUT' })).rejects.toThrow('method');
  expect(createHttpClient).not.toHaveBeenCalled();
});

it.each(['timeout', 'invalid_response'] as const)(
  'preserves a safe %s transport failure without replay',
  async (kind) => {
    const error = new HttpError('Request failed.', { kind });
    mockRequest.mockRejectedValueOnce(error);
    await expect(bridge('https://auth.example/token')).rejects.toBe(error);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  },
);
