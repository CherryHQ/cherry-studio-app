# Local Network HTTP Client

This directory owns the small request/response transport boundary for HTTP(S) JSON endpoints on
the local network. It is separate from `src/backend/data`, which remains the in-process persistence
path to SQLite.

## Contract

- `createHttpClient()` creates one isolated Axios-backed client for one selected endpoint. Callers
  pass a validated base URL, and every request uses a relative path so it cannot redirect instance
  headers to another host.
- Instance headers are static defaults. Request-specific headers, including any future pairing
  credential required by a concrete protocol, are passed explicitly by that protocol's domain
  client.
- Requests have no interceptor-driven behavior: there is no implicit authentication, `401`
  refresh, replay, retry, navigation, or UI feedback.
- Cancellation, timeout, network, HTTP status, unreadable response, and invalid client input leave
  the module as `HttpError`. Raw Axios errors, request configs, headers, and response bodies do not
  cross the public boundary.
- The foundation returns response data without interpreting it. A concrete local-network domain
  client owns paths, request and response schemas, and validation.

## Transport decision

Axios is intentionally limited to ordinary local-network HTTP(S) request/response traffic. An
isolated instance provides a base URL, default timeout, `AbortSignal` cancellation, consistent
errors, and an injectable test adapter without requiring interceptors. Those capabilities remain
behind `HttpClient`, so a future transport change does not affect domain clients.

Device discovery such as mDNS or UDP, raw TCP, WebSocket, SSE, and `ReadableStream` traffic do not
use this client. Platform local-network permissions, cleartext HTTP policy, and certificate trust
also remain with the native application configuration rather than this transport wrapper.

## Example

The concrete endpoint and schema remain with their domain owner:

```ts
import { z } from 'zod';

import { createHttpClient, type HttpClient } from '@/backend/services/http';

const DeviceStatusSchema = z.object({
  connected: z.boolean(),
  version: z.string(),
});

type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

export function createLocalDeviceClient(http: HttpClient) {
  return {
    async getStatus(signal?: AbortSignal): Promise<DeviceStatus> {
      const payload = await http.request<unknown>({
        method: 'GET',
        path: '/api/status',
        signal,
      });

      return DeviceStatusSchema.parse(payload);
    },
  };
}

const localHttp = createHttpClient({
  baseUrl: selectedDeviceBaseUrl,
  headers: { 'X-Client-Version': appVersion },
});
```

Do not use this client for local SQLite entities or as a global replacement for runtime fetch.
