# Backend

`src/backend` contains the private in-process implementation behind Cherry Studio Mobile's Data
API, preference client, and workflow `Backend`. Mobile runs frontend and backend code in one Hermes
runtime; this boundary enforces ownership and dependency direction, not process or security
isolation.

## Areas

| Area | Ownership |
| --- | --- |
| [`data`](./data/README.md) | Desktop-aligned cache, preferences, SQLite, Data API handlers, and persistence services |
| [`ai`](./ai/README.md) | AI SDK/provider adaptation, MCP runtime, the Mobile Agent Host, and Pi Runtime tool projection |
| [`services`](./services/README.md) | Workflow module factories, mobile platform adapters and clients, avatars, and web search |

## Alignment And Naming

Direct Cherry Desktop counterparts keep their `Service` names, public methods, data contracts, and
behavior. This includes the whole data layer plus `DataApiService`, `AiService`,
`McpRuntimeService`, and `WebSearchService`.

Mobile-only workflow and lifecycle code is named by ownership: frontend-visible `XxxModule`,
app-owned `XxxRuntime`, caller-owned `XxxSession`, external `XxxClient`, platform `XxxAdapter` (or
an unambiguous capability noun), and homogeneous-instance `XxxManager`. `Impl` and parallel
`Backend`/`Service` forwarding layers are not used.

Only `src/bootstrap` constructs the concrete graph. Frontend resource CRUD uses the Data API,
preferences use `PreferenceClient`, and multi-step workflows use `BackendProvider` with
`useBackendModule()`; concrete backend objects never enter frontend state.

See [Architecture Overview](../../docs/references/architecture-overview.md),
[Code Organization](../../docs/references/code-organization.md),
[Runtime Ownership](../../docs/references/runtime-ownership.md), and
[Naming Conventions](../../docs/references/naming-conventions.md).
