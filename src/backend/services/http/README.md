# External Service HTTP Transport

This directory owns non-streaming HTTP(S) request/response infrastructure for external services.
It supports future cloud account and remote Agent control-plane clients as well as desktop LAN
pairing and configuration import.

## Contract

- Domain code depends on the app-owned `HttpClient`, `HttpRequest`, `HttpResponse`,
  `HttpInterceptor`, and `HttpError` contracts. Axios types and errors are not exported from the
  module boundary.
- `createHttpClient()` binds one immutable route to one backend service or security domain. The
  route owns its base URL, default headers, timeout, error decoder, and interceptor chain.
- All clients use one module-private Axios transport configured with the fetch adapter and
  `expo/fetch`. Every request carries its client route internally, so the global dispatcher runs
  only that route's interceptors.
- A request cannot supply or replace its base URL. Paths must begin with one `/`, which prevents an
  absolute URL from redirecting credentials to another authority.
- Responses expose app-owned `data`, `status`, and lowercase `headers`. Cancellation, timeout,
  network, HTTP status, unreadable response, and invalid input leave the module as `HttpError`.
  Raw Axios errors, configs, credentials, and unvalidated response bodies do not cross the public
  boundary.
- Neither the transport nor its interceptors retry or replay by default. In particular, a `401`
  remains one failed request unless a domain explicitly owns a safe refresh-and-retry policy.

The routing model is:

```text
Cloud domain client ── cloud HttpClient route ─┐
Desktop LAN client ─ desktop HttpClient route ─┼─ shared Axios transport ─ expo/fetch
Other service client ─ other HttpClient route ─┘
```

The shared transport is not a shared credential store. Static and interceptor-added headers are
materialized on each request from its own route. Cloud authentication interceptors therefore do
not run for desktop LAN requests, and desktop device credentials do not become cloud defaults.

## Interceptors

Interceptors use the app-owned contract and are installed when a client is created. The global
dispatcher executes that client's interceptors in declaration order for request, response, and
safe mapped error handling.

```ts
import { createHttpClient, type HttpInterceptor } from '@/backend/services/http';

const cloudAuthInterceptor: HttpInterceptor = {
  async onRequest(request) {
    const token = await getAccessToken();
    return {
      ...request,
      headers: { ...request.headers, Authorization: `Bearer ${token}` },
    };
  },
};

const cloudHttp = createHttpClient({
  baseUrl: CLOUD_API_BASE_URL,
  interceptors: [cloudAuthInterceptor],
});

const desktopLanHttp = createHttpClient({
  baseUrl: selectedDesktopBaseUrl,
  headers: { 'X-Device-Token': selectedDeviceToken },
});
```

Create separate `HttpClient` values for separate authority boundaries even though the Axios
transport underneath is shared. Domain callers never select an interceptor name or transport
route on individual requests; using the correct client selects the route.

## Error boundary

An optional decoder receives only the error response's `status`, lowercase `headers`, and unknown
`data`. After schema validation, it may return a safe message, code, request id, retry hint, and
explicitly desensitized details. If decoding fails, the transport falls back to generic metadata.

```ts
import { z } from 'zod';

import { createHttpClient } from '@/backend/services/http';

const CloudErrorSchema = z.object({
  code: z.string(),
});

const cloudHttp = createHttpClient({
  baseUrl: CLOUD_API_BASE_URL,
});

async function getAccount(signal?: AbortSignal) {
  const response = await cloudHttp.request<unknown>({
    errorDecoder: ({ data, headers }) => {
      const parsed = CloudErrorSchema.parse(data);
      return {
        code: parsed.code,
        message: 'Account request failed.',
        requestId: headers['x-request-id'],
      };
    },
    method: 'GET',
    path: '/account',
    signal,
  });

  return AccountSchema.parse(response.data);
}
```

The decoder must not copy unknown response values, tokens, cookies, or other secrets into the
public error. `HttpError` safely expresses `kind`, `status`, `code`, `requestId`, `retryAfter`,
`message`, and app-owned `details`.

## Boundaries

- Local SQLite Data API access remains an in-process interface under `src/backend/data`; it does
  not use this client.
- TanStack Query remains the frontend owner of asynchronous state, caching, invalidation, and query
  retry. This transport does not recreate that layer or add a second retry policy.
- AI providers, Pi, MCP, and remote Agent SSE, NDJSON, WebSocket, or `ReadableStream` data-plane
  traffic continue to use `expo/fetch` or a specialized streaming client.
- Device discovery such as mDNS or UDP, raw TCP, platform local-network permissions, cleartext HTTP
  policy, and certificate trust remain outside this module.
