# Vertex authentication

`VertexAuthClient` is the public, lifecycle-owned service-account token client. It uses native
RS256 signing and the shared HTTP transport, with a memory-only cache per provider and credential
fingerprint. Concurrent callers share the exchange but retain independent cancellation. Stopping
the application or forgetting a provider cancels its pending work and prevents late cache writes.

Model listing and the pi-durable model resolver consume `getAccessToken`; each transport formats
its own authorization header. Shared field validation lives in `src/shared/utils/vertexAuth.ts`.
The client never owns conversation state, provider persistence, model selection, or an API-key
fallback.
