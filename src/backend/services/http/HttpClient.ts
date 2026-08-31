export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type HttpHeaders = Readonly<Record<string, string>>;

type HttpQueryPrimitive = boolean | number | string;

export type HttpQueryValue = HttpQueryPrimitive | null | undefined | readonly HttpQueryPrimitive[];

export type HttpQuery = Readonly<Record<string, HttpQueryValue>>;

export interface HttpRequest<TBody = unknown> {
  method: HttpMethod;
  /** Relative API path beginning with `/`. Absolute URLs are rejected. */
  path: string;
  body?: TBody;
  headers?: HttpHeaders;
  query?: HttpQuery;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface HttpClient {
  request<TResponse, TBody = unknown>(request: HttpRequest<TBody>): Promise<TResponse>;
}
