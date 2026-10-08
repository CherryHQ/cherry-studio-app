import { createHttpClient, HttpError } from '@/backend/services/http';

import { createProviderAccountFetch } from '../providerAccountFetch';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: jest.fn(() => ({ request: mockRequest })),
}));

let fetchAccount: typeof globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  fetchAccount = createProviderAccountFetch();
  mockRequest.mockResolvedValue({ data: '{"ok":true}', headers: {}, status: 200 });
});

it('keeps form bytes, account credentials and query values on the scoped HTTP request', async () => {
  await fetchAccount('https://auth.x.ai/oauth2/token?tag=one&tag=two&token=query-secret', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer account-secret',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ refresh_token: 'refresh+value', grant_type: 'refresh_token' }),
  });
  expect(createHttpClient).toHaveBeenCalledWith({
    baseUrl: 'https://auth.x.ai',
    statusPolicy: 'all',
  });
  expect(mockRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/oauth2/token',
      query: { tag: ['one', 'two'], token: ['query-secret'] },
      body: 'refresh_token=refresh%2Bvalue&grant_type=refresh_token',
      headers: {
        authorization: 'Bearer account-secret',
        'content-type': 'application/x-www-form-urlencoded',
      },
      redirect: 'error',
      responseType: 'text',
      maxResponseBytes: 1_048_576,
    }),
  );
});

it.each([
  [400, 'authorization_pending'],
  [400, 'slow_down'],
  [429, 'rate_limited'],
] as const)(
  'returns HTTP %s and its %s protocol body to the SDK without replay',
  async (status, error) => {
    mockRequest.mockResolvedValueOnce({
      data: JSON.stringify({ error }),
      headers: { 'retry-after': '5' },
      status,
    });
    const response = await fetchAccount('https://auth.x.ai/oauth2/token', {
      method: 'POST',
      body: '{}',
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(status);
    expect(response.headers.get('retry-after')).toBe('5');
    await expect(response.json()).resolves.toEqual({ error });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  },
);

it('reuses an origin route without making one account token the route default', async () => {
  await fetchAccount('https://api.github.com/copilot_internal/v2/token', {
    headers: { Authorization: 'Bearer first-account' },
  });
  await fetchAccount('https://api.github.com/copilot_internal/v2/token', {
    headers: { Authorization: 'Bearer second-account' },
  });
  await fetchAccount('https://auth.x.ai/oauth2/token');
  expect(jest.mocked(createHttpClient).mock.calls).toEqual([
    [{ baseUrl: 'https://api.github.com', statusPolicy: 'all' }],
    [{ baseUrl: 'https://auth.x.ai', statusPolicy: 'all' }],
  ]);
  expect(mockRequest.mock.calls.map(([request]) => request.headers.authorization)).toEqual([
    'Bearer first-account',
    'Bearer second-account',
    undefined,
  ]);
  expect(mockRequest.mock.calls.every(([request]) => !('body' in request))).toBe(true);
});

it('preserves a Request input and propagates cancellation to the HTTP request', async () => {
  const controller = new AbortController();
  const source = new Request('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    body: '{"code":"fixture"}',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  });
  await fetchAccount(source);
  const request = mockRequest.mock.calls[0][0];
  expect(request.body).toBe('{"code":"fixture"}');
  controller.abort();
  expect(request.signal.aborted).toBe(true);
});

it.each(['http://auth.x.ai/token', 'https://user:secret@auth.x.ai/token'])(
  'rejects an invalid account destination %s before transport',
  async (url) => {
    await expect(fetchAccount(url)).rejects.toMatchObject({ kind: 'internal' });
    expect(mockRequest).not.toHaveBeenCalled();
  },
);

it('keeps a timeout as a safe app transport error', async () => {
  const timeout = new HttpError('HTTP request timed out.', { kind: 'timeout' });
  mockRequest.mockRejectedValueOnce(timeout);
  await expect(fetchAccount('https://auth.x.ai/oauth2/token')).rejects.toBe(timeout);
  expect(mockRequest).toHaveBeenCalledTimes(1);
});
