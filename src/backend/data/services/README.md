# Backend Data Services

Mobile data services migrated from the desktop `src/main/data/services` directory.

## Scope

- Keep service names, method names, ordering semantics, and service comments aligned with desktop
  unless mobile has a documented runtime compatibility reason to diverge.
- Mobile services receive the bootstrap-owned `DbService` through the constructor instead of using
  the desktop `application.get('DbService')` singleton.
- Desktop logger calls are omitted here unless mobile has an equivalent logging service.
- Keep the complete desktop business-service surface, including Agent, Knowledge, job, translate,
  mini-app, MCP, file, and painting persistence, even when mobile has no corresponding UI or
  execution runtime.

## Runtime

Services that are part of the mobile data layer are instantiated by
`src/bootstrap/composition/createDataServices.ts` and assembled by `createBackendServices.ts`.
That concrete graph is private to bootstrap; resource operations are exposed directly through
handlers in `src/backend/data/api`, while `src/bootstrap/composition/createBackend.ts` exposes only
orchestration that qualifies for a frontend-visible `XxxModule` in `src/shared/contracts`.
