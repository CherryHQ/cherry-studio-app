# Data Layer

This reference defines local data ownership across the in-process frontend/backend boundary. Terms
follow [Domain Language](../domain-language.md).

## Runtime Paths

Resource data follows the same public vocabulary as Cherry Desktop:

`frontend owner -> useQuery/useMutation/useInfiniteQuery -> ApiClient -> DataApiService -> endpoint handler -> backend implementation`

Preferences remain a separate channel:

`usePreference/useMultiplePreferences -> PreferenceClient -> PreferenceService -> SQLite`

Multi-step workflows, app-owned runtime projections, and caller-owned sessions use a narrower path:

`frontend owner -> useBackendModule() -> XxxModule contract -> backend runtime/module/session`

The composition path is:

`AppBootstrapProvider -> createAppBootstrapRuntime() -> BackendServices + createBackend() + DataApiService`

`BackendServices` is a private bootstrap implementation graph. It is not placed in React context and
is not importable by frontend code. Bootstrap injects one stable `Backend`, `ApiClient`, and
`PreferenceClient` into separate frontend providers.

## Frontend Data

`src/frontend/data` follows the Cherry Desktop renderer-data vocabulary while remaining mobile-owned.
It contains:

- `DataApiProvider` and typed endpoint hooks: `useQuery`, `useMutation`, and `useInfiniteQuery`.
- `PreferenceProvider`, `usePreference`, and `useMultiplePreferences`.
- `BackendProvider` and `useBackendModule(key)` for workflows only.
- `QueryProvider` and endpoint-specific files under the `queryKeys` registry.
- The frontend `CacheService.ts` and cache hooks; its MMKV adapter is private to the service, while
  pure cache schemas live in `@/shared/data/cache`.

Feature and cross-feature hooks own resource-specific queries and call endpoint paths through the
typed Data API hooks. `frontend/data/queryKeys` supplies one cache-key file per endpoint family
without becoming a second service catalog. There is no generic module selector that exposes a
concrete service graph. Frontend tests inject an `ApiClient`, `PreferenceClient`, or workflow
`Backend` fake through the corresponding real provider.

## Shared Data

`src/shared/data` (`@/shared/data`) contains values both sides may know. It is mobile-owned and
independent of Cherry Desktop — schemas, fields, and routes exist only while mobile code reads
them. The entity types that `packages/ai-runtime` still imports remain temporarily under
`@cherrystudio/universal/data/types` (see that package's `src/data/README.md` ledger):

- `api`: endpoint DTO schemas, pagination shapes, data errors, and `ApiClient`.
- `preference`: preference keys, value schemas, defaults, pure helpers, and `PreferenceClient`.
- `types`: entities and value types such as Agent, Agent Session, Provider, Model, Painting, and
  presentation message parts.
- `presets`: shared catalog data.
- `cache`: cache schemas, shared cache types, and pure template/equality helpers.

Database tables, Drizzle row types, and migrations are not shared contracts. They remain under
`src/backend/data/db`; managed-file persistence lives with the backend data services, while the
frontend and backend cache adapters stay with their respective data owners.

## Backend Data

`src/backend/data` is the mobile counterpart of Cherry Desktop's `src/main/data`:

- `CacheService.ts` owns backend memory and loseable persisted cache state.
- `PreferenceService.ts` owns cached access to SQLite-backed preferences.
- `db` owns the connection, schemas, migrations, custom SQL, and seeders.
- `services` owns entity persistence and data-specific transformations.
- `fixtures` owns development data consumed by seeders and tests.

The backend `CacheService` corresponds to Desktop Main's cache, while
`src/frontend/data/CacheService.ts` corresponds to Desktop renderer data. The backend keeps the
Main-owned memory and persist semantics and currently stores ProviderService's API-key rotation
cursor. It omits Electron-only IPC, shared-window relay, and BrowserWindow synchronization. The
backend persist tier uses its own `cherry-backend-cache-persist` MMKV store and is not readable
through the frontend cache API.

Both caches use schemas and pure cache helpers from `@/shared/data/cache`, but their concrete
classes, adapters, values, subscriptions, and lifecycles remain independent. Domain-specific
caches, such as MCP tool snapshots, may remain private to the owning backend module when a generic
cache would weaken that module's invariants.

## Data API And Workflow Contracts

`src/backend/data/api/handlers` maps endpoint families from `@/shared/data/api` to persistence or
workflow implementations. `DataApiService` performs typed in-process route dispatch and satisfies
`ApiClient`; it adds no IPC, HTTP, or serialization.

File entry reads remain SQL-only Data API operations. Managed-file import, Expo URI resolution, and
user-triggered deletion use the mobile `FileModule` through `BackendProvider`, which is the platform
adaptation of Cherry Desktop's filesystem-backed File IPC boundary. [File Model](file-model.md) has
the ownership and lifecycle rules those operations follow.

`src/shared/contracts/backend.ts` aggregates workflow-only modules. Multi-step behavior belongs in
its owning backend domain, including:

- the app-owned Mobile Agent Host under `src/backend/ai`;
- painting receipt creation and durable job orchestration;
- provider/model pull, reconcile, health, and avatar workflows;
- MCP runtime coordination;
- permission policy and profile avatar workflows.

Workflow module factories and runtimes receive narrow coordinated dependencies instead of importing
the concrete graph. Bootstrap supplies production implementations. Platform adapters and external
clients may use their concrete SDK dependencies when those dependencies are part of the boundary.

Painting and Provider Data API handlers call the desktop-aligned `PaintingService` and
`ProviderService` directly; their workflow modules do not repeat CRUD. Model CRUD and the
`models:reconcile` endpoint remain Data API concerns. MCP mutations use the same module object through
a private mutation interface so persistence changes still warm or invalidate runtime state.

## Database

`DbService` owns the Expo SQLite database `cherry.db` and Drizzle's Expo adapter. Startup:

- configures WAL, `synchronous=NORMAL`, and foreign keys;
- runs bundled migrations from `src/backend/data/db/migrations.ts`;
- runs idempotent custom FTS SQL from `src/backend/data/db/customSql.ts`;
- runs versioned seeders through `SeedRunner`.

Expo cannot read a migration directory at runtime, so SQL and the journal are bundled in
`migrations.ts`. Writes go through `DbService.withWriteTx()`, which serializes `BEGIN IMMEDIATE`
transactions on the long-lived connection.

See [Storage Engine](./storage-engine.md) for the current engine constraints and migration criteria.

## Schema And Message Persistence

The active schema includes app state/preferences, Agent and Agent Session data, provider/model,
MCP, file, painting, job, and AI usage tables. Agent Session messages are linear and use stable
protocol message ids. The retired `assistant`, `topic`, `message`, and `assistant_mcp_server`
tables, plus message FTS triggers and indexes, are removed by migration `0005_remove_legacy_chat`.

`MobileAgentHost` persists Agent Session reservations and terminal messages through
`AgentSessionStore`; `/agent-sessions/:sessionId/messages` exposes newest-first cursor pagination to
the frontend. Live deltas are protocol events and do not write every token to SQLite.

## Service Graph

`createBackendServices()` exposes concrete backend classes such as `MobileAgentHost`, `CacheService`,
`PreferenceService`, `ProviderService`, `McpRuntimeService`, `WebSearchService`, and `AiService`.
The graph is private to bootstrap. `createBackend()` builds the
factory-shaped workflow modules and returns the workflow-only `Backend` plus the MCP mutation
coordinator needed by Data API handlers.
`createAppBootstrapRuntime()` wires those handlers into `DataApiService` and exposes
`PreferenceService` only through the `PreferenceClient` interface. The concrete graph and caches are
never exposed to frontend code.

Lifecycle-owned services are declared once in `src/backend/core/application/serviceRegistry.ts` and
instantiated per `ApplicationHost` generation; `MobileAgentHost` is among them, and
`createBackend()` exposes the instances rather than constructing them. See
[Lifecycle](../lifecycle/README.md).

There is no IPC handler layer or frontend DI container for these concrete classes. Mobile does have
an application singleton and a lifecycle service registry — they are backend-private, and frontend
code reaches this graph only through `Backend`, `ApiClient`, and `PreferenceClient`.

## Seeding And Compatibility

Seeders apply default preferences, a small recommended provider set on fresh installs, and the
managed CherryAI default model. Later catalog versions refresh only preset providers already present
in `user_provider`; they do not install the entire catalog into an existing database, including one
whose providers were all removed by the user. The complete trusted provider catalog remains
bundle-owned and is imported explicitly through `ProvidersModule`. Seeders do not create Agents,
Sessions, or chat messages; first-run Agent creation remains user-driven. Seeder versions are
journaled under `app_state` keys prefixed with `seed:`.

`ProviderRegistryUpdaterService` checks only `models.json` and `provider-models.json` when the user
opens the Provider catalog. The screen reports an available update, but downloads and activates
the complete snapshot only after the user presses Update. China locale/zone signals prefer GitCode
and other devices prefer GitHub; either source falls back to the other. A schema-validated,
user-approved snapshot is committed to the lossy cache with its activation marker written last, and
mounted model projections are invalidated when it becomes active. `providers.json` never comes from
this unsigned channel, so API destinations, authentication modes, and the importable Provider catalog
remain bundle-owned. Offline, malformed, interrupted, or incompatible checks and updates keep using
the last valid matching approved cache, or the bundled registry when no such cache exists.

Mobile keeps shared entity and service semantics aligned with Cherry Desktop where practical, but it
does not share the physical SQLite file or Drizzle migration timeline. Breaking schema changes may
still reset development data; no legacy migration bridge is required before release.

## Startup Gate

`AppBootstrapGate` initializes the backend cache before database seeding, then waits for database
initialization, preference initialization, boot theme, and i18n only. The root route keeps the
native splash visible until initialization settles.
The bootstrap runtime's `runPostReadyTasks()` starts the host PostReady phase after the gate opens;
Agent reconciliation, MCP initialization, jobs, and other host-owned work remain off first paint.
