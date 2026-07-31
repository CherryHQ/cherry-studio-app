# Shared Data

Data entities, preferences, DTO schemas, pagination shapes, and data errors shared by the mobile
frontend and backend. The layout follows Cherry Desktop's `src/shared/data` vocabulary.

## Scope

- Keep entity schemas, limits, comments, and exported type names aligned with desktop unless mobile
  has a documented runtime compatibility reason to diverge.
- API-shaped DTO schemas, pagination shapes, and data errors live under `src/shared/data/api`.
- `ApiClient` is the platform-neutral resource interface shared by frontend endpoint hooks and the
  backend in-process `DataApiService` implementation.
- DB-backed preference value types, defaults, and the separate `PreferenceClient` interface live
  under `src/shared/data/preference`.
- Cache schemas and pure cache-key helpers live under `src/shared/data/cache`; concrete cache
  implementations remain with their runtime owner.
- Entity and value types live under `src/shared/data/types`.
- Excluded desktop domains are not migrated here yet: agent sessions, knowledge, jobs, translate,
  miniapps, and agent workspaces. MCP, file, and painting types are present because their mobile
  domains are implemented.
