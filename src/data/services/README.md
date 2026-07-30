# Data Services

Mobile DB services migrated from the desktop `src/main/data/services` directory.

## Scope

- Keep service names, method names, ordering semantics, and service comments aligned with desktop
  unless mobile has a documented runtime compatibility reason to diverge.
- Mobile services receive the Provider-owned `DbService` through the constructor instead of using
  the desktop `application.get('DbService')` singleton.
- Desktop logger calls are omitted here unless mobile has an equivalent logging service.
- Full agent, MCP, knowledge, job, translate, miniapp, file, and agent workspace services are not
  migrated yet. Assistant relation ids may exist before those full domains are implemented.

## Runtime

Services that are part of the mobile data layer are instantiated by
`src/runtime/createDataServices.ts` (the app composition root) and exposed through
`useDataServices()` from `@/runtime`.
