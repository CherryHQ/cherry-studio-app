import {
  AxiosError,
  create as createAxiosInstance,
  isAxiosError,
  isCancel,
  type AxiosAdapter,
} from 'axios';

import type { HttpClient, HttpHeaders, HttpRequest } from './HttpClient';
import { HttpError, isHttpError } from './HttpError';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface CreateHttpClientOptions {
  baseUrl: string;
  headers?: HttpHeaders;
  timeoutMs?: number;
}

interface InternalCreateHttpClientOptions extends CreateHttpClientOptions {
  adapter?: AxiosAdapter;
}

function assertValidBaseUrl(baseUrl: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new HttpError('HTTP client base URL is invalid.', {
      code: 'INVALID_BASE_URL',
      kind: 'internal',
    });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new HttpError('HTTP client base URL must use HTTP or HTTPS.', {
      code: 'INVALID_BASE_URL',
      kind: 'internal',
    });
  }
}

function assertValidRequestPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new HttpError('HTTP request path must be a relative API path beginning with `/`.', {
      code: 'INVALID_REQUEST_PATH',
      kind: 'internal',
    });
  }
}

function normalizeHttpError(error: unknown): HttpError {
  if (isHttpError(error)) {
    return error;
  }

  if (!isAxiosError(error)) {
    return new HttpError('HTTP request failed unexpectedly.', {
      code: 'HTTP_INTERNAL_ERROR',
      kind: 'internal',
    });
  }

  if (isCancel(error) || error.code === AxiosError.ERR_CANCELED) {
    return new HttpError('HTTP request was cancelled.', {
      code: 'REQUEST_CANCELLED',
      kind: 'cancelled',
    });
  }

  if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
    return new HttpError('HTTP request timed out.', {
      code: 'REQUEST_TIMEOUT',
      kind: 'timeout',
    });
  }

  if (error.response) {
    return new HttpError(`HTTP request failed with status ${error.response.status}.`, {
      kind: 'http',
      status: error.response.status,
    });
  }

  if (error.code === AxiosError.ERR_BAD_RESPONSE) {
    return new HttpError('HTTP response could not be read.', {
      code: 'INVALID_HTTP_RESPONSE',
      kind: 'invalid_response',
    });
  }

  return new HttpError('HTTP request could not reach the server.', {
    code: 'NETWORK_ERROR',
    kind: 'network',
  });
}

function createHttpClientInternal(options: InternalCreateHttpClientOptions): HttpClient {
  assertValidBaseUrl(options.baseUrl);

  const instance = createAxiosInstance({
    ...(options.adapter ? { adapter: options.adapter } : {}),
    baseURL: options.baseUrl,
    headers: options.headers,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  return Object.freeze({
    async request<TResponse, TBody = unknown>(request: HttpRequest<TBody>): Promise<TResponse> {
      assertValidRequestPath(request.path);

      try {
        const response = await instance.request<TResponse>({
          data: request.body,
          headers: request.headers,
          method: request.method,
          params: request.query,
          signal: request.signal,
          timeout: request.timeoutMs,
          url: request.path,
        });

        return response.data;
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
  });
}

export function createHttpClient(options: CreateHttpClientOptions): HttpClient {
  return createHttpClientInternal(options);
}

export const __testing = {
  createHttpClientWithAdapter(options: CreateHttpClientOptions, adapter: AxiosAdapter): HttpClient {
    return createHttpClientInternal({ ...options, adapter });
  },
};
