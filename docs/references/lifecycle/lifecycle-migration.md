# Lifecycle Migration

> Status: Historical implementation plan. Stages A, B, D, and C are landed; the sections below
> preserve the migration rationale and acceptance criteria.
> Interfaces: [lifecycle-overview.md](./lifecycle-overview.md) ·
> [resource-scope.md](./resource-scope.md)

## Stage order

Skeleton first: the framework lands before the fix that motivated it.

| Stage | Content | Why here |
| --- | --- | --- |
| **A** | Toolchain + `src/backend/core/lifecycle/` + `src/backend/core/application/` | Pure addition. Nothing is wired, so app behaviour cannot change |
| **B** | Migrate the ~18 runtime modules to `@Injectable` classes; `AppBootstrapProvider` installs a host | The mechanical bulk. Behaviour-preserving, reviewable module by module |
| **D** | `ResourceScopeCoordinator`, Chat/Job/Activity registration, Data API routing, write-path guard tests | The correctness fix. Needs B's services to register against |
| **C** | CRUD services become module singletons; every test moves to a test host | Largest mechanical volume, lowest risk, and it blocks nothing |

Stage D is the reason this work exists, but it is not first: the coordinator is registered like any
other service, so building it before the container means writing its wiring twice. B before D also
means D's integration points already exist as lifecycle services.

## Where the code lives

```text
src/backend/core/lifecycle/     framework — depends only on shared
  types.ts  decorators.ts  BaseService.ts  ServiceContainer.ts
  DependencyResolver.ts  LifecycleManager.ts  event.ts  signal.ts
src/backend/core/application/   orchestrator
  Application.ts       the `application` constant and get()/install()
  ApplicationHost.ts   one service generation
  serviceRegistry.ts   the central `services` object
```

This mirrors desktop's `src/main/core/lifecycle/` and `src/main/core/application/`, and the location
is forced rather than stylistic. CRUD data services in `src/backend/data/` must call
`application.get('DbService')`, and the existing `backendLayer` eslint rule forbids
`src/backend/**` from importing `@/bootstrap`. Putting the framework under `bootstrap` would make
the very call pattern this design is built on a lint error.

Two constraints follow:

- **No barrel.** Import `@/backend/core/application/Application` directly, as desktop imports
  `@application` straight at `Application.ts`. A barrel re-exporting `serviceRegistry` would pull
  the whole service graph into every consumer and create an import cycle.
- **`serviceRegistry.ts` is the one exception to the layer rule** — it imports concrete classes from
  `backend/ai`, `backend/services`, and `backend/data` because registration *is* assembly. It gets a
  file-scoped eslint exemption. `Application.ts` reaches the `ServiceRegistry` type through
  `import type`, which erases at compile time and therefore creates no runtime cycle.

## Lint and ownership rules

| Rule | Mechanism | Status |
| --- | --- | --- |
| Frontend may not call `application.get()` | Existing `frontendLayer` already bans `@/backend/*` from `src/frontend/**` | Free — no new rule |
| `backend/core` may not import `backend/ai`, `backend/services`, `backend/data` | New `backendCoreLayer` pattern | Stage A |
| `serviceRegistry.ts` exempt from the above | File-scoped block | Stage A |
| Undeclared dependency resolved during init | Container warns in dev/test | Stage A |
| Service classes are never exported as instances | Review; the registry only holds constructors | Stage B |

Three README files assert the opposite of this design and are rewritten in Stage B:
`src/bootstrap/README.md` ("Do not introduce service locators, lifecycle phase registries"),
`src/bootstrap/composition/README.md` ("must not introduce a general registry, service locator, or
lifecycle framework"), and the principles section of
[runtime-ownership.md](../runtime-ownership.md) ("Mobile does not port the desktop lifecycle
framework, service registry, or phase graph"). Leaving them in place would leave the repository
contradicting itself.

## Stage A contents (landed)

| Piece | What shipped |
| --- | --- |
| Toolchain | `reflect-metadata` plus `@babel/plugin-proposal-decorators`. The installed plugin is v8, which takes `version: 'legacy'` — v7's `legacy: true` fails to load. `reflect-metadata` is imported by `decorators.ts` itself rather than from preboot, so no global setup ordering is implied |
| Primitives | `types.ts` (`Phase`, `LifecycleState`, `TeardownOutcome`, `ServiceMetadata`, `Pausable`, `Activatable`), `event.ts` (`Disposable`, `Emitter`, `toDisposable`) |
| Decorators | `@Injectable`, `@DependsOn`, `@Priority`, `@ServicePhase`, `@ErrorHandling`, `@AppStatePolicy` and their readers. The error strategy defaults from the phase, so most services declare none |
| BaseService | Desktop's, minus IPC sugar and the WeakSet guard, plus `registerAppStateListener` |
| DependencyResolver | Layered topological sort, cycle detection, priority ordering, `hoistGateDependencies` |
| ServiceContainer | Registration, lazy singletons, constructor injection, overrides, dev-mode undeclared-dependency warning |
| LifecycleManager | Phase startup, `runAllReady`, reverse-order `stopAll`/`destroyAll`, the 5s ceiling, `TeardownSummary` |
| Application + ApplicationHost | `get()`, serialized `install()`/`uninstall()`, two-stage construction, `HostProfile` overrides |
| Lint | `backendCoreLayer` plus the `serviceRegistry.ts` exemption |

`signal.ts` was not ported: nothing consumes a one-shot signal yet. It comes with the first service
that needs one, most likely `ChatRuntime`'s reconciliation gate in Stage B.

68 unit tests cover the framework. The `services` object is empty, so the app's runtime graph is
untouched — confirmed by a simulator cold start that reaches the topic list exactly as before.

The toolchain was proven end to end rather than by a green build alone. A temporary decorated class
wired into the app entry compiled to Hermes bytecode in a production export, and on a simulator it
read its own `@Injectable` name, `@DependsOn` list, and default phase back out of
`reflect-metadata`. That last leg is worth doing once: `reflect-metadata` falls back to the
`Function` constructor to find a global object, and Hermes rejects that constructor — the fallback
is unreachable only because `globalThis` is checked first.

## Stage B outline

Migrate in dependency order so each commit leaves a working app: `CacheService` → `DbService` →
`PreferenceService` → `KeepAliveCoordinator` → `BackgroundActivityManager` → `WebSearchService` →
`McpRuntimeService` → OAuth services → `ChatRuntime` → `JobRuntime` → feature modules.

Per module: extend `BaseService`, add decorators, move `initialize`-style work into `onInit`, move
`dispose()` into `onStop`/`onDestroy`, replace hand-rolled `AppState` subscriptions with
`registerAppStateListener`, and delete the module's construction from `createBackend.ts`.

Closing commits install an `ApplicationHost` through `createAppBootstrapRuntime`; runtime-shaped
modules become classes and `JobRuntime`'s `liveRuntimesByDb` WeakMap is removed in favour of the
container guard. `providerRegistryService` remains package-level because its immutable bundled
catalog is already memoized below the host; wrapping it would not create per-generation ownership.

## Stage D outline

1. `ResourceScopeCoordinator` with unit tests (fencing, multi-scope dedup, drain timeout,
   registration during fence, idempotent release).
2. `ChatRuntime` registers turns under their topic scope.
3. The painting job handler registers executions under their painting scope.
4. Data API topic/message/assistant/painting handlers route destructive mutations through
   `delete()` / `invalidate()`.
5. Delete `onTopicsDeleted` and its plumbing through `createBackend.ts` and `apiHandlers.ts`.
6. Write-path guard tests: late writes against a deleted topic and a deleted painting.

## Stage C outline

CRUD services drop constructor injection and resolve `application.get('DbService')` per call, and
each exports a module singleton — matching desktop's `export const topicService = new TopicService()`.
Their tests move to an installed test host backed by the existing in-memory SQLite harness. Batch by
service family (topics/messages, paintings, providers/models, jobs, …) so each commit is reviewable.

## Testing

### Test host

```typescript
const host = await installTestHost({ DbService: createInMemoryDbService() })
// afterEach
await application.uninstall()
```

The existing harness in `src/backend/data/serviceTestDatabase.ts` — `node:sqlite` `:memory:` plus
real migrations plus a duck-typed `DbService` that reproduces the `writeTail` serialization —
becomes the standard `DbService` override rather than a per-test construction argument. A test that
forgets to install a host gets a loud throw from `get()`, not a silent stale instance.

### Required coverage

Framework: dependency ordering and layered parallelism, cycle detection, `Gate` fail-fast vs
`PostReady` graceful, teardown reverse order, per-service timeout producing `timed_out` rather than
success, destroy skipped under an in-flight stop, serialized host replacement, `get()` throwing with
no host and between generations, undeclared-dependency warning.

Coordinator: repeated cancel and release, registration racing invalidation, batch scopes that
overlap, late callbacks after release, a `cancel()` callback that throws, drain timeout leaving the
scope unfenced and the mutation unrun, and disposal concurrent with a user cancel.

## Acceptance walkthroughs

The nine scenarios from the requirement note, resolved against the designed mechanism:

| # | Scenario | Resolution |
| --- | --- | --- |
| 1 | Delete the message being generated | `invalidate([topic])` cancels the turn, awaits settle, then deletes. No late write, Activity, or lease |
| 2 | Assistant cascade deletes several topics | One `delete()` call carrying every scope; overlapping operations cancelled once |
| 3 | Painting deleted mid-generation through any Data API caller | Handler-level `delete()` cancels the job first — no dependency on a frontend hook |
| 4 | Cleanup rejects or times out | `ScopeDrainTimeoutError` naming stragglers; mutation never runs; scope unfenced |
| 5 | New operation starts during invalidation | `register()` throws `ScopeFencedError`; the operation never crosses the fence |
| 6 | Host disposal races a user cancel | Both paths idempotent; `release()` and `cancel()` tolerate repetition; no double-finalize |
| 7 | Foreground/background round trip | `AppState` drives no service transition; presentation and keep-alive change per owner policy |
| 8 | Process killed, then cold start | Job ledger resumes, pending messages repaired, Live Activity orphans swept, write guards reject stale writes |
| 9 | Android without iOS surfaces | No-op implementations resolve under the same keys; no registration leaks |

Scenarios 1–5 are Stage D; 6–7 are Stage B; 8–9 hold today and gain the guard tests in Stage D.

## Verification per stage

Each commit used targeted tests, lint, and formatting for its behavior. Before each PR, run the
current local gate in [Testing And CI](../../guides/testing-and-ci.md); the full suite belongs to
remote CI. Stage A additionally required a simulator cold start because only running the app proves
that the framework is inert.
