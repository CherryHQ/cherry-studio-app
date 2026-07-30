# Cherry Mobile Data Layer

Status: current

This document defines local data ownership after the in-process frontend/backend split in ADR 0011.

## Runtime Path

The normal read path is:

`frontend query/hook -> useBackendModule() -> MobileBackend contract -> backend implementation -> SQLite or integration`

The normal composition path is:

`AppBootstrapProvider -> createAppBootstrapRuntime() -> DbService + BackendServices -> createMobileBackend()`

`BackendServices` is a private bootstrap implementation graph. It is not placed in React context and
is not importable by frontend code. `MobileBackend` is the only frontend-facing backend interface.

## Frontend Data

`src/frontend/data` follows the Cherry Desktop renderer-data vocabulary while remaining mobile-owned.
It contains:

- `BackendProvider` and `useBackendModule(key)`.
- React Query client and query-key factories.
- Query functions for assistants, topics, messages, files, models, providers, paintings, MCP, and pins.
- Preference hooks backed by the `preferences` contract.
- `CacheService.ts`, its mobile storage adapter, and cache hooks; pure cache schemas live in
  `src/shared/data/cache`.

Frontend hooks call a narrow backend module directly. There are no generic hooks that expose a
concrete service graph, and frontend tests provide fake `MobileBackend` modules through the real
`BackendProvider`.

## Shared Data

`src/shared/data` contains values both sides may know:

- `api`: DTO schemas, pagination shapes, and data errors.
- `preference`: preference keys, value schemas, defaults, and pure helpers.
- `types`: entities and value types such as Assistant, Topic, Message, Provider, and Model.
- `presets`: shared catalog data.
- `cache`: cache schemas and pure template/equality helpers.

Database tables, Drizzle row types, and migrations are not shared contracts. They remain under
`src/backend/data/db`; managed-file persistence lives with the backend data services, while the
concrete UI-cache adapter stays frontend-owned.

## Backend Data

`src/backend/data` is the mobile counterpart of Cherry Desktop's `src/main/data`:

- `PreferenceService.ts` owns cached access to SQLite-backed preferences.
- `db` owns the connection, schemas, migrations, custom SQL, and seeders.
- `services` owns entity persistence and data-specific transformations.
- `fixtures` owns development data consumed by seeders and tests.

Mobile has no backend `CacheService` today. The current general cache corresponds to Desktop's
renderer cache and therefore lives at `src/frontend/data/CacheService.ts`. Desktop Main's cache
exists for Main-only scratch state, cross-window relay, and a Main-owned JSON persist tier; mobile
currently needs none of those. Domain-specific caches, such as MCP tool snapshots, remain private
to their owning backend modules.

## Backend Contracts

`src/shared/contracts/mobileBackend.ts` aggregates cohesive modules. Simple SQLite services may
directly satisfy a contract. Multi-step behavior belongs in `src/backend/application`, including:

- chat session orchestration;
- painting generation sessions and incomplete receipts;
- provider/model pull, reconcile, health, OAuth, and avatar workflows;
- MCP persistence/runtime coordination;
- permission policy and profile avatar workflows.

Application modules receive data and infrastructure dependencies through constructor-shaped
interfaces and never import their concrete implementations. Bootstrap supplies production
implementations.

## Database

`DbService` owns the Expo SQLite database `cherry.db` and Drizzle's Expo adapter. Startup:

- configures WAL, `synchronous=NORMAL`, and foreign keys;
- runs bundled migrations from `src/backend/data/db/migrations.ts`;
- runs idempotent custom FTS SQL from `src/backend/data/db/customSql.ts`;
- runs versioned seeders through `SeedRunner`.

Expo cannot read a migration directory at runtime, so SQL and the journal are bundled in
`migrations.ts`. Writes go through `DbService.withWriteTx()`, which serializes `BEGIN IMMEDIATE`
transactions on the long-lived connection.

## Schema And Message Persistence

The schema includes app state/preferences, chat, provider/model, MCP, file, painting, organization,
and assistant relation tables. `message` stores a parent-linked tree; `topic.activeNodeId` selects
the active branch. Message content is `data.parts`, and FTS derives searchable text from text parts.

`MessageService` persists user messages and reserves stable assistant placeholders before a
`ChatSession` streams. The session publishes an in-memory overlay during generation and writes the
terminal, paused, or error state to the placeholder.

## Service Graph

`createBackendServices()` constructs concrete backend classes such as `PreferenceService`,
`ProviderService`, `MessageService`, `McpService`, `WebSearchService`, `ToolService`, and `AiService`.
The graph is private to bootstrap. `createMobileBackend()` selects direct contract implementations
and application workflows from that graph.

There is no desktop application singleton, IPC handler layer, lifecycle registry, or frontend DI
container for these concrete classes.

## Seeding And Compatibility

Seeders always apply default preferences and preset providers; development builds also add mock chat
data. Seeder versions are journaled under `app_state` keys prefixed with `seed:`.

Mobile keeps shared entity and service semantics aligned with Cherry Desktop where practical, but it
does not share the physical SQLite file or Drizzle migration timeline. Breaking schema changes may
still reset development data; no legacy migration bridge is required before release.

## Startup Gate

`AppBootstrapGate` waits for database initialization, preference initialization, boot theme, and
i18n only. The root route keeps the native splash visible until initialization settles.
`runPostReadyTasks()` performs orphan pending-message repair and MCP prewarming after the gate opens;
it is best-effort and cannot reopen or extend the gate.
