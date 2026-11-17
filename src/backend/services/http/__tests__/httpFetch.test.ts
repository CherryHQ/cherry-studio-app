import { ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

import { fetch as expoFetch } from 'expo/fetch';

import { createHttpClient } from '../createHttpClient';
import type { HttpError } from '../HttpError';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@logger', () => {
  const logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() };
  return { loggerService: { withContext: () => logger } };
});

// Reproduce RN's capability mismatch through the real Axios fetch adapter: credentials is an
// instance property, and the global Response supports text() but has no readable body stream.
class LegacyRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly credentials: RequestCredentials;
  readonly signal: AbortSignal;

  constructor(input: RequestInfo | URL, init: RequestInit = {}) {
    this.url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    this.method = init.method ?? 'GET';
    this.headers = new Headers(init.headers);
    this.credentials = init.credentials ?? 'same-origin';
    this.signal = init.signal ?? new AbortController().signal;
  }
}

class LegacyResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  private readonly content: string;

  constructor(body?: BodyInit | null, init: ResponseInit = {}) {
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? '';
    this.headers = new Headers(init.headers);
    this.content = body == null ? '' : String(body);
    if (body != null && !this.headers.has('content-type')) {
      this.headers.set('content-type', 'text/plain;charset=UTF-8');
    }
    if ([204, 205, 304].includes(this.status) && body != null) {
      throw new TypeError('This response status cannot have a body.');
    }
  }

  async text(): Promise<string> {
    return this.content;
  }
}

const originalGlobals = {
  Request: globalThis.Request,
  Response: globalThis.Response,
  ReadableStream: globalThis.ReadableStream,
  TextDecoder: globalThis.TextDecoder,
  TextEncoder: globalThis.TextEncoder,
};
const mockFetch = jest.mocked(expoFetch);

beforeAll(() => {
  Object.assign(globalThis, {
    Request: LegacyRequest,
    Response: LegacyResponse,
    ReadableStream,
    TextDecoder,
    TextEncoder,
  });
});
afterAll(() => {
  Object.assign(globalThis, originalGlobals);
});
beforeEach(() => {
  mockFetch.mockReset();
});

function nativeResponse(
  body: ReadableStream<Uint8Array> | null,
  status = 200,
  headers: HeadersInit = {},
): Awaited<ReturnType<typeof expoFetch>> {
  return {
    body,
    status,
    statusText: String(status),
    headers: new Headers(headers),
    text: async () => '',
  } as unknown as Awaited<ReturnType<typeof expoFetch>>;
}

function textBody(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function stalledBody() {
  let onRead: () => void = () => undefined;
  const reading = new Promise<void>((resolve) => {
    onRead = resolve;
  });
  const body = new ReadableStream<Uint8Array>(
    {
      pull() {
        onRead();
        return new Promise<void>(() => undefined);
      },
    },
    { highWaterMark: 0 },
  );
  return { body, reading };
}

describe('shared native fetch boundary', () => {
  it('sends omit directly to Expo even when the global Request cannot advertise credentials', async () => {
    mockFetch.mockResolvedValueOnce(nativeResponse(null, 302, { Location: '/next' }));
    const client = createHttpClient({ baseUrl: 'https://example.com', statusPolicy: 'all' });
    await expect(
      client.request({
        method: 'GET',
        path: '/page',
        query: { tag: ['one', 'two'] },
        credentials: 'omit',
        redirect: 'manual',
        responseType: 'text',
      }),
    ).resolves.toMatchObject({ status: 302, headers: { location: '/next' } });
    expect(mockFetch.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://example.com/page?tag=one&tag=two',
      credentials: 'same-origin',
    });
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', redirect: 'manual' });
  });

  it('bounds the actual Expo body without global stream support and stops only its native task', async () => {
    mockFetch.mockResolvedValueOnce(nativeResponse(textBody('ABC')));
    const controller = new AbortController();
    const client = createHttpClient({ baseUrl: 'https://example.com' });
    await expect(
      client.request({
        method: 'GET',
        path: '/',
        credentials: 'omit',
        signal: controller.signal,
        responseType: 'text',
        maxResponseBytes: 2,
        truncateResponse: true,
      }),
    ).resolves.toEqual({ data: 'AB', status: 200, headers: {}, truncated: true });
    expect(mockFetch.mock.calls[0]?.[1]?.credentials).toBe('omit');
    expect(mockFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(controller.signal.aborted).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'all'] as const)(
    'retains status policy %s for bounded bodies',
    async (statusPolicy) => {
      mockFetch.mockResolvedValueOnce(
        nativeResponse(textBody('ABC'), 422, { 'X-Request-Id': 'request-422' }),
      );
      const client = createHttpClient({ baseUrl: 'https://example.com', statusPolicy });
      const pending = client.request({
        method: 'GET',
        path: '/',
        responseType: 'text',
        maxResponseBytes: 2,
        truncateResponse: true,
      });
      if (statusPolicy === 'all') {
        await expect(pending).resolves.toEqual({
          data: 'AB',
          status: 422,
          headers: { 'x-request-id': 'request-422' },
          truncated: true,
        });
      } else {
        await expect(pending).rejects.toMatchObject({
          kind: 'http',
          status: 422,
          requestId: 'request-422',
        });
      }
      expect(mockFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([200, 204, 205, 304])(
    'completes HTTP %s without inventing truncation',
    async (status) => {
      mockFetch.mockResolvedValueOnce(
        nativeResponse(status === 200 ? textBody('A') : null, status),
      );
      const client = createHttpClient({ baseUrl: 'https://example.com', statusPolicy: 'all' });
      await expect(
        client.request({
          method: 'GET',
          path: '/',
          responseType: 'text',
          maxResponseBytes: 2,
          truncateResponse: true,
        }),
      ).resolves.toMatchObject({ data: status === 200 ? 'A' : '', status, truncated: false });
      expect(mockFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    },
  );

  it('stops native I/O when consuming the body fails without replaying the request', async () => {
    mockFetch.mockResolvedValueOnce(
      nativeResponse(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('Unreadable native response.'));
          },
        }),
      ),
    );
    const client = createHttpClient({ baseUrl: 'https://example.com' });
    await expect(
      client.request({
        method: 'GET',
        path: '/',
        responseType: 'text',
        maxResponseBytes: 2,
        truncateResponse: true,
      }),
    ).rejects.toMatchObject({ kind: 'network' });
    expect(mockFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the deadline active after native headers arrive and preserves error routing', async () => {
    jest.useFakeTimers();
    try {
      const { body, reading } = stalledBody();
      mockFetch.mockResolvedValueOnce(nativeResponse(body));
      const onError = jest.fn((error: HttpError) => error);
      const client = createHttpClient({
        baseUrl: 'https://example.com',
        interceptors: [{ onError }],
      });
      const pending = client.request({
        method: 'GET',
        path: '/',
        timeoutMs: 100,
        responseType: 'text',
        maxResponseBytes: 2,
        truncateResponse: true,
      });
      const assertion = expect(pending).rejects.toMatchObject({
        kind: 'timeout',
        code: 'REQUEST_TIMEOUT',
      });
      await reading;
      await jest.advanceTimersByTimeAsync(100);
      await assertion;
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'timeout' }),
        expect.anything(),
      );
      expect(mockFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('aborts the native task when the caller cancels during body consumption', async () => {
    const { body, reading } = stalledBody();
    mockFetch.mockResolvedValueOnce(nativeResponse(body));
    const controller = new AbortController();
    const client = createHttpClient({ baseUrl: 'https://example.com' });
    const pending = client.request({
      method: 'GET',
      path: '/',
      signal: controller.signal,
      responseType: 'text',
      maxResponseBytes: 2,
      truncateResponse: true,
    });
    const assertion = expect(pending).rejects.toMatchObject({
      kind: 'cancelled',
      code: 'REQUEST_CANCELLED',
    });
    await reading;
    controller.abort();
    await assertion;
    expect(mockFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
