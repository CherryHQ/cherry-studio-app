# Data Layer

This reference defines local data ownership across the in-process frontend/backend boundary. Terms
follow [Domain Language](../domain-language.md).

## Runtime Paths

Resource data follows the same public vocabulary as Cherry Desktop:

`frontend owner -> useQuery/useMutation/useInfiniteQuery -> ApiClient -> DataApiService -> endpoint handler -> backend implementation`

Preferences remain a separate channel:

`usePreference/useMultiplePreferences -> PreferenceClient -> PreferenceService -> SQLite`

Multi-step workflows and long-lived sessions use a narrower path:

`frontend owner -> useBackendModule() -> Backend workflow contract -> backend service/session`

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
  pure cache schemas live in `src/shared/data/cache`.

Feature and cross-feature hooks own resource-specific queries and call endpoint paths through the
typed Data API hooks. `frontend/data/queryKeys` supplies one cache-key file per endpoint family
without becoming a second service catalog. There is no generic module selector that exposes a
concrete service graph. Frontend tests inject an `ApiClient`, `PreferenceClient`, or workflow
`Backend` fake through the corresponding real provider.

## Shared Data

`src/shared/data` contains values both sides may know:

- `api`: endpoint DTO schemas, pagination shapes, data errors, and `ApiClient`.
- `preference`: preference keys, value schemas, defaults, pure helpers, and `PreferenceClient`.
- `types`: entities and value types such as Assistant, Topic, Message, Provider, and Model.
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

Both caches use schemas and pure cache helpers from `src/shared/data/cache`, but their concrete
classes, adapters, values, subscriptions, and lifecycles remain independent. Domain-specific
caches, such as MCP tool snapshots, may remain private to the owning backend module when a generic
cache would weaken that module's invariants.

## Data API And Workflow Contracts

`src/backend/data/api/handlers` maps endpoint families from `src/shared/data/api` to persistence or
workflow implementations. `DataApiService` performs typed in-process route dispatch and satisfies
`ApiClient`; it adds no IPC, HTTP, or serialization.

`src/shared/contracts/backend.ts` aggregates workflow-only modules. Multi-step behavior belongs in
`src/backend/services`, including:

- chat session orchestration;
- painting generation sessions and incomplete receipts;
- provider/model pull, reconcile, health, OAuth, and avatar workflows;
- MCP runtime coordination;
- permission policy and profile avatar workflows.

Workflow-oriented services receive AI and coordinated dependencies through constructor-shaped
interfaces instead of importing the concrete AI implementation. Bootstrap supplies production
implementations. Platform and third-party services may use their concrete SDK or persistence
dependencies directly when that dependency is part of the service implementation.

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

The schema includes app state/preferences, chat, provider/model, MCP, file, painting, organization,
and assistant relation tables. `message` stores a parent-linked tree; `topic.activeNodeId` selects
the active branch. Message content is `data.parts`, and FTS derives searchable text from text parts.

`MessageService` persists user messages and reserves stable assistant placeholders before a
`ChatSession` streams. The session publishes an in-memory overlay during generation and writes the
terminal, paused, or error state to the placeholder.

## Service Graph

`createBackendServices()` constructs concrete backend classes such as `CacheService`,
`PreferenceService`, `ProviderService`, `MessageService`, `McpRuntimeService`, `WebSearchService`,
`ToolService`, and `AiService`. The graph is private to bootstrap. `createBackend()` returns the
workflow-only `Backend` plus the workflow implementations needed by Data API handlers.
`createAppBootstrapRuntime()` wires those handlers into `DataApiService` and exposes
`PreferenceService` only through the `PreferenceClient` interface. The concrete graph and caches are
never exposed to frontend code.

There is no desktop application singleton, IPC handler layer, lifecycle registry, or frontend DI
container for these concrete classes.

## Seeding And Compatibility

Seeders always apply default preferences and preset providers; development builds also add mock chat
data. Seeder versions are journaled under `app_state` keys prefixed with `seed:`.

Mobile keeps shared entity and service semantics aligned with Cherry Desktop where practical, but it
does not share the physical SQLite file or Drizzle migration timeline. Breaking schema changes may
still reset development data; no legacy migration bridge is required before release.

## Startup Gate

`AppBootstrapGate` initializes the backend cache before database seeding, then waits for database
initialization, preference initialization, boot theme, and i18n only. The root route keeps the
native splash visible until initialization settles.
`runPostReadyTasks()` performs orphan pending-message repair and MCP prewarming after the gate opens;
it is best-effort and cannot reopen or extend the gate.
