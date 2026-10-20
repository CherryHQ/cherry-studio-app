import { createHttpClient } from './createHttpClient';
import type { HttpClient } from './HttpClient';

export interface CreateFetchBridgeOptions {
  /** Validates a destination before it reaches the Request constructor or the transport. */
  assertUrl(url: string): URL;
  /** The domain error for methods other than GET and POST. */
  unsupportedMethodError(): Error;
  maxResponseBytes: number;
  timeoutMs?: number;
}

/**
 * Fetch-shaped bridge for non-streaming protocol SDKs over origin-scoped `statusPolicy: 'all'`
 * routes. Credentials stay on individual requests and never become route defaults.
 */
export function createFetchBridge(options: CreateFetchBridgeOptions): typeof globalThis.fetch {
  const clients = new Map<string, HttpClient>();

  return async (input, init) => {
    const url = options.assertUrl(input instanceof Request ? input.url : String(input));
    // SDKs send text/JSON or URL-encoded bodies. Serialize forms explicitly for native Request.
    const form = init?.body instanceof URLSearchParams ? init.body : undefined;
    const formHeaders = form
      ? new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      : undefined;
    if (formHeaders && !formHeaders.has('content-type')) {
      formHeaders.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
    }
    const request = new Request(input, {
      ...init,
      ...(form ? { body: form.toString(), headers: formHeaders } : {}),
    });
    if (request.method !== 'GET' && request.method !== 'POST') {
      throw options.unsupportedMethodError();
    }
    request.signal?.throwIfAborted();

    let client = clients.get(url.origin);
    if (!client) {
      client = createHttpClient({ baseUrl: url.origin, statusPolicy: 'all' });
      clients.set(url.origin, client);
    }
    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => {
      headers[name] = value;
    });
    const query: Record<string, string[]> = Object.create(null);
    for (const [name, value] of url.searchParams) (query[name] ??= []).push(value);
    const requestOptions = {
      headers,
      path: url.pathname,
      query,
      redirect: 'error' as const,
      responseType: 'text' as const,
      maxResponseBytes: options.maxResponseBytes,
      timeoutMs: options.timeoutMs,
      signal: request.signal,
    };
    const result = await client.request<string>(
      request.method === 'GET'
        ? { ...requestOptions, method: 'GET' }
        : { ...requestOptions, method: 'POST', body: await request.text() },
    );
    request.signal?.throwIfAborted();
    // Non-2xx OAuth bodies (pending, slow_down, invalid_grant, rate limits) belong to the SDK,
    // without automatic retries.
    return new Response([204, 205, 304].includes(result.status) ? null : result.data, {
      status: result.status,
      headers: result.headers,
    });
  };
}
