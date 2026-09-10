import { createFeishuAppTokenProvider } from '../feishuAppToken';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
  isHttpError: () => false,
}));

const credential = { version: 1, appId: 'cli_cherry', appSecret: 'private-secret' };

beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue({
    data: { code: 0, tenant_access_token: 'token-first', expire: 7200 },
  });
});
afterEach(() => jest.restoreAllMocks());

it('reuses a token only for the same credential and replaces it before expiry', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  const provider = createFeishuAppTokenProvider();
  await expect(provider.getToken(credential)).resolves.toBe('token-first');
  now.mockReturnValue(7_140_999);
  await expect(provider.getToken(credential)).resolves.toBe('token-first');
  expect(mockRequest).toHaveBeenCalledTimes(1);
  mockRequest.mockResolvedValue({
    data: { code: 0, tenant_access_token: 'token-next', expire: 7200 },
  });
  now.mockReturnValue(7_141_000);
  await expect(provider.getToken(credential)).resolves.toBe('token-next');
  expect(mockRequest).toHaveBeenCalledTimes(2);
  await provider.getToken({ version: 1, appId: 'cli_other', appSecret: 'other-secret' });
  expect(mockRequest).toHaveBeenCalledTimes(3);
});

it.each([
  { code: 10003, msg: 'private-secret' },
  { code: 0, tenant_access_token: 'token', expire: 0 },
  { code: 0, expire: 7200 },
])(
  'rejects unsuccessful or malformed token results without retaining or exposing them',
  async (data) => {
    mockRequest.mockResolvedValue({ data });
    const provider = createFeishuAppTokenProvider();
    const error = await provider.getToken(credential).catch((value: unknown) => value);
    expect(error).toMatchObject({ reason: 'authorization', stack: undefined });
    expect(JSON.stringify(error)).not.toContain('private-secret');
    await expect(provider.getToken(credential)).rejects.toMatchObject({ reason: 'authorization' });
    expect(mockRequest).toHaveBeenCalledTimes(2);
  },
);

it('does not cache a token returned after cancellation', async () => {
  const provider = createFeishuAppTokenProvider();
  const controller = new AbortController();
  mockRequest.mockImplementationOnce(async () => {
    controller.abort();
    return { data: { code: 0, tenant_access_token: 'cancelled-token', expire: 7200 } };
  });
  await expect(provider.getToken(credential, controller.signal)).rejects.toMatchObject({
    reason: 'cancelled',
  });
  await expect(provider.getToken(credential)).resolves.toBe('token-first');
  expect(mockRequest).toHaveBeenCalledTimes(2);
});
