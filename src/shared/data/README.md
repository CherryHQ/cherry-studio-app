# Shared Data

Data entities, preferences, DTO schemas, pagination shapes, and data errors shared by the mobile
frontend and backend. The layout follows Cherry Desktop's `src/shared/data` vocabulary.

## Scope

- Keep entity schemas, limits, comments, and exported type names aligned with desktop unless mobile
  has a documented runtime compatibility reason to diverge.
- API-shaped DTO schemas, pagination shapes, and data errors live under `src/shared/data/api`.
- DB-backed preference value types and defaults live under `src/shared/data/preference`.
- Entity and value types live under `src/shared/data/types`.
- Excluded desktop domains are not migrated here yet: agent sessions, knowledge, jobs, translate,
  miniapps, and agent workspaces. MCP, file, and painting types are present because their mobile
  domains are implemented.
