# Data API

Mobile-owned endpoint schemas, `ApiClient`, pagination types, and data errors. These modules
describe resource calls across the in-process frontend/backend seam; they do not implement
transport, persistence, React Query, or handlers, and they add no IPC, HTTP, or serialization.
Endpoints exist only while a mobile consumer reads them — an endpoint family with no caller is
deleted, not kept for desktop parity.

Read calls accept an optional `AbortSignal` in their options. It stays outside query schemas and is
passed directly to handlers. Search checks it between native asynchronous reads and before
processing candidates; cancelling a call does not interrupt a statement on the shared connection.
