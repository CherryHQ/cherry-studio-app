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

## Mobile Search Reads

Session listing and content search use `db/readSqliteRows.ts` to execute bound SQL through Expo's
native async reader. The regular Drizzle Expo driver is synchronous even when its result is
awaited. Cancellation is cooperative: the current native statement may finish, but its result is
discarded and no subsequent candidate batch is issued.

Content search uses trigram LIKE candidates only for terms with at least three characters and no
SQL wildcard characters. Other terms are matched literally within chronological batches, backed
by the mobile `agent_session_message_created_id_idx` index. Each read returns at most 200 candidates;
short/literal-wildcard searches inspect at most 500 candidates per page, indexed searches 5,000.
Reaching that budget returns the last scanned position even if there are no matches. Only an
exhausted source drops its continuation. Batches advance by `(created_at, id)`, without OFFSET.

Visible-text filtering preserves fenced and inline code. Snippets collapse lines and include the
earliest keyword instead of starting with a separate context-only or ellipsis line.
