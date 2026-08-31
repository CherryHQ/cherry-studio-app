# External Service HTTP Transport

This directory owns the non-streaming HTTP(S) request/response infrastructure for external
services. It is the shared Axios foundation for future cloud account and remote Agent control-plane
clients as well as desktop LAN pairing and configuration import.

## Contract

- `createAxiosClient()` returns a new `AxiosInstance` for one backend service or security domain.
  It never creates or reuses a global singleton.
- The factory requires an HTTP(S) `baseURL`, rejects absolute request URLs and per-request base URL
  overrides, applies a default timeout, and explicitly routes Axios's fetch adapter through
  `expo/fetch`.
- The returned instance retains native Axios request configuration, complete `AxiosResponse`
  values, `AbortSignal` cancellation, defaults, and request/response interceptors. A domain can
  install and eject its own interceptors with the normal Axios API.
- Axios transport does not retry or replay requests. In particular, a `401` is not replayed unless
  a future cloud authentication owner explicitly installs that behavior. Non-idempotent mutations
  must not be replayed by default.
- The Axios instance stays private to a backend domain client such as `AccountApiClient`,
  `RemoteAgentApiClient`, or `DesktopImportClient`. UI and feature callers depend on those domain
  interfaces, not on Axios.

Create a separate instance for each authority boundary:

```ts
const cloudApi = createAxiosClient({
  baseURL: CLOUD_API_BASE_URL,
});

const desktopLanApi = createAxiosClient({
  baseURL: selectedDesktopBaseUrl,
  headers: { 'X-Device-Token': selectedDeviceToken },
});
```

The cloud domain owns validation that its fixed configured URL uses HTTPS and may later install
user-token and single-flight refresh interceptors. The desktop LAN domain creates or replaces its
own instance when the selected endpoint changes; it must not share user authentication defaults or
refresh interceptors with the cloud instance.

## Error boundary

Axios errors are useful inside a trusted domain because they contain the response status, headers,
and body, but they also retain request configuration and potentially secret-bearing headers.
Domain clients catch Axios rejections before returning to UI or shared callers and use
`mapAxiosError()` to produce an app-owned `HttpError`.

An optional decoder receives only the error response's `status`, `headers`, and unknown `data`.
After schema validation, it may return a safe message, code, request id, retry hint, and explicitly
desensitized details. `mapAxiosError()` never retains the original `AxiosError`, request config, or
unvalidated response body. If decoding fails, it falls back to generic transport information.

```ts
import { z } from 'zod';

import { createAxiosClient, mapAxiosError } from '@/backend/services/http';

const CloudErrorSchema = z.object({
  code: z.string(),
});

async function getAccount(signal?: AbortSignal) {
  try {
    const response = await cloudApi.get<unknown>('/account', { signal });
    return AccountSchema.parse(response.data);
  } catch (error) {
    throw mapAxiosError(error, ({ data, headers }) => {
      const parsed = CloudErrorSchema.parse(data);
      const requestId = headers.get('x-request-id');
      return {
        code: parsed.code,
        message: 'Account request failed.',
        ...(typeof requestId === 'string' ? { requestId } : {}),
      };
    });
  }
}
```

The domain decoder must not copy unknown response values, tokens, cookies, or other secrets into
the public error. `HttpError` can safely express `kind`, `status`, `code`, `requestId`, `retryAfter`,
`message`, and app-owned `details`.

## Boundaries

- Local SQLite Data API access remains an in-process interface under `src/backend/data`; it does
  not use Axios.
- TanStack Query remains the frontend owner of asynchronous state, caching, invalidation, and query
  retry. This transport does not recreate that layer or add a second retry policy.
- AI providers, Pi, MCP, and remote Agent SSE, NDJSON, WebSocket, or `ReadableStream` data-plane
  traffic continue to use `expo/fetch` or a specialized streaming client.
- Device discovery such as mDNS or UDP, raw TCP, platform local-network permissions, cleartext HTTP
  policy, and certificate trust remain outside this module.
