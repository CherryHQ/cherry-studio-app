# Runtime Ownership

This reference defines ownership for long-lived resources, startup work, caller-owned sessions, and
cleanup.
Terms follow [Domain Language](./domain-language.md).

## Role Names

Name an owner by who calls it and who controls its lifetime. A class that directly corresponds to a
Cherry Desktop service keeps the upstream `XxxService` name and public methods. This includes
`DbService`, `CacheService`, `PreferenceService`, persistence services, `DataApiService`,
`AiService`, `McpRuntimeService`, and `WebSearchService`.

Use these roles for mobile-owned code:

| Role | Use when the type is | Example |
| --- | --- | --- |
| `Module` | A frontend-visible workflow capability exposed through `Backend` | `PaintingsModule` |
| `Runtime` | One app- or bootstrap-owned executor whose state spans calls or routes | `JobRuntime` |
| `Session` | One caller-owned isolated unit with explicit cancellation or disposal | `AgentRuntimeSession` |
| `Client` | A boundary to one external account, protocol, or remote API | `VertexAuthClient` |
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
  see [Lifecycle](./lifecycle/README.md). `ApplicationHost` owns each service generation while
  bootstrap remains the composition and installation boundary.
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

- creates an `ApplicationHost` and configures its platform-facing activity environment;
- creates one stable workflow `Backend`, `ApiClient`, and `PreferenceClient`;
- installs the host, whose dependency graph initializes cache before SQLite seeding and preferences,
  then waits for the native splash handoff before applying boot theme and i18n;
- starts best-effort post-ready tasks after the gate opens;
- uninstalls the host on unmount; reverse dependency order drains consumers before their
  infrastructure.

The provider's own React context exposes only `loading`, `ready`, or `error`. Concrete backend
services never enter React state or frontend code. Its children receive three stable, narrow
providers: `DataApiProvider` for typed resource endpoints, `PreferenceProvider` for preferences, and
`BackendProvider` for workflow modules, including any caller-owned session factories.

`AppBootstrapGate` is the only initial-render gate. It renders `null` while loading and throws the
initialization error. The root layout retains the native splash, while the app-shell
`StartupCoordinator` hides it only after its matching React Native cover has laid out and crossed
two composited frames. The provider owns initialization state and post-ready work; it does not own
splash visibility. `startupCoverHandoff` prevents Uniwind's native appearance synchronization from
running until the native surface is gone.

## Query Runtime

`QueryProvider` owns the React Query client and maps React Native `AppState` to query focus. It does
not own SQLite, AI streams, or backend implementation classes. Endpoint hooks call the injected
`ApiClient`; query keys and invalidation remain in frontend owners. `useBackendModule` is reserved
for workflows that are not ordinary resource queries or mutations.

## Agent Session Runtime

The service registry creates one `MobileAgentHost` per `ApplicationHost` generation and composition
exposes its `AgentProtocol` interface through `Backend.agent`. The Host is app-owned, not
route-owned. It owns active turns, Runtime sessions, normalized Agent events, approvals, terminal
persistence, and process-start reconciliation of unfinished turns.

The frontend `ChatProvider` creates one route-owned `AgentSessionChatClient`. The client observes
only Sessions with React subscribers, composes snapshots and deltas into live state, refreshes those
observations when the app returns to the foreground, and unsubscribes on route unmount. Removing an
observation does not cancel the Host's turn; reopening the route installs a fresh snapshot.

The frontend provider owns route navigation and React Query invalidation. Persisted transcripts are
ordinary `/agent-sessions/:sessionId/messages` Data API reads; live messages and approvals come from
the protocol snapshot/events and are merged by stable message id at the presentation boundary.
Backend code never imports Expo Router or TanStack Query.

User cancellation affects only the selected Session. One Session allows at most one active turn,
while different Sessions may run concurrently. App disposal closes Runtime sessions and waits for
tracked turns before lower-level infrastructure closes. OS suspension or termination still does not
guarantee continued execution or resumable streaming; the next process start marks unfinished local
turns interrupted.

## Agent Tool Capabilities

The Agent Host owns immutable per-turn tool snapshots, the monotonic resource ledger, approval
coordination, tool terminalization, and artifact projection. Pi owns model context construction and
the model → tool → result loop; it does not own system permissions, provider credentials, managed
files, MCP clients, or side-effect policy. Each application capability adapter owns its validation,
timeout, cancellation, cleanup, and error redaction.

The current tool inventory and binding rules live only in
[Agent Tools And Controlled Resources](./agent/agent-tools-and-resources.md).

An Agent tool may delegate to `JobRuntime`, but Version 1 still waits for terminal job state inside
the active turn. The durable job ledger does not make the Agent turn resumable after process death.
See [Agent Tools And Controlled Resources](./agent/agent-tools-and-resources.md).

## Painting Generation

The app-owned `JobRuntime` owns painting execution, cancellation, and terminal persistence across
route changes. Frontend hooks own only observation and UI synchronization. See
[Job Runtime](./job-runtime.md#production-handler-paintinggenerate) for the durable workflow and
resource-deletion contract.

## Other Long-Lived Resources

- `McpRuntimeService` owns MCP clients and tool caches; the host stops it.
- `WebSearchService` owns API-key rotation state; the host stops it.
- `ProviderRegistryUpdaterService` owns user-requested dual-source model-metadata checks and updates,
  approved-cache activation, request cancellation, and fallback to bundled data; the host stops it.
- Backend `CacheService` owns Provider API-key rotation state and backend-only MMKV persistence;
  the host initializes and stops it.
- Frontend cache owns subscriptions and MMKV-backed UI persistence.
- Screen and component listeners, timers, and native sessions remain with their React owner.

## Startup Work

`initializeAppRuntime()` reads cached boot preferences, waits for the native-to-React cover handoff,
then applies the frontend theme and initializes i18n. It must not refresh catalogs, prefetch history,
repair data, or run diagnostics.

The bootstrap runtime's `runPostReadyTasks()` starts the host PostReady phase after status becomes
`ready`. Agent reconciliation, MCP initialization, and the job cold-start pump stay off the
first-paint path. Host-owned PostReady initialization is retained and awaited if that generation is
disposed before it finishes.

Current Agent Session, transcript history windows, provider queries, and feature state load at route
level after the bootstrap gate.

## Acceptance

- App bootstrap unmount closes SQLite and disposes long-lived backend resources.
- Route unmount only unsubscribes from Agent Session observations; it does not cancel active turns.
- App disposal closes Agent Runtime sessions and awaits tracked Agent turns before closing
  infrastructure, including the MCP, device, provider, and file capability dependencies tools rely
  on.
- Painting route unmount does not stop generation; explicit cancel or resource deletion reaches the
  host-owned job runtime.
- Cold start does not wait for non-current history, provider/model refresh, or diagnostics.
- Every new long-lived resource can identify its owner, release point, and background behavior.
