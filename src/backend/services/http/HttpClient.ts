import type { HttpError, HttpErrorDetails } from './HttpError';

export type HttpBodylessMethod = 'DELETE' | 'GET';

export type HttpBodyMethod = 'PATCH' | 'POST' | 'PUT';

export type HttpMethod = HttpBodylessMethod | HttpBodyMethod;

export type HttpResponseType = 'json' | 'text';

export type HttpHeaders = Readonly<Record<string, string>>;

type HttpQueryPrimitive = boolean | number | string;

export type HttpQueryValue = HttpQueryPrimitive | null | undefined | readonly HttpQueryPrimitive[];

/** Arrays serialize as repeated keys (`tag=a&tag=b`); `null` and `undefined` values are omitted. */
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

interface HttpRequestBase {
  readonly errorDecoder?: HttpErrorDecoder;
  readonly headers?: HttpHeaders;
  /** Positive response-size limit in bytes. Omit when the domain has no explicit cap. */
  readonly maxResponseBytes?: number;
  /** Relative API path beginning with `/`. Absolute URLs are rejected. */
  readonly path: string;
  readonly query?: HttpQuery;
  /** Omit for the default JSON-compatible Axios response handling. */
  readonly responseType?: HttpResponseType;
  readonly signal?: AbortSignal;
  /** Positive request timeout in milliseconds. Omit to use the client default. */
  readonly timeoutMs?: number;
}

/** `GET` and `DELETE` requests carry no body, matching REST semantics and the fetch transport. */
export type HttpRequest<TBody = unknown> =
  | (HttpRequestBase & { readonly body?: never; readonly method: HttpBodylessMethod })
  | (HttpRequestBase & { readonly body?: TBody; readonly method: HttpBodyMethod });

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
