import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';

import { createAxiosClient } from '../createAxiosClient';
import { HttpError } from '../HttpError';
import { mapAxiosError } from '../mapAxiosError';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

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

function clientWithAdapter(baseURL: string, adapter: AxiosAdapter) {
  const client = createAxiosClient({ baseURL });
  client.defaults.adapter = adapter;
  return client;
}

describe('createAxiosClient', () => {
  it('uses the Axios fetch adapter with expo/fetch explicitly', () => {
    const client = createAxiosClient({ baseURL: 'https://api.cherry.example.com' });

    expect(client.defaults.adapter).toBe('fetch');
    expect(client.defaults.env?.fetch).toBe(expoFetch);
  });

  it('preserves the complete response and native Axios request capabilities', async () => {
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
    const client = createAxiosClient({
      baseURL: 'https://api.cherry.example.com/root',
      headers: { Accept: 'application/vnd.cherry+json' },
    });
    client.defaults.adapter = adapter;

    const result = await client.post<{ accepted: boolean }>(
      '/agents/agent-1',
      { enabled: true },
      {
        headers: { 'X-Caller': 'agent-settings' },
        params: { verbose: true },
        signal: controller.signal,
        timeout: 1_500,
      },
    );

    expect(result.data).toEqual({ accepted: true });
    expect(result.status).toBe(202);
    expect(result.headers.get('x-request-id')).toBe('request-1');
  });

  it('isolates defaults and request/response interceptors between instances', async () => {
    const cloudAdapter = mockAdapter(async (config) => response(config, 200, { source: 'cloud' }));
    const desktopAdapter = mockAdapter(async (config) =>
      response(config, 200, { source: 'desktop' }),
    );
    const cloudApi = createAxiosClient({
      baseURL: 'https://api.cherry.example.com',
      headers: { Authorization: 'Bearer cloud-token' },
    });
    const desktopLanApi = createAxiosClient({
      baseURL: 'http://192.168.1.8:23333',
      headers: { 'X-Device-Token': 'device-token' },
    });
    cloudApi.defaults.adapter = cloudAdapter;
    desktopLanApi.defaults.adapter = desktopAdapter;

    const requestInterceptor = cloudApi.interceptors.request.use((config) => {
      config.headers.set('X-Cloud-Interceptor', 'installed');
      return config;
    });
    const responseInterceptor = cloudApi.interceptors.response.use((result) => ({
      ...result,
      data: { source: 'cloud-intercepted' },
    }));

    await expect(cloudApi.get('/status')).resolves.toMatchObject({
      data: { source: 'cloud-intercepted' },
    });
    await expect(desktopLanApi.get('/status')).resolves.toMatchObject({
      data: { source: 'desktop' },
    });

    const cloudConfig = cloudAdapter.mock.calls[0]?.[0];
    const desktopConfig = desktopAdapter.mock.calls[0]?.[0];
    expect(cloudConfig?.headers.get('Authorization')).toBe('Bearer cloud-token');
    expect(cloudConfig?.headers.get('X-Cloud-Interceptor')).toBe('installed');
    expect(cloudConfig?.headers.get('X-Device-Token')).toBeUndefined();
    expect(desktopConfig?.headers.get('X-Device-Token')).toBe('device-token');
    expect(desktopConfig?.headers.get('Authorization')).toBeUndefined();
    expect(desktopConfig?.headers.get('X-Cloud-Interceptor')).toBeUndefined();

    cloudApi.interceptors.request.eject(requestInterceptor);
    cloudApi.interceptors.response.eject(responseInterceptor);
    await expect(cloudApi.get('/status')).resolves.toMatchObject({ data: { source: 'cloud' } });
    expect(cloudAdapter.mock.calls[1]?.[0].headers.get('X-Cloud-Interceptor')).toBeUndefined();
  });

  it('lets a domain decoder inspect an error response and exposes only its safe result', async () => {
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
    const client = clientWithAdapter('https://api.cherry.example.com', adapter);

    async function listAgents() {
      try {
        return await client.get('/agents', {
          headers: { Authorization: 'Bearer access-secret' },
        });
      } catch (error) {
        throw mapAxiosError(error, ({ data, headers, status }) => {
          expect(status).toBe(429);
          const parsed = ErrorBodySchema.parse(data);
          return {
            code: parsed.code,
            details: { operation: 'list_agents' },
            message: 'Too many requests.',
            requestId: String(headers.get('x-request-id')),
            retryAfter: String(headers.get('retry-after')),
          };
        });
      }
    }

    const error = await listAgents().catch((value) => value);

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
    const client = clientWithAdapter('https://api.cherry.example.com', adapter);

    const error = await client
      .get('/agents')
      .catch((value) => mapAxiosError(value, () => z.never().parse('invalid')));

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
  ] as const)('maps transport error %s as %s', (axiosCode, kind, code) => {
    const error = mapAxiosError(new AxiosError('transport failed', axiosCode));

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ code, kind });
    expect(error.cause).toBeUndefined();
  });

  it('rejects absolute request URLs before transport', async () => {
    const adapter = mockAdapter(async (config) => response(config, 200, {}));
    const client = clientWithAdapter('http://192.168.1.8:23333', adapter);

    await expect(client.get('https://other.example.com/data')).rejects.toMatchObject({
      code: 'INVALID_REQUEST_PATH',
      kind: 'internal',
    });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('rejects per-request base URL overrides before credentials reach transport', async () => {
    const adapter = mockAdapter(async (config) => response(config, 200, {}));
    const client = createAxiosClient({
      baseURL: 'https://api.cherry.example.com',
      headers: { Authorization: 'Bearer cloud-token' },
    });
    client.defaults.adapter = adapter;

    await expect(
      client.get('/account', { baseURL: 'https://other.example.com' }),
    ).rejects.toMatchObject({
      code: 'INVALID_BASE_URL_OVERRIDE',
      kind: 'internal',
    });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('does not replay a 401 unless a domain explicitly installs that behavior', async () => {
    const adapter = mockAdapter(async (config) => {
      throw responseError(config, 401, { code: 'TOKEN_EXPIRED' });
    });
    const client = clientWithAdapter('https://api.cherry.example.com', adapter);

    const error = await client.get('/account').catch((value) => mapAxiosError(value));

    expect(error).toMatchObject({ kind: 'http', status: 401 });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
