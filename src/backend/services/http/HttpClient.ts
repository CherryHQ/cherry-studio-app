import type { HttpError, HttpErrorDetails } from './HttpError';

export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type HttpHeaders = Readonly<Record<string, string>>;

type HttpQueryPrimitive = boolean | number | string;

export type HttpQueryValue = HttpQueryPrimitive | null | undefined | readonly HttpQueryPrimitive[];

export type HttpQuery = Readonly<Record<string, HttpQueryValue>>;

export interface HttpErrorResponse {
  readonly data: unknown;
  readonly headers: HttpHeaders;
  readonly status: number;
}

export interface DecodedHttpError {
  readonly code?: string;
  readonly details?: HttpErrorDetails;
  readonly message: string;
  readonly requestId?: string;
  readonly retryAfter?: string;
}

export type HttpErrorDecoder = (response: HttpErrorResponse) => DecodedHttpError | undefined;

export interface HttpRequest<TBody = unknown> {
  readonly body?: TBody;
  readonly errorDecoder?: HttpErrorDecoder;
  readonly headers?: HttpHeaders;
  readonly method: HttpMethod;
  /** Relative API path beginning with `/`. Absolute URLs are rejected. */
  readonly path: string;
  readonly query?: HttpQuery;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface HttpResponse<TData = unknown> {
  readonly data: TData;
  /** Lowercase response header names mapped to string values. */
  readonly headers: HttpHeaders;
  readonly status: number;
}

type MaybePromise<T> = Promise<T> | T;

/**
 * App-owned interceptor contract. Interceptors are scoped to the client that
 * installs them and never receive Axios request, response, or error objects.
 */
export interface HttpInterceptor {
  onError?(error: HttpError, request: HttpRequest<unknown>): MaybePromise<HttpError>;
  onRequest?(request: HttpRequest<unknown>): MaybePromise<HttpRequest<unknown>>;
  onResponse?(
    response: HttpResponse<unknown>,
    request: HttpRequest<unknown>,
  ): MaybePromise<HttpResponse<unknown>>;
}

export interface HttpClient {
  request<TResponse, TBody = unknown>(
    request: HttpRequest<TBody>,
  ): Promise<HttpResponse<TResponse>>;
}
