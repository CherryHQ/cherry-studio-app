import type { FetchLike } from '@modelcontextprotocol/client';

import { createHttpClient, type HttpClient } from '@/backend/services/http';
import { McpAuthorizationError } from '@/shared/contracts/mcp';

export function assertMcpOAuthUrl(value: string | URL): URL {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new McpAuthorizationError('configuration');
  }
  return url;
}

/** Adapt SDK metadata/form requests to the shared non-streaming HTTP transport. */
export function createMcpOAuthFetch(): FetchLike {
  const clients = new Map<string, HttpClient>();

  return async (input, init) => {
    const url = assertMcpOAuthUrl(input instanceof Request ? input.url : String(input));
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
    if (request.method !== 'GET' && request.method !== 'POST')
      throw new McpAuthorizationError('configuration');
    request.signal.throwIfAborted();

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
      maxResponseBytes: 512 * 1024,
      timeoutMs: 30_000,
      signal: request.signal,
    };
    const response = await client.request<string>(
      request.method === 'GET'
        ? { ...options, method: 'GET' }
        : { ...options, method: 'POST', body: await request.text() },
    );
    request.signal.throwIfAborted();
    // OAuth status codes and error bodies belong to the SDK, without automatic retries.
    return new Response([204, 205, 304].includes(response.status) ? null : response.data, {
      status: response.status,
      headers: response.headers,
    });
  };
}
