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
