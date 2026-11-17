import { HttpError, type CreateHttpClientOptions, type HttpClient } from '@/backend/services/http';

import type { RuntimeJsonValue } from '../../runtime';
import { createHttpRequestTool } from '../httpRequestTool';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const request = jest.fn();
const createClient = jest.fn((_options: CreateHttpClientOptions): HttpClient => ({ request }));
const controller = new AbortController();

function execute(input: RuntimeJsonValue, signal = controller.signal) {
  return createHttpRequestTool(createClient).execute({
    input,
    signal,
    toolCallId: 'request-1',
    turnId: 'turn-1',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  request.mockReset().mockResolvedValue({ status: 200, data: 'ok', headers: {} });
});

it('defaults to a bounded GET and preserves repeated and encoded query parameters', async () => {
  await execute({ url: 'https://api.example.com/items?tag=a&tag=b&token=a%2Bb' });
  expect(createClient).toHaveBeenCalledWith({
    baseUrl: 'https://api.example.com',
    statusPolicy: 'all',
  });
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      path: '/items?tag=a&tag=b&token=a%2Bb',
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'manual',
      responseType: 'text',
      maxResponseBytes: 65_536,
      truncateResponse: true,
      timeoutMs: 30_000,
    }),
  );
  expect(request.mock.calls[0][0]).not.toHaveProperty('body');
});

it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
  'sends an explicit %s body and headers',
  async (method) => {
    const body = ' { "title": "Cherry" }\n';
    await execute({
      url: 'http://192.168.1.2:8080/items',
      method,
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
      body,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method,
        body,
        headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
      }),
    );
  },
);

it.each([204, 302, 404, 422, 500])(
  'returns HTTP %s and its raw response without treating it as a transport failure',
  async (status) => {
    request.mockResolvedValueOnce({
      status,
      data: 'response',
      headers: { 'x-request-id': 'id' },
      truncated: true,
    });
    const result = await execute({ url: 'https://api.example.com/items' });
    expect(result).toEqual({
      value: { status, body: 'response', headers: { 'x-request-id': 'id' }, truncated: true },
      artifacts: [],
    });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

it.each<RuntimeJsonValue>([
  { url: 'file:///tmp/file' },
  { url: 'https://api.example.com', method: 'TRACE' },
  { url: 'https://api.example.com', body: 'unexpected GET body' },
  { url: 'https://api.example.com', method: 'HEAD', body: 'unexpected HEAD body' },
  { url: 'https://api.example.com', method: 'POST', body: { title: 'must serialize' } },
])('rejects malformed calls before sending: %j', async (input) => {
  const result = await execute(input);
  expect(result.failure).toMatchObject({ scope: 'call', error: { code: 'invalid_tool_input' } });
  expect(createClient).not.toHaveBeenCalled();
});

it.each(['network', 'timeout'] as const)(
  'reports an uncertain %s outcome without replaying the write',
  async (kind) => {
    request.mockRejectedValueOnce(new HttpError('Request failed.', { kind, code: 'failure' }));
    const result = await execute({
      url: 'https://api.example.com/items',
      method: 'POST',
      body: 'create',
    });
    expect(result.value).toMatchObject({
      status: 'error',
      retryable: false,
      message: expect.stringContaining('server-side outcome is unknown'),
    });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

it('does not send a request after the turn has been cancelled', async () => {
  const cancelled = new AbortController();
  cancelled.abort(new Error('cancelled'));
  await expect(execute({ url: 'https://api.example.com' }, cancelled.signal)).rejects.toThrow(
    'cancelled',
  );
  expect(createClient).not.toHaveBeenCalled();
});
