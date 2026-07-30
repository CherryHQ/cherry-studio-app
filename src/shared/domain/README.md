# Shared Domain

Entities and value types shared by the mobile frontend and backend.

## Scope

- Keep entity schemas, limits, comments, and exported type names aligned with desktop unless mobile
  has a documented runtime compatibility reason to diverge.
- API-shaped DTO schemas, pagination shapes, and data errors live under `src/shared/contracts`.
- DB-backed preference value types and defaults live under `src/shared/domain/preferences`.
- Excluded desktop domains are not migrated here yet: agent, MCP, knowledge, job, translate,
  miniapp, file, and agent workspace types.
