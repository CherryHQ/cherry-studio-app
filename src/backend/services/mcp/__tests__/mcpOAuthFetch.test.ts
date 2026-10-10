import { createHttpClient, HttpError } from '@/backend/services/http';

import { createMcpOAuthFetch } from '../mcpOAuthFetch';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: jest.fn(() => ({ request: mockRequest })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockResolvedValue({ data: '{}', headers: {}, status: 200 });
});

it('preserves OAuth form bytes and repeated query values on a bounded, redirect-rejecting route', async () => {
  await createMcpOAuthFetch()('https://auth.example/token?audience=one&audience=two', {
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
      maxResponseBytes: 512 * 1024,
      timeoutMs: 30_000,
      redirect: 'error',
      responseType: 'text',
    }),
  );
});

it('isolates resource and issuer routes without retaining credentials as route defaults', async () => {
  const fetchOAuth = createMcpOAuthFetch();
  await fetchOAuth('https://auth.example/register', {
    method: 'POST',
    headers: { Authorization: 'Bearer first', 'Content-Type': 'application/json' },
    body: '{"client_name":"Cherry Studio"}',
  });
  await fetchOAuth('https://auth.example/token', { headers: { Authorization: 'Bearer second' } });
  await fetchOAuth('https://mcp.example/.well-known/oauth-protected-resource');
  expect(jest.mocked(createHttpClient).mock.calls).toEqual([
    [{ baseUrl: 'https://auth.example', statusPolicy: 'all' }],
    [{ baseUrl: 'https://mcp.example', statusPolicy: 'all' }],
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
  'preserves HTTP %s and the OAuth error body without retrying',
  async (status) => {
    mockRequest.mockResolvedValueOnce({
      status,
      data: '{"error":"invalid_grant"}',
      headers: { 'www-authenticate': 'Bearer error="invalid_token"', 'retry-after': '5' },
    });
    const response = await createMcpOAuthFetch()('https://auth.example/token', {
      method: 'POST',
      body: 'grant_type=refresh_token',
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"');
    expect(response.headers.get('retry-after')).toBe('5');
    await expect(response.json()).resolves.toEqual({ error: 'invalid_grant' });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  },
);

it('preserves Request inputs and carries cancellation to the shared transport', async () => {
  const controller = new AbortController();
  const source = new Request('https://auth.example/token', {
    method: 'POST',
    body: 'code=fixture',
    signal: controller.signal,
  });
  await createMcpOAuthFetch()(source);
  expect(mockRequest.mock.calls[0][0].body).toBe('code=fixture');
  controller.abort();
  expect(mockRequest.mock.calls[0][0].signal.aborted).toBe(true);
  mockRequest.mockClear();
  await expect(createMcpOAuthFetch()(source)).rejects.toBeDefined();
  expect(mockRequest).not.toHaveBeenCalled();
});

it.each([
  'http://auth.example/token',
  'https://user:secret@auth.example/token',
  'https://auth.example/token#fragment',
])('rejects an invalid OAuth destination before transport: %s', async (url) => {
  await expect(createMcpOAuthFetch()(url)).rejects.toMatchObject({ code: 'configuration' });
  expect(createHttpClient).not.toHaveBeenCalled();
});

it('retains loopback support for local OAuth servers', async () => {
  await createMcpOAuthFetch()('http://127.0.0.1:3000/token');
  expect(createHttpClient).toHaveBeenCalledWith({
    baseUrl: 'http://127.0.0.1:3000',
    statusPolicy: 'all',
  });
});

it.each(['timeout', 'invalid_response'] as const)(
  'preserves a safe %s transport failure without replay',
  async (kind) => {
    const error = new HttpError('Request failed.', { kind });
    mockRequest.mockRejectedValueOnce(error);
    await expect(createMcpOAuthFetch()('https://auth.example/token')).rejects.toBe(error);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  },
);
