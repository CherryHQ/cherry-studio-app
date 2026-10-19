import { createHttpClient, HttpError } from '@/backend/services/http';

import { mobileWebSearchTransport } from '../transport';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: jest.fn(() => ({ request: mockRequest })),
}));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({
  defaultAppHeaders: () => ({ 'X-App-Name': 'CherryStudioMobile' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockReset().mockResolvedValue({ data: '{}', headers: {}, status: 200 });
});

test('preserves serialized bodies, encoded queries, credentials, deadlines and cancellation', async () => {
  const signal = new AbortController().signal;
  const body = '{"query":"a+b"}';
  await mobileWebSearchTransport.request({
    url: 'https://search.example/root/search?q=a%20b&engine=one&engine=two',
    method: 'POST',
    headers: { Authorization: 'Bearer provider-key' },
    body,
    signal,
    timeoutMs: 60_000,
  });

  expect(createHttpClient).toHaveBeenCalledWith({
    baseUrl: 'https://search.example',
    headers: { 'X-App-Name': 'CherryStudioMobile' },
    statusPolicy: 'all',
  });
  expect(mockRequest).toHaveBeenCalledWith({
    method: 'POST',
    path: '/root/search?q=a%20b&engine=one&engine=two',
    logPath: '/web-search',
    headers: { Authorization: 'Bearer provider-key' },
    body,
    signal,
    timeoutMs: 60_000,
    responseType: 'text',
  });
});

test.each([200, 401, 429, 503])(
  'returns HTTP %s and raw text to the protocol without replay',
  async (status) => {
    mockRequest.mockResolvedValue({ status, headers: { 'retry-after': '10' }, data: 'not JSON' });
    await expect(
      mobileWebSearchTransport.request({
        url: 'https://search.example/query',
        method: 'GET',
        headers: {},
      }),
    ).resolves.toEqual({ status, headers: { 'retry-after': '10' }, bodyText: 'not JSON' });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls[0][0]).not.toHaveProperty('body');
  },
);

test.each(['network', 'timeout', 'invalid_response'] as const)(
  'preserves a %s transport failure',
  async (kind) => {
    mockRequest.mockRejectedValue(new HttpError('Failure', { kind }));
    await expect(
      mobileWebSearchTransport.request({
        url: 'https://search.example/query',
        method: 'GET',
        headers: {},
      }),
    ).rejects.toMatchObject({ tag: '@cherrystudio/web-search/transport-error', kind });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  },
);

test('does not start a request after cancellation', async () => {
  await expect(
    mobileWebSearchTransport.request({
      url: 'https://search.example/query',
      method: 'GET',
      headers: {},
      signal: AbortSignal.abort(),
    }),
  ).rejects.toMatchObject({ kind: 'cancelled' });
  expect(createHttpClient).not.toHaveBeenCalled();
});

test('honors cancellation while consuming the response body', async () => {
  const controller = new AbortController();
  mockRequest.mockImplementation(async () => {
    controller.abort();
    return { data: '{}', status: 200, headers: {} };
  });
  await expect(
    mobileWebSearchTransport.request({
      url: 'https://search.example/query',
      method: 'GET',
      headers: {},
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ kind: 'cancelled' });
});
