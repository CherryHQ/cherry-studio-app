import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { z } from 'zod';

import { __testing } from '../createHttpClient';
import type { HttpInterceptor, HttpRequest } from '../HttpClient';
import { HttpError } from '../HttpError';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@logger', () => {
  const logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() };
  return { loggerService: { withContext: () => logger } };
});

const transportLogger = (
  jest.requireMock('@logger') as {
    loggerService: { withContext: (module: string) => { error: jest.Mock; warn: jest.Mock } };
  }
).loggerService.withContext('HttpTransport');

beforeEach(() => {
  jest.clearAllMocks();
});

function response<T>(
  config: InternalAxiosRequestConfig,
  status: number,
  data: T,
  headers = new AxiosHeaders(),
): AxiosResponse<T> {
  return {
    config,
    data,
    headers,
    status,
    statusText: String(status),
  };
}

function responseError<T>(
  config: InternalAxiosRequestConfig,
  status: number,
  data: T,
  headers = new AxiosHeaders(),
): AxiosError<T> {
  return new AxiosError(
    `Request failed with status ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    config,
    undefined,
    response(config, status, data, headers),
  );
}

function mockAdapter(
  implementation: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>,
): jest.MockedFunction<AxiosAdapter> {
  return jest.fn(implementation) as jest.MockedFunction<AxiosAdapter>;
}

describe('createHttpClient', () => {
  it('keeps Axios behind the app-owned client contract', () => {
    const createClient = __testing.createHttpClientFactoryWithAdapter(
      mockAdapter(async (config) => response(config, 200, {})),
    );
    const client = createClient({ baseUrl: 'https://api.cherry.example.com' });

    expect(client).toEqual({ request: expect.any(Function) });
    expect(client).not.toHaveProperty('defaults');
    expect(client).not.toHaveProperty('interceptors');
  });

  it('preserves request capabilities and returns an app-owned complete response', async () => {
    const controller = new AbortController();
    const adapter = mockAdapter(async (config) => {
      expect(config.baseURL).toBe('https://api.cherry.example.com/root');
      expect(config.url).toBe('/agents/agent-1');
      expect(config.params).toEqual({ verbose: true });
      expect(config.data).toBe('{"enabled":true}');
      expect(config.headers.get('Accept')).toBe('application/vnd.cherry+json');
      expect(config.headers.get('Content-Type')).toBe('application/json');
      expect(config.headers.get('X-Caller')).toBe('agent-settings');
      expect(config.signal).toBe(controller.signal);
      expect(config.timeout).toBe(1_500);
      return response(
        config,
        202,
        { accepted: true },
        new AxiosHeaders({ 'X-Request-Id': 'request-1' }),
      );
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({
      baseUrl: 'https://api.cherry.example.com/root',
      headers: { Accept: 'application/vnd.cherry+json' },
    });

    const result = await client.request<{ accepted: boolean }, { enabled: boolean }>({
      body: { enabled: true },
      headers: {
        'Content-Type': 'application/json',
        'X-Caller': 'agent-settings',
      },
      method: 'POST',
      path: '/agents/agent-1',
      query: { verbose: true },
      signal: controller.signal,
      timeoutMs: 1_500,
    });

    expect(result).toEqual({
      data: { accepted: true },
      headers: { 'x-request-id': 'request-1' },
      status: 202,
    });
  });

  it('supports bounded text responses without exposing Axios response types', async () => {
    const adapter = mockAdapter(async (config) => {
      expect(config.maxContentLength).toBe(65_536);
      expect(config.responseType).toBe('text');
      return response(config, 200, '{"revision":1}');
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({ baseUrl: 'https://catalog.cherry.example.com' });

    await expect(
      client.request<string>({
        maxResponseBytes: 65_536,
        method: 'GET',
        path: '/manifest.json',
        responseType: 'text',
      }),
    ).resolves.toEqual({
      data: '{"revision":1}',
      headers: {},
      status: 200,
    });
  });

  it('routes each request through only its client interceptors on one transport', async () => {
    const adapter = mockAdapter(async (config) => {
      const source = config.baseURL?.includes('cloud') ? 'cloud' : 'desktop';
      return response(config, 200, { source });
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const cloudInterceptor: HttpInterceptor = {
      onRequest: (request) => ({
        ...request,
        headers: { ...request.headers, 'X-Cloud-Interceptor': 'installed' },
      }),
      onResponse: (result) => ({
        ...result,
        data: { source: 'cloud-intercepted' },
      }),
    };
    const desktopInterceptor: HttpInterceptor = {
      onRequest: (request) => ({
        ...request,
        headers: { ...request.headers, 'X-Desktop-Interceptor': 'installed' },
      }),
    };
    const cloudApi = createClient({
      baseUrl: 'https://cloud.cherry.example.com',
      headers: { Authorization: 'Bearer cloud-token' },
      interceptors: [cloudInterceptor],
    });
    const desktopLanApi = createClient({
      baseUrl: 'http://192.168.1.8:23333',
      headers: { 'X-Device-Token': 'device-token' },
      interceptors: [desktopInterceptor],
    });

    await expect(cloudApi.request({ method: 'GET', path: '/status' })).resolves.toMatchObject({
      data: { source: 'cloud-intercepted' },
    });
    await expect(desktopLanApi.request({ method: 'GET', path: '/status' })).resolves.toMatchObject({
      data: { source: 'desktop' },
    });

    const cloudConfig = adapter.mock.calls[0]?.[0];
    const desktopConfig = adapter.mock.calls[1]?.[0];
    expect(cloudConfig?.headers.get('Authorization')).toBe('Bearer cloud-token');
    expect(cloudConfig?.headers.get('X-Cloud-Interceptor')).toBe('installed');
    expect(cloudConfig?.headers.get('X-Device-Token')).toBeUndefined();
    expect(cloudConfig?.headers.get('X-Desktop-Interceptor')).toBeUndefined();
    expect(desktopConfig?.headers.get('X-Device-Token')).toBe('device-token');
    expect(desktopConfig?.headers.get('X-Desktop-Interceptor')).toBe('installed');
    expect(desktopConfig?.headers.get('Authorization')).toBeUndefined();
    expect(desktopConfig?.headers.get('X-Cloud-Interceptor')).toBeUndefined();
  });

  it('routes mapped errors through only the failing client interceptor chain', async () => {
    const adapter = mockAdapter(async (config) => {
      throw responseError(config, 503, { unavailable: true });
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const cloudApi = createClient({
      baseUrl: 'https://cloud.cherry.example.com',
      interceptors: [
        {
          onError: (error) =>
            new HttpError('Cloud is unavailable.', {
              code: 'CLOUD_UNAVAILABLE',
              kind: error.kind,
              status: error.status,
            }),
        },
      ],
    });
    const desktopLanApi = createClient({
      baseUrl: 'http://192.168.1.8:23333',
      interceptors: [
        {
          onError: (error) =>
            new HttpError('Desktop is unavailable.', {
              code: 'DESKTOP_UNAVAILABLE',
              kind: error.kind,
              status: error.status,
            }),
        },
      ],
    });

    await expect(cloudApi.request({ method: 'GET', path: '/status' })).rejects.toMatchObject({
      code: 'CLOUD_UNAVAILABLE',
      message: 'Cloud is unavailable.',
    });
    await expect(desktopLanApi.request({ method: 'GET', path: '/status' })).rejects.toMatchObject({
      code: 'DESKTOP_UNAVAILABLE',
      message: 'Desktop is unavailable.',
    });
  });

  it('lets a domain decoder inspect a safe response and exposes only its validated result', async () => {
    const ErrorBodySchema = z.object({
      code: z.string(),
      message: z.string(),
    });
    const adapter = mockAdapter(async (config) => {
      expect(config.headers.get('Authorization')).toBe('Bearer access-secret');
      throw responseError(
        config,
        429,
        {
          code: 'RATE_LIMITED',
          message: 'Sensitive upstream message: response-secret',
          token: 'response-secret',
        },
        new AxiosHeaders({ 'Retry-After': '120', 'X-Request-Id': 'request-429' }),
      );
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({ baseUrl: 'https://api.cherry.example.com' });

    const error = await client
      .request({
        errorDecoder: ({ data, headers, status }) => {
          expect(status).toBe(429);
          const parsed = ErrorBodySchema.parse(data);
          return {
            code: parsed.code,
            details: { operation: 'list_agents' },
            message: 'Too many requests.',
            requestId: headers['x-request-id'],
            retryAfter: headers['retry-after'],
          };
        },
        headers: { Authorization: 'Bearer access-secret' },
        method: 'GET',
        path: '/agents',
      })
      .catch((value) => value);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).not.toBeInstanceOf(AxiosError);
    expect(error).toMatchObject({
      code: 'RATE_LIMITED',
      details: { operation: 'list_agents' },
      kind: 'http',
      message: 'Too many requests.',
      requestId: 'request-429',
      retryAfter: '120',
      status: 429,
    });
    expect(error.cause).toBeUndefined();
    expect(error.config).toBeUndefined();
    expect(error.response).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain('access-secret');
    expect(JSON.stringify(error)).not.toContain('response-secret');
  });

  it('falls back safely when an HTTP error body does not match the domain schema', async () => {
    const adapter = mockAdapter(async (config) => {
      throw responseError(
        config,
        503,
        { secret: 'unvalidated-secret' },
        new AxiosHeaders({ 'Retry-After': '60', 'X-Request-Id': 'request-503' }),
      );
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({ baseUrl: 'https://api.cherry.example.com' });

    const error = await client
      .request({
        errorDecoder: () => z.never().parse('invalid'),
        method: 'GET',
        path: '/agents',
      })
      .catch((value) => value);

    expect(error).toMatchObject({
      kind: 'http',
      message: 'HTTP request failed with status 503.',
      requestId: 'request-503',
      retryAfter: '60',
      status: 503,
    });
    expect(JSON.stringify(error)).not.toContain('unvalidated-secret');
  });

  it.each([
    [AxiosError.ETIMEDOUT, 'timeout', 'REQUEST_TIMEOUT'],
    [AxiosError.ERR_NETWORK, 'network', 'NETWORK_ERROR'],
    [AxiosError.ERR_CANCELED, 'cancelled', 'REQUEST_CANCELLED'],
    [AxiosError.ERR_BAD_RESPONSE, 'invalid_response', 'INVALID_HTTP_RESPONSE'],
  ] as const)('maps transport error %s as %s', async (axiosCode, kind, code) => {
    const adapter = mockAdapter(async (config) => {
      throw new AxiosError('transport failed', axiosCode, config);
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({ baseUrl: 'https://api.cherry.example.com' });

    const error = await client.request({ method: 'GET', path: '/agents' }).catch((value) => value);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ code, kind });
    expect(error.cause).toBeUndefined();
  });

  it('rejects a body on GET and DELETE requests, including one added by an interceptor', async () => {
    const adapter = mockAdapter(async (config) => response(config, 200, {}));
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);

    const directClient = createClient({ baseUrl: 'https://api.cherry.example.com' });
    await expect(
      directClient.request({
        body: { enabled: true },
        method: 'DELETE',
        path: '/agents/agent-1',
      } as never),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST_BODY', kind: 'internal' });

    const interceptedClient = createClient({
      baseUrl: 'https://api.cherry.example.com',
      interceptors: [
        {
          onRequest: (request) =>
            ({ ...request, body: { injected: true } }) as unknown as HttpRequest<unknown>,
        },
      ],
    });
    await expect(
      interceptedClient.request({ method: 'GET', path: '/agents' }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST_BODY', kind: 'internal' });

    expect(adapter).not.toHaveBeenCalled();
  });

  it('rejects non-positive timeouts for clients and requests', async () => {
    const adapter = mockAdapter(async (config) => response(config, 200, {}));
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);

    let clientError: unknown;
    try {
      createClient({ baseUrl: 'https://api.cherry.example.com', timeoutMs: 0 });
    } catch (error) {
      clientError = error;
    }
    expect(clientError).toMatchObject({ code: 'INVALID_CLIENT_TIMEOUT', kind: 'internal' });

    const client = createClient({ baseUrl: 'https://api.cherry.example.com' });
    await expect(
      client.request({ method: 'GET', path: '/agents', timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST_TIMEOUT', kind: 'internal' });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('rejects invalid response controls before transport', async () => {
    const adapter = mockAdapter(async (config) => response(config, 200, {}));
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({ baseUrl: 'https://api.cherry.example.com' });

    await expect(
      client.request({ maxResponseBytes: 0, method: 'GET', path: '/manifest.json' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE_SIZE_LIMIT', kind: 'internal' });
    await expect(
      client.request({
        method: 'GET',
        path: '/manifest.json',
        responseType: 'arraybuffer',
      } as never),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE_TYPE', kind: 'internal' });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('maps an oversized response to a stable app-owned error', async () => {
    const adapter = mockAdapter(async (config) => {
      throw new AxiosError(
        'maxContentLength size of 1024 exceeded',
        AxiosError.ERR_BAD_RESPONSE,
        config,
      );
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({ baseUrl: 'https://api.cherry.example.com' });

    await expect(
      client.request({ maxResponseBytes: 1024, method: 'GET', path: '/manifest.json' }),
    ).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
      kind: 'invalid_response',
      message: 'HTTP response exceeded the allowed size.',
    });
  });

  it('reports an error interceptor that returns an invalid value without hiding the reason', async () => {
    const adapter = mockAdapter(async (config) => {
      throw responseError(config, 500, {});
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({
      baseUrl: 'https://api.cherry.example.com',
      interceptors: [{ onError: () => undefined as unknown as HttpError }],
    });

    await expect(client.request({ method: 'GET', path: '/agents' })).rejects.toMatchObject({
      code: 'INVALID_INTERCEPTOR_ERROR',
      kind: 'internal',
      message: 'HTTP error interceptor returned an invalid value.',
    });
  });

  it('logs real transport diagnostics while the public error stays stable', async () => {
    const adapter = mockAdapter(async (config) => {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({ baseUrl: 'https://api.cherry.example.com' });

    const error = await client
      .request({
        headers: { Authorization: 'Bearer access-secret' },
        method: 'GET',
        path: '/agents',
        query: { token: 'query-secret' },
      })
      .catch((value) => value);

    expect(error).toMatchObject({ code: 'NETWORK_ERROR', kind: 'network' });
    expect(transportLogger.warn).toHaveBeenCalledWith(
      'HTTP request failed.',
      expect.objectContaining({
        code: AxiosError.ERR_NETWORK,
        url: 'https://api.cherry.example.com/agents',
      }),
    );
    const logged = JSON.stringify([
      ...transportLogger.warn.mock.calls,
      ...transportLogger.error.mock.calls,
    ]);
    expect(logged).not.toContain('access-secret');
    expect(logged).not.toContain('query-secret');
  });

  it('rejects absolute request URLs before transport', async () => {
    const adapter = mockAdapter(async (config) => response(config, 200, {}));
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({ baseUrl: 'http://192.168.1.8:23333' });

    await expect(
      client.request({ method: 'GET', path: 'https://other.example.com/data' }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST_PATH',
      kind: 'internal',
    });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('does not replay a 401 unless a domain explicitly does so', async () => {
    const adapter = mockAdapter(async (config) => {
      throw responseError(config, 401, { code: 'TOKEN_EXPIRED' });
    });
    const createClient = __testing.createHttpClientFactoryWithAdapter(adapter);
    const client = createClient({ baseUrl: 'https://api.cherry.example.com' });

    const error = await client.request({ method: 'GET', path: '/account' }).catch((value) => value);

    expect(error).toMatchObject({ kind: 'http', status: 401 });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
