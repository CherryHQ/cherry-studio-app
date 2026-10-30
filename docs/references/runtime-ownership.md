# Runtime Ownership

The current Agent lifetime is specified in
[Pi Durable Migration](./agent/pi-durable-migration.md). One app generation owns the native Harness
and Pi connection. Native task demand, including compaction, holds the existing execution lease.
Ordinary disposal or OS expiry preserves work; foreground reopening reconstructs current capabilities
before resuming. User stop aborts the selected Session. Route disposal only releases observation.

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
- Every admitted unfinished conversation holds execution demand in foreground and background,
  including questions, approvals, persistence, and final delivery. Stored history does not.
  Platform protection remains subject to OS limits and process death.
- `KeepAliveCoordinator` is the only execution-lease facade that business services and the
  background-activity manager use. It selects one registered platform source when constructed:
  `IosBackgroundExecutionSource` on iOS, `AndroidBackgroundActivityRuntime` on Android, and a no-op
  elsewhere. Business services never branch on platform; a platform without a mechanism degrades
  through no-op sources and presenters.
- Android uses task-scoped foreground-service and Headless JS lifetimes within OS limits; see
  [Android Background Generation](./android-background-generation.md).
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
- installs the host, whose dependency graph initializes SQLite seeding before preferences, then
  waits for the native splash handoff before applying boot theme and i18n;
- starts best-effort post-ready tasks after the gate opens;
- uninstalls the host on unmount; reverse dependency order drains consumers before their
  infrastructure.

The provider's own React context exposes only `loading`, `ready`, or `error`; `error` also carries
`retry`, which replaces the failed runtime with a new one because a host that failed to start
cannot start again. Concrete backend
services never enter React state or frontend code. Its children receive three stable, narrow
providers: `DataApiProvider` for typed resource endpoints, `PreferenceProvider` for preferences, and
`BackendProvider` for workflow modules, including any caller-owned session factories.

`AppBootstrapGate` is the only initial-render gate. It renders `null` while loading and the app-shell
`StartupFailureScreen` after an initialization error, so a failed start never becomes a crash
loop. The provider has already logged the failure and initialized translations for that screen
when an earlier step failed. Render failures after the gate opens are contained by the app-shell
`AppErrorBoundary`. The root layout retains the native splash, while the app-shell
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
route-owned. It owns admission, per-input execution capabilities, normalized Agent events, approvals, terminal
projection into Cherry history, and process-start reconciliation. Pi owns the durable model/tool loop
and queued submissions; the Host reconstructs capabilities before scheduling resumes.

The app-shell `ConversationProvider` owns the local catalog and retained remote sources shared by
the sidebar and Agent picker. Local chat observation belongs to the feature `ChatProvider`, which
creates and disposes `AgentSessionChatClient`, manages composer navigation, refreshes observed
Sessions on foreground and invalidates their queries. The client observes only Sessions with React
subscribers and composes snapshots/deltas into live state. Removing an observation does not cancel
the Host's turn; reopening the route installs a fresh snapshot.

`features/chat/runtime` reads persisted transcripts through
`/agent-sessions/:sessionId/messages`, retains the selected-branch history window and merges live
rows by stable message id. It projects the result into the shared conversation read model consumed
by `ChatWorkspace`. Remote revision-aware history reconciliation remains in the remote chat page.
See [Conversation Consumption](../../src/frontend/appShell/conversation/README.md) and
[Chat Screen](../../src/frontend/features/chat/README.md). Backend code never imports Expo Router
or TanStack Query.

User cancellation affects only the selected Session. Pi executes one input at a time within that
Session and retains admitted follow-ups in its inbox; different Sessions may run concurrently.
Ordinary disposal and OS execution expiry suspend the Harness without a user-abort mark. The next
Host reopens committed tasks and reconstructs current capabilities. An unsafe tool interrupted after
execution intent is not blindly replayed. Missing or obsolete execution copies reconcile through
Cherry reservations, as specified in [Pi Durable Migration](./agent/pi-durable-migration.md).
None of this guarantees continuous execution or a preserved network stream after process death.

## Remote Conversation Ownership

The mobile frontend/backend boundary is in-process. The desktop protocol is a separate network
boundary. `ConversationProvider` owns frontend sources and observation handles; `Backend.remoteAgent`
exposes credential-free reads and actions. `RemoteAgentRuntime` owns shared Agent scopes and pending
command recovery, while the desktop remains the execution and transcript authority.

`DesktopConnectionManager` owns physical desktop connections, domain leases and reconnection.
`DesktopConnectionRuntime` owns pairing and configuration workflows. A route releases reads and
observation; explicit cancellation is an independent command. Agent and configuration authorization
are separate even when they share one physical channel. MCP clients and document export sessions
remain owned by their respective runtimes.

The current graph, actual consumers, release matrix and unresolved dependencies are documented in
[Service Dependencies And Ownership](./remote-access/service-ownership.md). Remote chat/sidebar now
consume the common boundary, and the superseded Controller entry is removed. Local composer
admission, managed export asset leases, pairing-channel adoption and device acceptance remain
incomplete. Question responses and default-workspace creation need desktop protocol support.

## Agent Tool Capabilities

The Agent Host owns immutable per-turn tool snapshots, the monotonic resource ledger, approval
coordination, tool terminalization, and artifact projection. Pi owns model context construction and
the model → tool → result loop; it does not own system permissions, provider credentials, managed
files, MCP clients, or side-effect policy. Each application capability adapter owns its validation,
timeout, cancellation, cleanup, and error redaction.

The current tool inventory and binding rules live only in
[Agent Tools And Controlled Resources](./agent/agent-tools-and-resources.md).

An Agent tool may delegate to `JobRuntime`, but Version 1 still waits for terminal job state inside
the active turn. Pi recovers committed Agent work after process death; an interrupted unsafe tool
retains its native interruption outcome and does not blindly redispatch a job or external effect.
See [Agent Tools And Controlled Resources](./agent/agent-tools-and-resources.md).

## Painting Generation

The app-owned `JobRuntime` owns painting execution, cancellation, and terminal persistence across
route changes. Frontend hooks own only observation and UI synchronization. See
[Job Runtime](./job-runtime.md#production-handler-paintinggenerate) for the durable workflow and
resource-deletion contract.

## Admission Identity And Live Resources

Durable metadata identifies the work that was accepted; it is not a permanent permission grant.
The resource contract spans admission, use, deletion and recovery:

| Resource or effect | Fixed at admission | Checked at use or commit | Owner and regression source |
| --- | --- | --- | --- |
| Agent workspace | `workspaceFolderId`, including explicit `null`, in each input's durable metadata | Folder availability, path membership, source version and revision, current tool/approval policy | `DurableAgentHost` / `WorkspaceFileAccess`; [Host regression](../../src/backend/ai/agent/host/__tests__/DurableAgentHost.test.ts), [workspace access](../../src/backend/ai/agent/tools/__tests__/workspaceFileAccess.test.ts); [#1337](https://github.com/CherryHQ/cherry-studio-app/issues/1337) |
| Painting inputs | Managed `fileEntryId` for each selected version, never a durable physical URI | Resolve active entry and local bytes immediately before the provider read; unavailable input stops dispatch | `paintingGenerateJobHandler` / `paintingFileStorage`; [queue regression](../../src/backend/services/paintings/tasks/__tests__/paintingGenerateJobHandler.test.ts); [#1338](https://github.com/CherryHQ/cherry-studio-app/issues/1338) |
| Painting and board | `paintingId` and `boardId` in the job input | Admission and execution register both scopes; execution also checks the receipt still belongs to that board | `PaintingsModule`, `JobRuntime`, `ResourceScopeCoordinator`; [admission regression](../../src/backend/services/paintings/__tests__/createPaintingsModule.test.ts), [deletion regression](../../src/backend/data/api/handlers/__tests__/deletionScopes.test.ts); [#1339](https://github.com/CherryHQ/cherry-studio-app/issues/1339) |
| MCP side effects | Server/configuration identity and selected tool; App calls additionally retain their source reference | Current enablement/binding, input schema, consent and connection generation; transmission determines whether a lost result is uncertain | `McpRuntimeService`, `McpAppAccess`, `mcpRuntimeAdapter`; [App policy regression](../../src/backend/ai/mcp/__tests__/McpAppAccess.test.ts); [#1340](https://github.com/CherryHQ/cherry-studio-app/issues/1340) |

Changing a Session's workspace affects subsequent admissions only. A suspended or queued input
continues against its admitted identity. If that folder is trashed or purged, access fails; recovery
must never switch to another folder or to the root as a fallback. Released pre-workspace metadata
without this field means unbound (`null`). Current accounts and availability are still resolved live.

A logical file and one of its content versions are different identities. A task that chose a version
does not silently use the logical file's later current version. Trash retains bytes for recovery but
revokes ordinary reads immediately. The execution owner resolves availability; the storage adapter
owns byte access. Data already transmitted cannot be recalled by later deletion.

Board deletion fences the parent before draining, so a newly admitted child cannot escape a stale
child enumeration. Admission holds its scope through transaction commit/rollback; execution holds
both scopes through actual settlement. A process-local fence is not crash recovery: painting jobs
use `abandon`, and receipt existence is checked before external I/O. See
[Resource Scope Lifecycle](./lifecycle/resource-scope.md). Current painting-board/workspace task
shapes were introduced after v0.2.1; future changes to shipped inputs need an explicit compatibility
policy rather than guessed IDs or reconstructed paths.

## MCP Ownership

| Owner | State and responsibility |
| --- | --- |
| `McpRuntimeService` | One pooled client per server configuration, transport and catalog generations, cached catalogs, invalidation, temporary inspection, tracked OAuth completion, pausing pooled in-flight network budgets while a server question waits, and service teardown |
| `McpAppAccess` | Stateless App source/configuration binding, per-Agent permission, visibility/schema checks and independent consent; each validation round shares one catalog |
| `McpAppRuntime` | Live view sessions, initialization, bounded bridge messages, duplicate request rejection, view cancellation and redacted errors |
| `McpOAuthRuntime` | Authorization attempts, token refresh, revocation and serialized SecureStore writes; its stop cancels network work and settles token storage |
| `McpElicitationBroker` | User questions and responses |
| `mcpRuntimeAdapter` | Shared transmission/effect outcome classification and Agent result projection; App callers use the same classification without Agent presentation |

App content and tool operations acquire the service's shared connection. Settings inspection of an
unsaved configuration uses a bounded temporary client and joins service shutdown. App tool calls
validate before consent and again afterwards; authorization waiting has no network deadline. Server
disable/delete/configuration changes retire the generation and close dependent views. Backgrounding
closes App sessions and updates transport subscription policy; it does not cancel unrelated Agent
work merely because a view closed. A server error answer or a local App refusal leaves the shared
connection in place; only a lost exchange resets it. Connection setup belongs to the connection, so
it is cancelled only once no caller still waits. A lost result after transmission is not proof of
no side effect. Neither caller path automatically replays an uncertain write.

## Async Storage Admission And Teardown

Backup uses `StorageMutationGate`, with the explicit owner list composed in
`createAppBootstrapRuntime`. It rejects busy capture/restore instead of waiting for arbitrary
network work. Once frozen, new persistent work is rejected; Agent quiescence drains projections,
usage and checkpoints before the snapshot. This is application admission control, not a database
mutex or a distributed transaction.

| Operation | Initiation / cancellation | Settlement and final write guard | Backup and teardown |
| --- | --- | --- | --- |
| Agent admission, tools and transcript projection | Host admission and per-execution signals; ordinary shutdown suspends; user stop aborts | Host tracks admissions, pending writes and settlements; workspace/file commits retain live guards | Busy during admitted work; `quiesce()` reconciles reservations, drains usage/naming and captures context; dependencies remain alive during close |
| Painting admission and job execution | Module transaction then `JobRuntime`; user/scope/OS interruption aborts the execution | Admission scope covers commit/rollback; job actual-settlement promise covers terminal persistence; output writes never recreate a deleted receipt | Pending transaction verification, pump and actual executions count as busy; shutdown drains within its existing ceiling, then ledger recovery handles unfinished rows |
| Skill installation/update publication | Caller may cancel download/staging; composition owns persistent publication admission | Publication and the row write are inside the counted write transaction; staging is disposable cache data | Busy during admitted publication; `disposeSkills()` rejects later writes and joins accepted transactions before host uninstall; later network completions fail admission and discard staging |
| Trash marking/restore/purge/sweep | `TrashRuntime` immediately admits trash metadata transactions and serializes restore/purge/sweeps; stopping blocks new work | `trashWrites` retains marking transactions; `pending` and `tail` cover restore/purge plus best-effort byte cleanup; purge rechecks deletion timestamp | Busy while any accepted work is pending; sweeps skip a freeze; stop drains both marking writes and the tail before SQLite closes |
| MCP OAuth completion | Service deduplicates by attempt ID; service lifetime and OAuth attempt signals cancel network work | Completion stays tracked through inspection, connection transaction and grant cleanup; lifetime checks run inside the connection transaction | Reject start while frozen; tracked completions count as busy; stop aborts OAuth/inspection, then joins completion and cleanup before persistence teardown |
| MCP temporary inspection | Caller starts a bounded unsaved-server probe; service lifetime aborts it | No application row write; temporary-operation promise includes closing the client | May run during backup; stop cancels and joins it. A probe used by OAuth remains inside that completion's busy interval |

The OAuth source audit found that token storage already serialized writes and obeyed OAuth lifetime,
but the outer post-token inspection/connection save lacked a service-level join and backup admission.
The service now owns that interval. Skill publication was already included in backup admission; its
composition owner now also joins accepted writes during bootstrap disposal. No shared registration
framework is needed for these bounded owners. See [#1344](https://github.com/CherryHQ/cherry-studio-app/issues/1344).

These are source contracts and regression sources, not a claim of executed acceptance. The related
OAuth, queued-transaction and bootstrap-order regressions remain subject to the repository's
user-owned verification policy.

## Other Long-Lived Resources

- `SystemEntryBridge` owns the foreground claim pass. `systemEntry` owns the import and the native
  acknowledgement that ends a claim; bootstrap drains in-flight claims before stopping the host.
  A claimed share then lives only in the composer, so the process that is killed with an unsent
  draft loses it. Unclaimed staging survives process restart until consumed or expired. The iOS
  share extension runs outside the main app process and does not own another Backend or Agent Host.

- `McpRuntimeService` owns MCP clients and tool caches; the host stops it.
- `WebSearchService` owns API-key rotation state; the host stops it.
- `ProviderRegistryUpdaterService` owns user-requested dual-source model-metadata checks and updates,
  approved-cache activation, request cancellation, and fallback to bundled data; the host stops it.
- `IosBackgroundExecutionSource` owns one finite iOS UIKit execution window; `AndroidBackgroundActivityRuntime`
  owns Android execution demand, reused task notifications, protection status, and background budget.
  SystemIntegration shares notification IDs with the patched background-actions service. The host stops
  both after their lease consumers have released.
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
first-paint path. Disposal closes host-owned initialization immediately and gives the retained
PostReady promise up to 5s to settle. Pending hooks keep generation-scoped cleanup; they must honor
the closing signal before publishing results or reacquiring resources. See
[Lifecycle Overview](./lifecycle/lifecycle-overview.md#shutdown-sequence).

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
