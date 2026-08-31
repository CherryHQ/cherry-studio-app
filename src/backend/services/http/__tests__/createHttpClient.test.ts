import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { __testing } from '../createHttpClient';
import { HttpError } from '../HttpError';

function response<T>(
  config: InternalAxiosRequestConfig,
  status: number,
  data: T,
): AxiosResponse<T> {
  return {
    config,
    data,
    headers: new AxiosHeaders(),
    status,
    statusText: String(status),
  };
}

function responseError<T>(
  config: InternalAxiosRequestConfig,
  status: number,
  data: T,
): AxiosError<T> {
  return new AxiosError(
    `Request failed with status ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    config,
    undefined,
    response(config, status, data),
  );
}

function mockAdapter(
  implementation: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>,
): jest.MockedFunction<AxiosAdapter> {
  return jest.fn(implementation) as jest.MockedFunction<AxiosAdapter>;
}

describe('createHttpClient', () => {
  it('applies instance defaults and returns only response data', async () => {
    const adapter = mockAdapter(async (config) => {
      expect(config.baseURL).toBe('http://192.168.1.8:23333/root');
      expect(config.url).toBe('/api/status');
      expect(config.params).toEqual({ verbose: true });
      expect(config.headers.get('Accept')).toBe('application/vnd.cherry+json');
      expect(config.headers.get('X-Client-Version')).toBe('1.0.0');
      expect(config.headers.get('X-Caller')).toBe('connection-check');
      return response(config, 200, { connected: true });
    });
    const client = __testing.createHttpClientWithAdapter(
      {
        baseUrl: 'http://192.168.1.8:23333/root',
        headers: {
          Accept: 'application/vnd.cherry+json',
          'X-Client-Version': '1.0.0',
        },
      },
      adapter,
    );

    await expect(
      client.request<{ connected: boolean }>({
        headers: { 'X-Caller': 'connection-check' },
        method: 'GET',
        path: '/api/status',
        query: { verbose: true },
      }),
    ).resolves.toEqual({ connected: true });
  });

  it('lets request headers override instance defaults case-insensitively', async () => {
    const adapter = mockAdapter(async (config) => {
      expect(config.headers.get('Accept')).toBe('application/vnd.cherry.status+json');
      return response(config, 200, {});
    });
    const client = __testing.createHttpClientWithAdapter(
      {
        baseUrl: 'http://192.168.1.8:23333',
        headers: { Accept: 'application/vnd.cherry+json' },
      },
      adapter,
    );

    await client.request({
      headers: { accept: 'application/vnd.cherry.status+json' },
      method: 'GET',
      path: '/api/status',
    });
  });

  it('returns a 401 as an ordinary HTTP error without replaying the request', async () => {
    const adapter = mockAdapter(async (config) => {
      throw responseError(config, 401, { message: 'Pairing required' });
    });
    const client = __testing.createHttpClientWithAdapter(
      { baseUrl: 'http://192.168.1.8:23333' },
      adapter,
    );

    await expect(client.request({ method: 'GET', path: '/api/status' })).rejects.toMatchObject({
      kind: 'http',
      message: 'HTTP request failed with status 401.',
      status: 401,
    });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('does not retain an Axios error containing request secrets as its cause', async () => {
    const adapter = mockAdapter(async (config) => {
      expect(config.headers.get('X-Pairing-Key')).toBe('pairing-secret');
      throw new AxiosError('transport failed', AxiosError.ERR_NETWORK, config);
    });
    const client = __testing.createHttpClientWithAdapter(
      { baseUrl: 'http://192.168.1.8:23333' },
      adapter,
    );

    const error = await client
      .request({
        headers: { 'X-Pairing-Key': 'pairing-secret' },
        method: 'GET',
        path: '/api/status',
      })
      .catch((value) => value);

    expect(error).toBeInstanceOf(HttpError);
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain('pairing-secret');
  });

  it.each([
    [AxiosError.ETIMEDOUT, 'timeout', 'REQUEST_TIMEOUT'],
    [AxiosError.ERR_NETWORK, 'network', 'NETWORK_ERROR'],
    [AxiosError.ERR_CANCELED, 'cancelled', 'REQUEST_CANCELLED'],
    [AxiosError.ERR_BAD_RESPONSE, 'invalid_response', 'INVALID_HTTP_RESPONSE'],
  ] as const)('normalizes transport error %s as %s', async (axiosCode, kind, code) => {
    const adapter = mockAdapter(async (config) => {
      throw new AxiosError('transport failed', axiosCode, config);
    });
    const client = __testing.createHttpClientWithAdapter(
      { baseUrl: 'http://192.168.1.8:23333' },
      adapter,
    );

    const error = await client
      .request({ method: 'GET', path: '/api/status' })
      .catch((value) => value);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ code, kind });
  });

  it('rejects absolute request URLs before transport', async () => {
    const adapter = mockAdapter(async (config) => response(config, 200, {}));
    const client = __testing.createHttpClientWithAdapter(
      { baseUrl: 'http://192.168.1.8:23333' },
      adapter,
    );

    await expect(
      client.request({ method: 'GET', path: 'https://other.example.com/data' }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST_PATH', kind: 'internal' });
    expect(adapter).not.toHaveBeenCalled();
  });
});
