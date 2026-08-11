# Lifecycle Migration

> Status: Stage A in progress; B, D, C not started.
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

## Stage A commits

1. **Toolchain** — add `reflect-metadata` and `@babel/plugin-proposal-decorators` (legacy), enable
   `experimentalDecorators`, import `reflect-metadata` once from preboot. Verify a decorator
   compiles under both Metro and jest-expo before anything depends on it.
2. **Primitives** — `event.ts` (`Disposable`, `Emitter`, `toDisposable`), `signal.ts`, `types.ts`
   (`Phase`, `LifecycleState`, `TeardownOutcome`, `ServiceMetadata`, `Pausable`, `Activatable`).
3. **Decorators** — `@Injectable`, `@DependsOn`, `@Priority`, `@ServicePhase`, `@ErrorHandling`,
   `@AppStatePolicy`, plus their metadata readers.
4. **BaseService** — desktop's, minus IPC sugar and the WeakSet guard, plus
   `registerAppStateListener`.
5. **DependencyResolver** — topological sort, cycle detection, layered parallelism, priority
   ordering within a layer.
6. **ServiceContainer** — registration, lazy singleton creation, constructor injection, one live
   instance per host, dev-mode undeclared-dependency warning.
7. **LifecycleManager** — phase startup, `stopAll`/`destroyAll` in reverse order, the 5s per-service
   ceiling, `TeardownSummary`.
8. **Application + ApplicationHost** — `get()`, serialized `install()`/`uninstall()`, two-stage
   host construction, `HostProfile` overrides.
9. **Lint + docs** — `backendCoreLayer`, the registry exemption, and this document's status line.

Every commit carries its own tests. Stage A ships an empty `services` object: the framework is
present and tested, no module is registered, and the app's runtime graph is untouched.

## Stage B outline

Migrate in dependency order so each commit leaves a working app: `CacheService` → `DbService` →
`PreferenceService` → `KeepAliveCoordinator` → `BackgroundActivityManager` → `WebSearchService` →
`McpRuntimeService` → OAuth services → `ChatRuntime` → `JobRuntime` → feature modules.

Per module: extend `BaseService`, add decorators, move `initialize`-style work into `onInit`, move
`dispose()` into `onStop`/`onDestroy`, replace hand-rolled `AppState` subscriptions with
`registerAppStateListener`, and delete the module's construction from `createBackend.ts`.

Closing commits: `AppBootstrapProvider` builds and installs an `ApplicationHost` instead of calling
`createAppBootstrapRuntime()`; factory-shaped modules (`createJobRuntime`, `createMcpModule`, …)
become classes; `JobRuntime`'s `liveRuntimesByDb` WeakMap is removed in favour of the container
guard; `providerRegistryService` stops being a module-level escape and registers as a service.

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

Each commit: `pnpm typecheck`, the targeted `pnpm test:app -- <pattern>`, lint, format. Full
`pnpm test:app` once before opening each PR. Stage A additionally requires a cold start on a
simulator to confirm the untouched runtime graph still boots — the framework being inert is the
claim, and only running the app proves it.
