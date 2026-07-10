# Cherry Mobile Data Layer

Status: current

This document defines the current mobile local data architecture. Terms follow [CONTEXT.md](../../CONTEXT.md).

## Runtime Path

The app data path is:

`DataProvider -> DbService -> createDataServices() -> Data Services -> React Query hooks -> screens/components`

`DataProvider` creates `DbService` and the Data Service Graph, runs database initialization, initializes preferences, applies boot preferences through `bootstrapAppRuntime()`, then exposes services through `useDataServices()`.

`InitialDataGate` only waits for `DataProvider` to become ready. It does not load the current topic, hydrate the message window, or start the Chat Runtime.

## Database

`DbService` owns the Expo SQLite database named `cherry.db` and wraps it with Drizzle's Expo SQLite adapter.

Startup does the following:

- Configures WAL, `synchronous=NORMAL`, and foreign keys.
- Runs bundled Drizzle migrations from `src/data/db/migrations.ts`.
- Runs idempotent custom SQL from `src/data/db/customSql.ts`.
- Runs seeders through `SeedRunner`.

Expo runtime cannot read the migration folder directly, so SQL migrations and the journal are imported into `src/data/db/migrations.ts`.

Writes go through `DbService.withWriteTx()`, which serializes writes and uses `BEGIN IMMEDIATE` on the long-lived SQLite connection. This avoids Expo's temporary exclusive transaction connection path, which is risky when FTS5 tables are present on physical iOS devices.

## Schemas

The current schema contains:

- App/runtime state: `app_state`, `preference`.
- Chat domain: `assistant`, `topic`, `message`, `prompt`.
- Organization: `group`, `pin`, `tag`, `entity_tag`.
- Provider/model domain: `user_provider`, `user_model`.
- Partial assistant relation tables: `assistant_mcp_server`, `assistant_knowledge_base`.

`message` stores a tree with `parentId` adjacency references and `topic.activeNodeId` marks the active branch. Message content is stored as `data.parts`, not legacy desktop `blocks`.

`message_fts` is created by custom SQL. Its triggers derive searchable text from `data.parts` text parts, not from legacy `data.blocks`.

## Service Graph

`createDataServices()` creates the current service graph:

- `PreferenceService`
- `ProviderService`
- `ModelService`
- `TagService`
- `GroupService`
- `PinService`
- `PromptService`
- `AssistantService`
- `TopicService`
- `MessageService`
- `WebSearchService`
- `AiService`

Services receive dependencies directly through constructors. Mobile does not use the desktop application singleton, IPC handlers, or lifecycle service registry.

## Topic And Message Flow

`TopicService` owns topic create/update/delete/list/reorder and active-node updates. Topic listing prioritizes pinned topics, then non-pinned topics with cursor pagination.

`MessageService` owns tree and branch reads plus write paths:

- `getTree()`
- `getBranchMessages()`
- `create()`
- `createSibling()`
- `createUserMessageWithPlaceholders()`
- `reserveAssistantTurn()`
- `update()`
- `delete()`
- path queries

The Chat Runtime uses `createUserMessageWithPlaceholders()` to persist a user Message and reserve a stable assistant placeholder before streaming starts.

## React Query Layer

`src/data/api` is not an HTTP server layer. It contains query key factories, the React Query provider, and API-shaped schemas for local service calls.

Current chat hooks call local services through `useDataQuery`, `useDataInfiniteQuery`, and `useDataMutation`:

- `useTopics()` reads `services.topic.listByCursor()`.
- `useMessageHistoryWindow()` reads `services.message.getBranchMessages()`.
- Provider, model, preference, pin, and assistant hooks follow the same service-backed pattern.

Message query keys include page-size policy values for initial and older pages, not a single `limit` field.

Keep the `src/data/api` name for this local Data API shape. It should not be renamed just because mobile does not expose HTTP endpoint handlers; the directory README and this architecture document define its mobile meaning.

## Seeding

Seeders always run default preferences and preset providers. Development builds also seed mock chat topics and messages.

Seeder state is tracked through `app_state` keys prefixed with `seed:`. Version changes rerun the corresponding seeder.

## Compatibility Boundaries

Mobile follows Cherry desktop's domain model where practical, but the current data layer is a mobile local runtime, not a complete desktop data-layer port.

Current divergences:

- Message content is `data.parts`; mobile should not introduce new `data.blocks` writes.
- FTS indexes `data.parts` text parts.
- Assistant MCP and knowledge relation tables exist, but full MCP/knowledge runtime domains are not part of the current mobile app.
- Mobile services are in-process and local; they are not HTTP endpoint handlers.

Assistant MCP and knowledge relation tables remain partial relation support for desktop schema alignment. They do not imply that mobile currently owns MCP server runtime, knowledge indexing/search, agent workspace behavior, or the related UI domains.

## Desktop Alignment And Reset Policy

Provider, Model, Assistant, Tag, Pin, Prompt, Topic, and Message schemas are not mobile-owned product contracts yet. They stay aligned with Cherry desktop table structure, data types, service semantics, and business logic unless mobile has a documented runtime compatibility reason to diverge.

During mobile development, these local schemas may still reset when desktop alignment requires breaking structure or behavior changes. When desktop changes a shared domain, mobile should update both schema and local service behavior rather than preserving a mobile-only interpretation for compatibility.

Development-stage legacy migration-ledger adoption and downgrade bridges are intentionally out of scope. Desktop and mobile also cannot safely open the same physical SQLite file today because their Drizzle timelines differ. Future sharing should use an explicit shared-entity export or sync contract rather than file-level interchange.

## Startup Measurement Boundary

`InitialDataGate` currently includes database open/configuration, bundled migrations, custom FTS SQL, seeding, cached boot preferences, i18n initialization, and orphan pending-Message reconciliation. These consistency steps must finish before the Data Runtime is exposed; they must not be skipped merely to shorten the splash screen.

No physical-device cold-start timing has been captured for this V1 change. Type checking, Jest duration, Metro readiness, and Expo export time are not substitutes for first-frame measurements. A future performance pass should record each startup step and first chat paint on release-like iOS and Android builds, then move only measured nonessential work such as catalog refresh or non-current history prefetch behind the first screen. Until that evidence exists, this change makes no startup-speed improvement claim.

## Reopen When

- Mobile brings a new desktop domain into scope.
- Desktop schema or business logic changes require a mobile data-layer update.
