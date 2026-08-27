# Lifecycle

> Status: as-built.
> Desktop source: `CherryHQ/cherry-studio@12498d68` — `src/main/core/lifecycle/`,
> `src/main/core/application/`, `docs/references/lifecycle/`

Mobile adopts Desktop's lifecycle framework rather than a mobile-specific invention. Business code
reads identically on both platforms — `application.get('DbService')`, `@Injectable('JobRuntime')`,
`@DependsOn([...])` — and the framework diverges only where a mobile runtime physically differs
from an Electron main process.

Two subsystems have no desktop counterpart and are designed here for the first time:
`ApplicationHost` (swappable service generations, for tests and Fast Refresh) and
`ResourceScopeCoordinator` (deleting a painting terminates the work running under it).

## Documents

| Document | Contents |
| --- | --- |
| [lifecycle-overview.md](./lifecycle-overview.md) | Framework interfaces, phases, service states, startup/shutdown sequences, failure and timeout semantics, `application.get()` rules |
| [resource-scope.md](./resource-scope.md) | `ResourceScopeCoordinator`, the five-step deletion sequence, and painting-job integration |

## Admission: does a module belong in lifecycle?

Lifecycle manages **resources**, not logic. A class named `*Service` does not qualify by virtue of
its name.

Register a module as a lifecycle service when it owns at least one of:

| Category | Mobile examples |
| --- | --- |
| A connection or handle outliving one call | SQLite (`DbService`), MCP clients, cache handles |
| A timer or scheduled loop | job delayed-promotion timer, cache rotation |
| A subscription or listener | `AppState` subscribers, preference change subscriptions |
| A native surface | Live Activity presenters, the keep-alive audio session |
| In-memory runtime state that must be released | active Agent turns, in-flight job executions, API-key rotation state |
| Work that continues after the caller returns | Agent turns, job executions, model pulls |

Do **not** register:

| Case | Where it lives instead |
| --- | --- |
| CRUD data services (`AgentService`, `PaintingService`, `ProviderService`, …) | Module singletons that resolve `application.get('DbService')` per call — same shape as desktop |
| Pure functions and stateless transforms | Plain modules |
| Resources released before the method returns | The method itself |
| React state, navigation, React Query cache, toasts | Frontend owners; see [runtime-ownership.md](../runtime-ownership.md) |
| Per-screen listeners and timers | The React component that created them |

Stateful data services are the exception to the CRUD rule: `PreferenceService` (cache plus async
init) registers as a service. `providerRegistryService` deliberately does not: its package-level
loader memoizes immutable bundled JSON below the app host, so a per-generation wrapper would add
resolution churn without creating a new resource lifetime.

## Divergence from desktop

Every deviation is deliberate and load-bearing; the rationale for each lives in the linked section.

| Desktop | Mobile | Reason |
| --- | --- | --- |
| `BeforeReady` / `Background` / `WhenReady` | `Gate` / `PostReady` | Desktop's three phases are defined relative to Electron `app.whenReady()`, which has no mobile equivalent. The real mobile boundary is the first-paint gate. See [phases](./lifecycle-overview.md#phases) |
| `BaseService.ipcHandle` / `ipcOn` | Removed | No `ipcMain` in a React Native runtime |
| `BaseService` WeakSet forbidding a second instantiation | Container-level "at most one live instance per host" | Each host generation must re-instantiate its services; the desktop guard assumes one instantiation per process. See [ApplicationHost](./lifecycle-overview.md#applicationhost) |
| — | `BaseService.registerAppStateListener` | Mobile-only signal with no desktop analogue |
| `@Conditional` + `getOptional()` dual track | Always register; select a no-op implementation | Mobile's platform differences are light (iOS-only surfaces), and no-op adapters already exist. Removes the get/getOptional split and transitive exclusion entirely. See [conditional capability](./lifecycle-overview.md#conditional-capability) |
| 30s `process.exit(1)` shutdown fuse | Not ported | The OS owns process death on mobile; a JS-side force-exit buys nothing |
| Painting deletion may race generation | `ResourceScopeCoordinator` | Mobile job/resource coordination. See [resource-scope.md](./resource-scope.md) |

## Related

- [runtime-ownership.md](../runtime-ownership.md) — ownership of long-lived resources and startup work
- [job-runtime.md](../job-runtime.md) — the durable job ledger coordinated with resource scopes
- [architecture-overview.md](../architecture-overview.md) — the frontend/backend seam
