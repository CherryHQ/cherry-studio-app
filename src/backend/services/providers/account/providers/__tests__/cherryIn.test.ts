import { cherryInAccountDefinition } from '../cherryIn';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => mockRequest(baseUrl, request),
  }),
}));
beforeEach(() => {
  mockRequest.mockReset();
});
const signal = new AbortController().signal;

it('adapts the PC key envelopes and remaining quota to the shared account contract', async () => {
  mockRequest.mockResolvedValueOnce({
    data: { data: ['first', { key: 'second' }, { token: 'first' }] },
  });
  expect(await cherryInAccountDefinition.getApiKeys('account-access', signal)).toEqual([
    'first',
    'second',
  ]);
  mockRequest.mockResolvedValueOnce({
    data: { success: true, data: { quota: 625000, used_quota: 500000 } },
  });
  expect(await cherryInAccountDefinition.getBalance('account-access', signal)).toEqual({
    amount: 1.25,
    currency: 'USD',
  });
  expect(mockRequest.mock.calls[1]).toEqual([
    'https://open.cherryin.ai',
    expect.objectContaining({
      path: '/api/v1/oauth/balance',
      headers: { Authorization: 'Bearer account-access' },
      redirect: 'error',
    }),
  ]);
});
