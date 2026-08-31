import {
  AxiosHeaders,
  create as createAxiosInstance,
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from 'axios';
import { fetch as expoFetch } from 'expo/fetch';

import type {
  HttpClient,
  HttpErrorDecoder,
  HttpHeaders,
  HttpInterceptor,
  HttpMethod,
  HttpRequest,
  HttpResponse,
} from './HttpClient';
import { HttpError, isHttpError } from './HttpError';
import { mapAxiosError } from './mapAxiosError';
import { toHttpHeaders } from './toHttpHeaders';

const DEFAULT_TIMEOUT_MS = 30_000;
const HTTP_ROUTE = Symbol('httpRoute');
const HTTP_REQUEST = Symbol('httpRequest');
const HTTP_METHODS = new Set<HttpMethod>(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']);

type AxiosFetch = NonNullable<NonNullable<CreateAxiosDefaults['env']>['fetch']>;

export interface CreateHttpClientOptions {
  baseUrl: string;
  errorDecoder?: HttpErrorDecoder;
  headers?: HttpHeaders;
  interceptors?: readonly HttpInterceptor[];
  timeoutMs?: number;
}

interface HttpRoute {
  readonly baseUrl: string;
  readonly errorDecoder?: HttpErrorDecoder;
  readonly headers: HttpHeaders;
  readonly interceptors: readonly HttpInterceptor[];
  readonly timeoutMs: number;
}

interface RoutedAxiosConfig {
  [HTTP_REQUEST]?: HttpRequest<unknown>;
  [HTTP_ROUTE]?: HttpRoute;
}

type RoutedAxiosRequestConfig = AxiosRequestConfig & RoutedAxiosConfig;
type RoutedInternalAxiosRequestConfig = InternalAxiosRequestConfig & RoutedAxiosConfig;

interface HttpRequestContext {
  readonly request: HttpRequest<unknown>;
  readonly route: HttpRoute;
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

function assertValidRequest(request: HttpRequest<unknown>): void {
  if (!request || typeof request !== 'object' || !HTTP_METHODS.has(request.method)) {
    throw new HttpError('HTTP request method is invalid.', {
      code: 'INVALID_REQUEST_METHOD',
      kind: 'internal',
    });
  }

  if (
    typeof request.path !== 'string' ||
    !request.path.startsWith('/') ||
    request.path.startsWith('//')
  ) {
    throw new HttpError('HTTP request path must be a relative API path beginning with `/`.', {
      code: 'INVALID_REQUEST_PATH',
      kind: 'internal',
    });
  }
}

function assertValidResponse(response: HttpResponse<unknown>): void {
  if (
    !response ||
    typeof response !== 'object' ||
    typeof response.status !== 'number' ||
    !response.headers ||
    typeof response.headers !== 'object'
  ) {
    throw new HttpError('HTTP response interceptor returned an invalid value.', {
      code: 'INVALID_INTERCEPTOR_RESPONSE',
      kind: 'internal',
    });
  }
}

function mergeHeaders(defaults: HttpHeaders, requestHeaders?: HttpHeaders): HttpHeaders {
  const headers = AxiosHeaders.from(defaults);
  if (requestHeaders) {
    headers.set(requestHeaders);
  }
  return Object.freeze(headers.toJSON(true));
}

function getRequestContext(config?: AxiosRequestConfig): HttpRequestContext | undefined {
  const routedConfig = config as RoutedAxiosRequestConfig | undefined;
  const request = routedConfig?.[HTTP_REQUEST];
  const route = routedConfig?.[HTTP_ROUTE];

  return request && route ? { request, route } : undefined;
}

async function dispatchError(error: unknown, context?: HttpRequestContext): Promise<HttpError> {
  let mappedError = mapAxiosError(
    error,
    context?.request.errorDecoder ?? context?.route.errorDecoder,
  );

  if (!context) {
    return mappedError;
  }

  for (const interceptor of context.route.interceptors) {
    if (!interceptor.onError) {
      continue;
    }

    try {
      const interceptedError = await interceptor.onError(mappedError, context.request);
      mappedError = isHttpError(interceptedError)
        ? interceptedError
        : mapAxiosError(new Error('HTTP error interceptor returned an invalid value.'));
    } catch (interceptorError) {
      mappedError = mapAxiosError(interceptorError);
    }
  }

  return mappedError;
}

const dispatchRequestInterceptors = async (
  config: InternalAxiosRequestConfig,
): Promise<InternalAxiosRequestConfig> => {
  const routedConfig = config as RoutedInternalAxiosRequestConfig;
  const context = getRequestContext(config);

  if (!context) {
    throw new HttpError('HTTP request is missing its client route.', {
      code: 'MISSING_HTTP_ROUTE',
      kind: 'internal',
    });
  }

  let request = context.request;

  try {
    for (const interceptor of context.route.interceptors) {
      request = interceptor.onRequest ? await interceptor.onRequest(request) : request;
    }

    assertValidRequest(request);

    routedConfig[HTTP_REQUEST] = request;
    config.baseURL = context.route.baseUrl;
    config.data = request.body;
    config.headers = AxiosHeaders.from(request.headers);
    config.method = request.method;
    config.params = request.query;
    config.signal = request.signal;
    config.timeout = request.timeoutMs ?? context.route.timeoutMs;
    config.url = request.path;
    return config;
  } catch (error) {
    throw await dispatchError(error, { request, route: context.route });
  }
};

const dispatchResponseInterceptors = async (response: AxiosResponse): Promise<AxiosResponse> => {
  const context = getRequestContext(response.config);

  if (!context) {
    throw await dispatchError(
      new HttpError('HTTP response is missing its client route.', {
        code: 'MISSING_HTTP_ROUTE',
        kind: 'internal',
      }),
    );
  }

  let httpResponse: HttpResponse<unknown> = {
    data: response.data,
    headers: toHttpHeaders(response.headers),
    status: response.status,
  };

  try {
    for (const interceptor of context.route.interceptors) {
      httpResponse = interceptor.onResponse
        ? await interceptor.onResponse(httpResponse, context.request)
        : httpResponse;
      assertValidResponse(httpResponse);
    }
  } catch (error) {
    throw await dispatchError(error, context);
  }

  response.data = httpResponse.data;
  response.headers = AxiosHeaders.from(httpResponse.headers);
  response.status = httpResponse.status;
  return response;
};

const dispatchRejectedResponse = async (error: unknown): Promise<never> => {
  const config =
    typeof error === 'object' && error !== null && 'config' in error
      ? (error.config as AxiosRequestConfig | undefined)
      : undefined;
  throw await dispatchError(error, getRequestContext(config));
};

function createAxiosTransport(adapter?: AxiosAdapter): AxiosInstance {
  const transport = createAxiosInstance({
    adapter: adapter ?? 'fetch',
    allowAbsoluteUrls: false,
    env: {
      fetch: expoFetch as unknown as AxiosFetch,
    },
    timeout: DEFAULT_TIMEOUT_MS,
  });

  transport.interceptors.request.use(dispatchRequestInterceptors);
  transport.interceptors.response.use(dispatchResponseInterceptors, dispatchRejectedResponse);
  return transport;
}

const sharedAxiosTransport = createAxiosTransport();

function createHttpClientWithTransport(
  options: CreateHttpClientOptions,
  transport: AxiosInstance,
): HttpClient {
  assertValidBaseUrl(options.baseUrl);

  const route: HttpRoute = Object.freeze({
    baseUrl: options.baseUrl,
    errorDecoder: options.errorDecoder,
    headers: Object.freeze({ ...options.headers }),
    interceptors: Object.freeze([...(options.interceptors ?? [])]),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  return Object.freeze({
    async request<TResponse, TBody = unknown>(
      request: HttpRequest<TBody>,
    ): Promise<HttpResponse<TResponse>> {
      const routedRequest: HttpRequest<unknown> = {
        ...request,
        headers: mergeHeaders(route.headers, request.headers),
      };
      assertValidRequest(routedRequest);

      try {
        const response = await transport.request<TResponse>({
          [HTTP_REQUEST]: routedRequest,
          [HTTP_ROUTE]: route,
          baseURL: route.baseUrl,
          data: routedRequest.body,
          headers: routedRequest.headers,
          method: routedRequest.method,
          params: routedRequest.query,
          signal: routedRequest.signal,
          timeout: routedRequest.timeoutMs ?? route.timeoutMs,
          url: routedRequest.path,
        } as RoutedAxiosRequestConfig);

        return Object.freeze({
          data: response.data,
          headers: toHttpHeaders(response.headers),
          status: response.status,
        });
      } catch (error) {
        throw mapAxiosError(error, routedRequest.errorDecoder ?? route.errorDecoder);
      }
    },
  });
}

export function createHttpClient(options: CreateHttpClientOptions): HttpClient {
  return createHttpClientWithTransport(options, sharedAxiosTransport);
}

export const __testing = {
  createHttpClientFactoryWithAdapter(adapter: AxiosAdapter) {
    const transport = createAxiosTransport(adapter);
    return (options: CreateHttpClientOptions): HttpClient =>
      createHttpClientWithTransport(options, transport);
  },
};
