# Shared Data API

Platform-neutral endpoint schemas, `ApiClient`, pagination types, and data errors live here. These
modules describe resource calls across the in-process frontend/backend seam; they do not implement
transport, persistence, React Query, or handlers. Mobile deliberately reuses Cherry Desktop's Data
API vocabulary without adding IPC, HTTP, or serialization.
