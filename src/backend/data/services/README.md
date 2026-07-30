# Backend Persistence Services

Mobile DB services migrated from the desktop `src/main/data/services` directory.

## Scope

- Keep service names, method names, ordering semantics, and service comments aligned with desktop
  unless mobile has a documented runtime compatibility reason to diverge.
- Mobile services receive the Provider-owned `DbService` through the constructor instead of using
  the desktop `application.get('DbService')` singleton.
- Desktop logger calls are omitted here unless mobile has an equivalent logging service.
- Full agent-session, knowledge, job, translate, miniapp, and agent-workspace services are not
  migrated yet. MCP, file, and painting persistence services are implemented on mobile. Assistant
  relation ids may exist before their corresponding deferred domains are implemented.

## Runtime

Services that are part of the mobile data layer are instantiated by
`src/bootstrap/createBackendServices.ts`. That concrete graph is private to bootstrap;
`src/bootstrap/createMobileBackend.ts` exposes only implementations of contracts from
`src/shared/contracts` to frontend callers.
