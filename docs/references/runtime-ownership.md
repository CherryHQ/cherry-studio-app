# Runtime Ownership

This reference defines ownership for long-lived resources, startup work, caller-owned sessions, and
cleanup.
Terms follow [Domain Language](./domain-language.md).

## Role Names

Name an owner by who calls it and who controls its lifetime. A class that directly corresponds to a
Cherry Desktop service keeps the upstream `XxxService` name and public methods. This includes
`DbService`, `CacheService`, `PreferenceService`, persistence services, `DataApiService`,
`AiService`, `McpRuntimeService`, `OAuthRuntimeService`, and `WebSearchService`.

Use these roles for mobile-owned code:

| Role | Use when the type is | Example |
| --- | --- | --- |
| `Module` | A frontend-visible workflow capability exposed through `Backend` | `ChatModule` |
| `Runtime` | One app- or bootstrap-owned executor whose state spans calls or routes | `ChatRuntime` |
| `Session` | One caller-owned isolated unit with explicit cancellation or disposal | `PaintingGenerationSession` |
| `Client` | A boundary to one external account, protocol, or remote API | `PkceOAuthClient` |
| `Adapter` | A translation boundary for a platform or SDK; a precise capability noun may stand alone | `DevicePermissions` |
| `Manager` | A coordinator whose defining job is owning a homogeneous pool or registry | `ConnectionManager` |

`Backend`, `BackendProvider`, and `useBackendModule()` are intentional aggregate and React
integration names. Leaf workflows use `XxxModule`; do not add parallel `XxxBackend`, `XxxService`,
and `XxxImpl` layers for the same operations. Factory-shaped modules use `createXxxModule()`.

An app-owned runtime is created once by bootstrap and is not disposed by route or component
unmount. A caller-owned session exposes its own lifecycle. Use `Manager` only for a real pool or
registry; otherwise prefer a precise domain noun or a plain function. Do not use the `Impl` suffix.

## Principles

- Mobile adopts the desktop lifecycle framework, service registry, and a mobile-specific phase pair;
  see [Lifecycle](./lifecycle/README.md). This document describes the current explicit-composition
  wiring, which that design replaces stage by stage — where the two disagree, Lifecycle is the
  target state and this document is the present one.
- A runtime owner exists only for state or resources that outlive one call.
- Every owner defines creation, disposal, and abort behavior.
- Backgrounding is not a reliable execution window for chat or painting generation.
- Backend modules report events/results; frontend owners perform navigation, translation, toast,
  and React Query invalidation.

## App Bootstrap

Bootstrap has three internal owners: `preboot` performs ordered global runtime patches,
`composition` constructs and connects concrete backend implementations, and `runtime` owns
initialization, the startup gate, post-ready work, and disposal. Apart from the explicit preboot
side-effect imports in the root layout, ordinary app code uses only `src/bootstrap/index.ts`.

`AppBootstrapProvider` owns one `AppBootstrapRuntime`. The production runtime:

- creates `CacheService`, `DbService`, and the private backend service graph;
- creates one stable workflow `Backend`, `ApiClient`, and `PreferenceClient`;
- initializes the backend cache before SQLite seeding, then preferences, boot theme, and i18n;
- starts best-effort post-ready tasks after the gate opens;
- disposes the Chat Runtime first, then MCP and web-search state, the backend cache, and SQLite on
  unmount.

The provider's own React context exposes only `loading`, `ready`, or `error`. Concrete backend
services never enter React state or frontend code. Its children receive three stable, narrow
providers: `DataApiProvider` for typed resource endpoints, `PreferenceProvider` for preferences, and
`BackendProvider` for workflow modules, including any caller-owned session factories.

`AppBootstrapGate` is the only initial-render gate. It renders `null` while loading and throws the
initialization error. The root layout retains the native splash, and `AppBootstrapProvider` hides it
when initialization settles, including the error path.

## Query Runtime

`QueryProvider` owns the React Query client and maps React Native `AppState` to query focus. It does
not own SQLite, AI streams, or backend implementation classes. Endpoint hooks call the injected
`ApiClient`; query keys and invalidation remain in frontend owners. `useBackendModule` is reserved
for workflows that are not ordinary resource queries or mutations.

## Chat Runtime

Bootstrap creates one `ChatRuntime` and exposes its narrow `ChatModule` interface through
`Backend.chat`. The runtime is app-owned, not route-owned: `ChatProvider` subscribes on mount and
unsubscribes on unmount, but it never creates or disposes a backend object. Route unmount therefore
does not terminate an active turn, and a later subscription reads the current snapshot.

The runtime owns active turn state, AbortControllers, assistant placeholder identity, stream
reading, terminal persistence, and `ChatEvent` fan-out. It tracks turns by Topic: different Topics
may stream concurrently, while a second turn for the same Topic is rejected. New-topic reservation
uses `NEW_TOPIC_SNAPSHOT_KEY` until the persisted Topic id is available.

The frontend `ChatProvider` owns route navigation and React Query invalidation. `useChatTopic()`
projects one Topic snapshot and sends or aborts work through the shared module. Backend code never
imports Expo Router or TanStack Query.

User abort affects only the selected Topic and persists the defined paused/partial state. App
shutdown marks the runtime disposed, rejects new tasks, aborts all active turns, and waits for every
tracked task to settle before MCP, web search, cache, or SQLite is closed. An active stream is still
not guaranteed to continue, checkpoint, or resume after OS suspension or termination.

## Painting Session

`usePaintingGeneration` owns one backend `PaintingGenerationSession` and UI-only
generating/revealing/error state. The session owns its AbortController, file preparation, AI
generation, persistence, incomplete receipt retry state, and failed-output cleanup. The frontend
hook owns toast and query synchronization and disposes the session on unmount.

`cancel()` aborts only the active generation and retains an incomplete receipt so the same input can
retry without creating another gallery item. `dispose()` aborts active work, clears the receipt,
permanently closes that session, and prevents late async receipt creation from reviving it. Separate
sessions never share receipt state.

## Other Long-Lived Resources

- `McpRuntimeService` owns MCP clients and tool caches; app bootstrap disposes it.
- `WebSearchService` owns API-key rotation state; app bootstrap disposes it.
- Backend `CacheService` owns Provider API-key rotation state and backend-only MMKV persistence;
  app bootstrap initializes and disposes it.
- Frontend cache owns subscriptions and MMKV-backed UI persistence.
- Screen and component listeners, timers, and native sessions remain with their React owner.

## Startup Work

`initializeAppRuntime()` reads cached boot preferences, applies the frontend theme, and initializes
i18n. It must not refresh catalogs, prefetch history, repair data, or run diagnostics.

`runPostReadyTasks()` starts after status becomes `ready`. It currently repairs crash-orphaned
pending assistant messages and prewarms active MCP servers. It is fire-and-forget, best-effort, and
must not block first paint.

Current topic, message history windows, provider queries, and feature state load at route level after
the bootstrap gate.

## Acceptance

- App bootstrap unmount closes SQLite and disposes long-lived backend resources.
- Route unmount only unsubscribes from Chat; app disposal aborts and awaits all Chat turns before
  closing infrastructure.
- Painting owners cancel or dispose their own isolated generation session.
- Cold start does not wait for non-current history, provider/model refresh, or diagnostics.
- Every new long-lived resource can identify its owner, release point, and background behavior.
