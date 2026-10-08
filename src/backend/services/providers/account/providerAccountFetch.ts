import { createHttpClient, HttpError, type HttpClient } from '@/backend/services/http';

const MAX_ACCOUNT_RESPONSE_BYTES = 1_048_576;

function requireAccountEndpoint(input: Parameters<typeof globalThis.fetch>[0]): URL {
  try {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol === 'https:' && !url.username && !url.password && !url.hash) return url;
  } catch {
    // Invalid destinations never enter either the Request constructor or the HTTP transport.
  }
  throw new HttpError('Provider account endpoint is invalid.', {
    code: 'INVALID_ACCOUNT_ENDPOINT',
    kind: 'internal',
  });
}

/** Fetch-shaped bridge for non-streaming account protocols; routes never own account credentials. */
export function createProviderAccountFetch(): typeof globalThis.fetch {
  const clients = new Map<string, HttpClient>();

  return async (input, init) => {
    const url = requireAccountEndpoint(input);
    // Pi sends text/JSON or URL-encoded bodies. Serialize forms explicitly for native Request.
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
      throw new HttpError('Provider account request method is unsupported.', {
        code: 'INVALID_ACCOUNT_METHOD',
        kind: 'internal',
      });
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
    const options = {
      headers,
      path: url.pathname,
      query,
      redirect: 'error' as const,
      responseType: 'text' as const,
      maxResponseBytes: MAX_ACCOUNT_RESPONSE_BYTES,
      signal: request.signal,
    };
    const result = await client.request<string>(
      request.method === 'GET'
        ? { ...options, method: 'GET' }
        : { ...options, method: 'POST', body: await request.text() },
    );
    request.signal?.throwIfAborted();
    // Non-2xx OAuth bodies (pending, slow_down, rate limits) belong to the upstream protocol.
    return new Response([204, 205, 304].includes(result.status) ? null : result.data, {
      status: result.status,
      headers: result.headers,
    });
  };
}
