# Lifecycle Overview

> Status: as-built.
> Desktop source: `CherryHQ/cherry-studio@12498d68` — `src/main/core/lifecycle/`,
> `src/main/core/application/`
> Admission rules and the desktop divergence index live in [README.md](./README.md).

## Architecture

Four layers, mirroring desktop's split between `core/lifecycle` (the framework) and
`core/application` (the orchestrator):

```text
application                 stable global reference; owns `get()` and host installation
    │ holds one
ApplicationHost             one generation of services: container + lifecycle manager
    │ contains
ServiceContainer            registration, conditional resolution, singleton instances
LifecycleManager            phase ordering, dependency graph, teardown and its outcomes
```

`application` is a module-level constant that never changes identity. The `ApplicationHost` behind
it is replaceable, which is what makes per-test service graphs and Fast Refresh possible. Production
installs exactly one host and never replaces it.

Code lives in `src/backend/core/lifecycle/` (framework), `src/backend/core/application/`
(orchestrator), and `src/backend/core/resources/` (domain-neutral fencing and draining). The
location is forced, not stylistic: CRUD data services under `src/backend/data/` resolve `DbService`
through `application`, and the `backendLayer` lint rule forbids `src/backend/**` from importing
`@/bootstrap`. No barrel re-exports the concrete service registry; `serviceRegistry.ts` is the one
assembly exception allowed to import concrete constructors.

## Phases

```typescript
export enum Phase {
  /** Blocks first paint. Failures abort startup and surface the error screen. */
  Gate = 'gate',
  /** Runs after the gate opens. Fire-and-forget; failures are logged only. */
  PostReady = 'postReady'
}
```

Desktop's `BeforeReady` / `Background` / `WhenReady` are all defined relative to Electron
`app.whenReady()`. Mobile has no such event; its only real boundary is the first-paint gate, so the
enum carries mobile's boundary instead of a renamed Electron one. Within a phase, services are
dependency-sorted and peers initialize in parallel — that layering algorithm is ported unchanged.

`Gate` holds what a correct first render requires: `CacheService`, `DbService` (migration and
seeding), `PreferenceService`. Boot theme and i18n remain app-level steps performed by
`AppBootstrapProvider` after `host.start()` resolves — they are frontend concerns and do not become
backend services.

`PostReady` holds Agent reconciliation, MCP initialization, and the job runtime's cold-start pump.

## Service states and hooks

The state machine is ported verbatim:

```text
Created → Initializing → Ready ⇄ Paused
               ↑           ↓
               │        Stopping → Stopped → (restart) → Initializing
               │                      ↓
               └──────────────── Destroyed
```

| Hook | When |
| --- | --- |
| `onInit()` | Service is initializing; dependencies are already `Ready` |
| `onReady()` | This service finished initializing |
| `onAllReady()` | Every service in every phase finished; at most once per instance. Schedule work here, do not perform it — see [the PostReady rule](#the-onallready-rule) |
| `onStop()` | Shutdown, reverse dependency order. Disposables are released afterwards |
| `onDestroy()` | After all `onStop()` passes complete |
| `onPause()` / `onResume()` | Optional `Pausable` capability. Not driven by `AppState`; reserved for database snapshot/restore |
| `onActivate()` / `onDeactivate()` | Optional `Activatable` capability. Heavy resources behind a preference or feature gate |

`Pausable` and `Activatable` stay type-guard capability interfaces rather than base-class members,
as on desktop. Activation transitions are serialized with each other and with stop/destroy, so a
preference event cannot reacquire resources after host teardown begins. `BackgroundReplyRuntime`
uses this capability for the `chat.background_reply.enabled` gate.

## BaseService

Ported from desktop with three changes, all forced by the runtime rather than chosen:

```typescript
export abstract class BaseService {
  get state(): LifecycleState
  get isReady(): boolean
  get isDestroyed(): boolean
  get isStopped(): boolean
  get isActivated(): boolean

  protected onInit(): Promise<void> | void
  protected onReady(): Promise<void> | void
  protected onAllReady(): Promise<void> | void
  protected onStop(): Promise<void> | void
  protected onDestroy(): Promise<void> | void

  /** Auto-released after onStop/onDestroy. Accepts a Disposable or a cleanup function. */
  protected registerDisposable<T extends Disposable>(disposable: T): T
  protected registerDisposable(dispose: () => void): Disposable

  /** Recurring timer scoped to this service; rejections are logged, the loop survives. */
  protected registerInterval(callback: () => void | Promise<void>, intervalMs: number): Disposable

  /** Mobile-only. Subscribes to AppState and releases the subscription on stop. */
  protected registerAppStateListener(listener: (status: AppStateStatus) => void): Disposable
}
```

| Desktop member | Mobile | Why |
| --- | --- | --- |
| `ipcHandle()` / `ipcOn()` | Removed | `ipcMain` does not exist here |
| `private static instances = new WeakSet()` rejecting a second `new` | Removed; the container enforces one live instance **per host** | Every host generation re-instantiates its services. The desktop guard encodes "one instantiation per process", which is false for tests and Fast Refresh |
| — | `registerAppStateListener()` | Five call sites currently hand-roll `AppState.addEventListener` plus `subscription.remove()`; the sugar removes the leak class |

`registerInterval` drops desktop's `handle.unref()` — a Node-only API absent from Hermes. The timer
is cleared by the same disposable path regardless.

## Registration

Two-part, exactly as on desktop: decorators carry metadata, a central object performs registration
and derives the types.

```typescript
@Injectable('JobRuntime')
@ServicePhase(Phase.Gate)
@DependsOn(['DbService', 'KeepAliveCoordinator'])
@AppStatePolicy('continue')
export class JobRuntime extends BaseService {
  constructor(private dbService: DbService, private keepAlive: KeepAliveCoordinator) { super() }

  protected async onStop(): Promise<void> {
    await this.drainInFlight({ timeoutMs: DISPOSE_DRAIN_TIMEOUT_MS })
  }
}
```

```typescript
// src/backend/core/application/serviceRegistry.ts
export const services = {
  ResourceScopeCoordinator, CacheService, DbService, PreferenceService,
  BackgroundActivityEnvironment, KeepAliveCoordinator, BackgroundActivityManager,
  BackgroundReplyRuntime, WebSearchService, McpRuntimeService,
  AiService, AgentSessionStore, MobileAgentHost, JobHandlerRegistry, JobRuntime,
} as const

export type ServiceRegistry = { [K in keyof typeof services]: InstanceType<(typeof services)[K]> }
export const serviceList = Object.values(services) as ServiceConstructor[]
```

Adding a service is one import plus one line; `application.get()` key types follow automatically.
The name passed to `@Injectable` must match its key here — bundlers mangle `class.name`, so the
explicit string is mandatory, same as desktop.

Decorators require `@babel/plugin-proposal-decorators` (legacy) and `reflect-metadata`. Desktop's
decorators all take explicit arguments, so `emitDecoratorMetadata` and constructor type reflection
are not needed.

`@AppStatePolicy` is mobile-only and purely declarative — `'continue'`,
`'background-presentation'`, `'foreground-refresh'`, or `'not-applicable'`. It drives no behaviour;
it makes "what does this service do when the app backgrounds" auditable without reading each
implementation.

## Conditional capability

Desktop excludes a service at registration when `@Conditional` fails, which forces every consumer
onto `getOptional()` and forces the container to transitively exclude dependents. Mobile registers
every service unconditionally and selects a no-op implementation instead:

```typescript
// Android and web resolve the same key; the instance simply does nothing.
const lease = application.get('KeepAliveCoordinator').acquire('job.painting.generate')
```

Call sites carry no platform branches and no `?.`. `getOptional()`, the get/getOptional mutual
exclusion, and transitive exclusion are all unported. The metadata slot for `@Conditional` stays
reserved for a future heavyweight service that must not even be constructed.

## `application.get()`

```typescript
class Application {
  get<K extends keyof ServiceRegistry>(name: K): ServiceRegistry[K]
  install(host: ApplicationHost): Promise<void>
  uninstall(expectedHost?: ApplicationHost): Promise<TeardownSummary>
  get hasHost(): boolean
}

export const application = new Application()
```

### Who may call it

| Layer | Allowed | Mechanism |
| --- | --- | --- |
| `src/backend/**` | Yes | Direct |
| `src/bootstrap/**` | Yes | Direct |
| CRUD module singletons | Yes | Resolve `DbService` per call |
| `src/frontend/**`, `src/app/**` | **No** | `useBackendModule()`, Data API hooks, preference hooks |

The frontend ban is the mobile equivalent of desktop's renderer/IPC boundary, which enforces the
same separation physically. The repository's ESLint layer rules enforce it.

### Timing semantics

| Moment | Result |
| --- | --- |
| No host installed | Throws. This is what makes a module-scope `application.get()` fail loudly instead of capturing a stale instance |
| Between `uninstall()` and the next `install()` | Throws |
| During host startup | Resolves; services are created lazily, so a `Gate` service may resolve a dependency mid-startup |
| During host disposal | Resolves, so `onStop()` can reach collaborators while tearing down |
| A late callback after disposal completes | Resolves against the *current* host if one exists, otherwise throws |

`get()` deliberately has no readiness gate — it never asks "is this service `Ready`?". That matches
desktop, and correctness for late callbacks comes from scope fencing plus write-path guards
(see [resource-scope.md](./resource-scope.md)), not from making every resolution defensive.

### Undeclared dependencies

Resolving a service that is not in `@DependsOn` is legal at **runtime**, but it is a bug during
**initialization** because it silently escapes the ordering graph.

The container therefore records resolutions made while a service's `onInit`/`onReady` is executing
and warns when one was not declared. Dev and test only; zero production cost; a warning rather than
an error because the runtime back-edge pattern is legitimate and only the init window is unsafe.

## ApplicationHost

A host is one generation of services. It exists because mobile must be able to swap an entire
service graph inside a single process — production never does, but tests and Fast Refresh do.

```typescript
type HostProfile = {
  readonly services: readonly ServiceConstructor[]
  /** Test seam: pre-built instances that win over construction. */
  readonly overrides?: Partial<ServiceRegistry>
}

class ApplicationHost {
  constructor(profile: HostProfile)          // constructs nothing; claims nothing
  start(): Promise<void>                     // runs the Gate phase
  runPostReady(): void                       // fire-and-forget PostReady phase
  dispose(): Promise<TeardownSummary>        // reverse-order stop, then destroy
  readonly container: ServiceContainer
  readonly state: HostState                  // 'created' | 'starting' | 'ready' | 'disposing' | 'disposed'
}
```

### Two-stage construction

Construction allocates no resource: no database is opened, no job is claimed, no audio session
starts. Only `start()` does that. This formalizes a rule bootstrap already follows — composition
builds, runtime starts — and it is what makes replacement safe.

`application.install(host)` serializes generations internally: the previous host remains resolvable
until its `dispose()` completes, then the new host starts. Two hosts therefore never hold the SQLite
connection or a job claim at once, while an outgoing service can still land terminal writes through
module singletons during `onStop()`. `uninstall(expectedHost)` makes stale runtime cleanup a no-op
after another generation has replaced it; the comparison happens inside the same serialized
transition, not against a racy pre-call snapshot.

### Who installs a host

| Context | Owner |
| --- | --- |
| Interactive app | `AppBootstrapProvider` — creates and installs on mount, uninstalls on unmount |
| Tests | The test itself, via a helper that installs a host with an in-memory database and disposes it in `afterEach` |
| Headless task | Type slot only. No mobile headless entry point exists today (no `TaskManager`/`registerTaskAsync` anywhere); the profile type keeps the design from foreclosing one |

Fast Refresh remounts the provider, which disposes the old host and installs a new one. There is no
dev-only host reuse cache — a rebuild costs a cold start in development and keeps one honest code
path in production.

## Startup sequence

```text
AppBootstrapProvider mount
  └─ new ApplicationHost({ services: serviceList })        constructs, claims nothing
  └─ application.install(host)
       └─ host.start()                                     Gate phase
            ├─ dependency-sort Gate services, layer them
            ├─ per layer, in parallel: _doInit() → onInit() → Ready → onReady()
            └─ any failure rejects: startup aborts, provider shows the error screen
  └─ apply boot theme, initialize i18n                     app-level, still pre-gate
  └─ status = ready → AppBootstrapGate renders children
  └─ host.runPostReady()                                   fire-and-forget
       ├─ _doAllReady() on every service, at most once each
       └─ PostReady services initialize; failures are logged, never fatal
```

Fire-and-forget describes the caller and first-paint path, not detached ownership. The host retains
the PostReady promise; if disposal starts while that phase is initializing, disposal awaits it
before deriving the reverse stop order. A service therefore cannot become `Ready` after the stop
pass and leak resources from an obsolete generation.

### The `onAllReady` rule

`onAllReady` must **schedule**, not perform. Desktop's `JobManager` sets a 60s timer there and
returns synchronously; performing long work inside the hook stalls the phase and delays disposal,
which waits for an in-progress PostReady phase before stopping it. Mobile keeps the same rule:
register the timer via `registerInterval` or a disposable `setTimeout`, and join it in `onStop`.

## Shutdown sequence

```text
application.uninstall()  (provider unmount, or install() of a replacement)
  └─ host.dispose()
       ├─ await an in-progress PostReady initialization
       ├─ stopAll():    reverse initialization order, per service ceiling 5s
       │                 onStop() → release disposables → Stopped
       ├─ destroyAll(): reverse order again, same ceiling
       └─ TeardownSummary { timedOut: string[], failed: string[] }
```

Reverse-order teardown means consumers stop before the infrastructure they use: `JobRuntime` and
`MobileAgentHost` drain before `DbService` closes because they declared it as a dependency.

## Failure, timeout, and concurrency semantics

| Concern | Rule |
| --- | --- |
| Gate failure | `fail-fast`. Startup aborts; the provider surfaces the error. No `custom` strategy is ported — it has no mobile use |
| PostReady failure | `graceful`. Logged, startup unaffected |
| Dispose during PostReady initialization | Waits for initialization, then stops the complete graph in reverse order |
| Circular dependency | `CircularDependencyError` naming the cycle, thrown during resolution |
| Init timeout | None. A hung `Gate` service hangs startup. A hung `PostReady` service does not block first paint, but a later disposal waits for it rather than overlapping initialization and teardown |
| Teardown timeout | 5s per service per pass. On expiry the framework stops *waiting* — it does not cancel. The hook keeps running and the service is reported as `timed_out` |
| Destroy under an in-flight stop | Skipped, and reported as `failed`. Tearing down resources beneath live work is worse than leaking them during shutdown |
| Overall shutdown fuse | Not ported. Desktop force-exits after 30s because Electron owns process death; mobile's OS does |
| Concurrent `install()` | Serialized; the second waits for the first generation's disposal |
| Stale runtime calls `uninstall(expectedHost)` | No-op if a newer host is installed |
| `dispose()` called twice | Idempotent, returns the same promise — matches every existing mobile runtime |

A `timed_out` outcome is reported honestly rather than folded into success: the summary distinguishes
`completed`, `timed_out`, and `failed`, and a non-clean shutdown is logged as such.

## Observability

Structured logs carry owner, operation kind, resource scope, transition and reason, duration, and
outcome. They never carry prompts, tokens, or message payloads. The vocabulary distinguishes normal
completion, user cancellation, resource invalidation, host disposal, OS recovery, timeout, and
implementation error — a shutdown that timed out must not read like a clean one.
