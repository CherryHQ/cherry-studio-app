# Cherry Mobile Runtime Ownership

Status: current

Related decisions: [ADR 0001](../adr/0001-use-provider-owned-runtime-owners.md),
[ADR 0002](../adr/0002-use-startup-gates-not-lifecycle-phases.md), and
[ADR 0011](../adr/0011-separate-in-process-frontend-and-backend.md).

## Principles

- Mobile does not port the desktop lifecycle framework, service registry, or phase graph.
- A runtime owner exists only for state or resources that outlive one call.
- Every owner defines creation, disposal, and abort behavior.
- Backgrounding is not a reliable execution window for chat or painting generation.
- Backend sessions report events/results; frontend owners perform navigation, translation, toast,
  and React Query invalidation.

## App Bootstrap

`AppBootstrapProvider` owns one `AppBootstrapRuntime`. The production runtime:

- creates `CacheService`, `DbService`, and the private backend service graph;
- creates one stable `MobileBackend`;
- initializes the backend cache before SQLite seeding, then preferences, boot theme, and i18n;
- starts best-effort post-ready tasks after the gate opens;
- disposes MCP, web-search state, the backend cache, and SQLite on unmount.

The provider's React context exposes only `loading`, `ready`, or `error`. Concrete backend services
never enter React state or frontend code. `BackendProvider` separately supplies the stable
`MobileBackend` and exposes only `useBackendModule(key)`.

`AppBootstrapGate` is the only initial-render gate. It renders `null` while loading and throws the
initialization error. The root layout retains the native splash, and `AppBootstrapProvider` hides it
when initialization settles, including the error path.

## Query Runtime

`QueryProvider` owns the React Query client and maps React Native `AppState` to query focus. It does
not own SQLite, AI streams, or backend implementation classes. Query functions select a backend
module through `useBackendModule` and invalidate keys in frontend owners.

## Chat Session

`ChatSessionProvider` owns one backend `ChatSession` for the route and disposes it on unmount. The
session interface supports subscription, snapshots, sending, tool approval, abort, and disposal.

The backend session owns active turn state, AbortControllers, assistant placeholder identity,
stream reading, terminal persistence, and session events. The frontend provider owns session
subscription, route navigation, and React Query invalidation. Backend code never imports Expo Router
or TanStack Query.

An active stream is not guaranteed to continue, checkpoint, or resume after OS suspension or
termination. User abort persists the defined paused/partial state; disposal aborts active work.

## Painting Session

`usePaintingGeneration` owns a backend `PaintingGenerationSession`, an AbortController, and UI-only
generating/revealing/error state. The backend session owns file preparation, AI generation,
persistence, incomplete receipt retry state, and failed-output cleanup. The frontend hook owns toast
and query synchronization and disposes the session on unmount.

## Other Long-Lived Resources

- `McpRuntimeService` owns MCP clients and tool caches; app bootstrap disposes it.
- `WebSearchService` owns API-key rotation state; app bootstrap disposes it.
- Backend `CacheService` owns Provider API-key rotation state and backend-only MMKV persistence;
  app bootstrap initializes and disposes it.
- Frontend cache owns subscriptions and MMKV-backed UI persistence.
- Screen and component listeners, timers, and native sessions remain with their React owner.

## Startup Work

`bootstrapAppRuntime()` reads cached boot preferences, applies the frontend theme, and initializes
i18n. It must not refresh catalogs, prefetch history, repair data, or run diagnostics.

`runPostReadyTasks()` starts after status becomes `ready`. It currently repairs crash-orphaned
pending assistant messages and prewarms active MCP servers. It is fire-and-forget, best-effort, and
must not block first paint.

Current topic, message history windows, provider queries, and feature state load at route level after
the bootstrap gate.

## Acceptance

- App bootstrap unmount closes SQLite and disposes long-lived backend resources.
- Chat and painting owners abort active work and dispose their backend sessions.
- Cold start does not wait for non-current history, provider/model refresh, or diagnostics.
- Every new long-lived resource can identify its owner, release point, and background behavior.
