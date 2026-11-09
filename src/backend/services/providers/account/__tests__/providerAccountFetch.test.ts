import { HttpError } from '@/backend/services/http';

import { createProviderAccountFetch } from '../providerAccountFetch';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http/createHttpClient', () => ({
  createHttpClient: jest.fn(() => ({ request: mockRequest })),
}));

let fetchAccount: typeof globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  fetchAccount = createProviderAccountFetch();
  mockRequest.mockResolvedValue({ data: '{"ok":true}', headers: {}, status: 200 });
});

it('bounds account responses and keeps the route default timeout', async () => {
  await fetchAccount('https://auth.x.ai/oauth2/token', { method: 'POST', body: '{}' });
  const [request] = mockRequest.mock.calls[0];
  expect(request.maxResponseBytes).toBe(1_048_576);
  expect(request.timeoutMs).toBeUndefined();
});

it.each(['http://auth.x.ai/token', 'https://user:secret@auth.x.ai/token', 'not a url'])(
  'rejects an invalid account destination %s before transport',
  async (url) => {
    await expect(fetchAccount(url)).rejects.toMatchObject({
      code: 'INVALID_ACCOUNT_ENDPOINT',
      kind: 'internal',
    });
    expect(mockRequest).not.toHaveBeenCalled();
  },
);

it('rejects methods other than GET and POST as an internal error', async () => {
  await expect(
    fetchAccount('https://auth.x.ai/oauth2/token', { method: 'PUT', body: '{}' }),
  ).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_METHOD', kind: 'internal' });
  expect(mockRequest).not.toHaveBeenCalled();
});

it.each([
  [400, 'invalid_grant'],
  [401, undefined],
  [401, 'invalid_client'],
  [400, 'unauthorized_client'],
] as const)(
  'preserves a terminal OAuth rejection as structured metadata: %s %s',
  async (status, code) => {
    mockRequest.mockResolvedValueOnce({
      status,
      headers: {},
      data: JSON.stringify({ error: code, error_description: 'secret-server-response' }),
    });
    const error = await fetchAccount('https://auth.x.ai/oauth2/token', { method: 'POST' }).catch(
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ kind: 'http', status, code });
    expect(String(error)).not.toContain('secret-server-response');
  },
);

it.each([
  [400, 'authorization_pending'],
  [400, 'slow_down'],
  [403, 'authorization_pending'],
  [400, 'access_denied'],
  [400, 'expired_token'],
  [429, 'invalid_grant'],
  [503, 'invalid_grant'],
] as const)('leaves polling and retry responses intact: %s %s', async (status, error) => {
  const body = { error, interval: 5 };
  mockRequest.mockResolvedValueOnce({ status, headers: {}, data: JSON.stringify(body) });
  const response = await fetchAccount('https://auth.x.ai/oauth2/token', { method: 'POST' });
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it('leaves an ordinary non-JSON rejection available for SDK handling', async () => {
  mockRequest.mockResolvedValueOnce({ status: 403, headers: {}, data: 'Forbidden' });
  const response = await fetchAccount('https://auth.x.ai/oauth2/token', { method: 'POST' });
  expect(response.status).toBe(403);
  expect(await response.text()).toBe('Forbidden');
});
