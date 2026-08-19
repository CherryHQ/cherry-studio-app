# Mobile Job Manager Design

> Updated: 2026-08-16
> Status: Phase 1 landed and wired — `painting.generate` runs on the job ledger; see
> [Phase 1 As-Built](#phase-1-as-built)
> Desktop source: `CherryHQ/cherry-studio@d498753ecfd0f2572612456281ec222563ce7bf3`
> Mobile baseline: post `v0.2` merge (`fd1552c6` desktop-sync) — the job **ledger scaffolding
> already exists**; see [What Already Landed](#what-already-landed)
> Companion assessment: [job-manager-portability.md](./job-manager-portability.md)
> Mobile architecture baseline: [architecture-overview.md](./architecture-overview.md),
> [runtime-ownership.md](./runtime-ownership.md)

This document turns the portability assessment into a concrete implementation design. The
assessment answers "what can the OS give us"; this document answers "what do we build, where does
it live, and in what order". Where the two disagree, this document wins and the disagreement is
called out explicitly in [Deviations From The Assessment](#deviations-from-the-assessment).

## Decision Summary

Build an app-owned job runtime whose **domain layer is a near-verbatim port of the desktop Job
Manager** (state machine, retry/backoff, catch-up, recovery strategies, typed registry, error
codes) and whose **runtime layer is rewritten for one mobile reality**: a single Hermes runtime,
async serialized SQLite writes, OS suspension instead of graceful shutdown, and no reliable
background execution until native adapters exist.

The v0.2 merge already delivered the passive half — contracts, tables, migration, and read-only
Data API. What remains is the active half, shipped deliberately small:

- Phase 1 is a **foreground durable core**: enqueue/cancel/claim/retry/recovery on the existing
  ledger, owned by the application service host, with painting generation as the first real
  handler.
  It needs zero OS background APIs and is fully testable in jest.
- Background wake (Expo BackgroundTask), user-visible leases (iOS 26 Continued Processing, Android
  FGS), transfers, and schedules come later, each behind its own device-validated gate.

What we do not build: desktop's pause/drain write-quiesce (no mobile backup-restore consumer;
roughly a third of desktop `JobManager.ts` complexity), croner-armed cron timers as a correctness
mechanism, or any promise that a local job runs while the app is dead. (Silent-audio keep-alive
was on this list; PR #473 changed the evidence — see the
[KeepAliveCoordinator appendix](#appendix-keepalivecoordinator-design-draft).)

## What Already Landed

The v0.2 merge (desktop-sync `fd1552c6`) brought in, all desktop-verbatim:

| Piece | Location | State |
| --- | --- | --- |
| Jobs DTO contracts (status atoms, `Trigger`, `CatchUpPolicy`, `RetryPolicy`, `JobSnapshot`, `JobScheduleSnapshot`, `JobProgress`, `JOB_ERROR_CODES`, `JobSchemas` endpoints) | `packages/universal/src/data/api/schemas/jobs.ts` | Desktop mirror, formatting-only diff; already in the `ApiSchemas` intersection |
| `job` + `job_schedule` drizzle tables | `src/backend/data/db/schemas/job.ts` | Desktop-verbatim columns, indexes, CHECK constraint, and the partial unique idempotency index |
| Migration | `migrations/sqlite-drizzle/0006_*.sql` | Verified: the partial unique index and `job_status_check` emitted correctly |
| Read repository | `src/backend/data/services/JobService.ts` | `list` / `getById` / bare `create`; `rowToSnapshot` maps timestamps to ISO strings (matches desktop's string-typed snapshot) |
| GET-only Data API | `src/backend/data/api/handlers/jobs.ts`, aggregated in `apiHandlers.ts`, `JobService` constructed in `createBackendServices` | `/jobs` and `/jobs/:id` reads work today |

Since then the active half has landed too: the runtime (claim/dispatch/fencing/retry/cancel/
recovery/GC), the handler registry and contract, the first business handler, and bootstrap
ownership of the pump — see [Phase 1 As-Built](#phase-1-as-built). Platform adapters (Phase 2+)
remain unbuilt.

One structural consequence: `src/backend/data/db/schemas/job.ts` and the universal `jobs.ts` are
**desktop mirrors under the `$sync-cherry-desktop` audit**. Mobile-only state must not be patched
into them, or every future sync becomes a merge conflict and the schema-AST audit reports drift.
The design below therefore adds **no schema at all**: everything mobile-only is derived from the
handler registry, carried in `metadata`, or expressed as a runtime invariant. (One as-built
deviation exists outside the mirrors: `job_file_ref` — see
[Phase 1 As-Built](#phase-1-as-built).)

## Phase 1 As-Built

> Landed 2026-08-10. This section records where the implementation deviates from the design text
> and which gaps are deliberate; the design sections themselves are left as written.

**Wired surface.** The application service registry constructs `JobHandlerRegistry` as a
composition assembly service. It depends on `AiService`, `BackgroundActivityManager`, and
`BackgroundActivityEnvironment`, builds fully frozen handler entries, and passes them to
`JobRuntime`. The runtime itself depends only on `DbService`, `JobHandlerRegistry`, and the
`KeepAliveSource` implemented by `KeepAliveCoordinator`; its `PostReady` initialization pumps
with `reason: 'cold-start'`, whose first pass lazily runs startup recovery and GC. The first
consumer is `painting.generate`
(`src/backend/services/paintings/tasks/paintingGenerateJobHandler.ts`): the paintings module
creates the receipt and enqueues in one `withWriteTx` (with an idempotency pre-check so a
duplicate signature joins the active job instead of orphaning a fresh receipt), and
`usePaintingGeneration` observes the ledger by polling `GET /jobs/:id` (1 s while active, stop on
terminal) and adopts a still-active job on mount via `usePaintingJobs`. Because
`DbService.withWriteTx` is not reentrant, the in-transaction path is built entirely from `*Tx`
variants (`PaintingService.createTx` / `resetForRetryTx`, `JobRuntime.enqueueTx`,
`JobService.findActiveByIdempotencyKeyTx`).

**The ledger is the gallery's status source.** `usePaintingJobs`
(`src/frontend/features/paintings/hooks/usePaintingJobs.ts`) is the one subscription both the
drawings list and the composer read: an active query (`status=pending,delayed,running`, polling at
1 s only while non-empty) plus an untimed terminal query used purely for failure copy. An
output-less painting is *generating* when its id appears in the active map and *interrupted*
otherwise — deriving the interrupted state from the **absence** of an active job rather than the
presence of a terminal one keeps it correct after job GC collects the row that explains why. That
same hook is the only thing that invalidates `/paintings` when a generation lands while the user
sits on the list.

**As-built deviations from the design text:**

- **`job_file_ref` exists but Phase 1 does not write it.** The table
  (`src/backend/data/db/schemas/fileRelations.ts:88`, migration 0007) landed ahead of this
  design — a deviation from "no schema at all", though it touches file relations, not the `job`
  mirror. Phase 1 leaves it empty on purpose: the painting receipt's `painting_file_ref` rows
  already pin the input files, created in the same transaction as the enqueue, so a job-level ref
  would be redundant. It waits for a consumer whose files have no domain receipt of their own.
- **Handler input carries internal URIs alongside IDs.** As-built input is
  `{ images: { fileEntryId, mediaType, uri }[], mode, modelId, paintingId, paramValues, prompt }`.
  Draft picker images are materialized into durable internal file entries *before* enqueue; the
  `uri` riding along is the internal-storage path (never an ephemeral picker URI), which the
  handler reads data URLs from directly.
- **`startGeneration` returns `{ jobId, paintingId }`** and takes an optional `paintingId` to
  retry an image-less receipt in place (bumping it back to the head of the gallery) rather than
  minting a second one. The receipt id participates in `generationSignature`, so a retry and an
  identical fresh generation cannot collide on idempotency. `resetForRetryTx` rejects a receipt
  that already holds outputs — reuse would delete finished images.
- **`internal.echo` was not built.** The jest harness
  (`src/backend/services/jobs/__tests__/_helpers.ts`) registers inline test handlers, which serve
  the proof role without needing a production-registry exclusion mechanism.
- **No `AppState` pump listener yet** (Ownership item 4). Phase 1's dispatch triggers are
  enqueue, the delayed-retry timer, and cold start. A running `user-continued` attempt owns its
  keep-alive lease, but overdue delayed work still waits for the next explicit pump if the OS
  suspends its timer. Add the active-state pump with Phase 2.
- **Image-less receipts are visible, and that is what makes the durability observable.**
  `PaintingService` no longer filters the list on having outputs: the receipt row *is* the tile
  for a generation in flight (an `ImageGenerationLoader`, tapping back into its progress) and for one
  that never landed ("interrupted", with the provider's own failure text, tapping into a
  prefilled composer). Select-all sees them too, and deleting one cancels its running job first.
  A user-initiated cancel deletes its receipt on the spot — being stopped on purpose is not the
  same as being interrupted, and leaving the row would put a retry prompt in front of someone who
  just said no.

**Deliberate gaps** (settled in the 2026-08 design review, recorded so they read as decisions):

- **Chat stays out of the job system** (see [First handlers](#first-handlers)): a job is a fixed
  serializable input awaiting a result; a chat turn is an interactive stream with approvals.
  Background continuation for both comes from a shared keep-alive primitive instead — see the
  [KeepAliveCoordinator appendix](#appendix-keepalivecoordinator-design-draft).
- **Pause/drain write-quiesce is not ported.** Port it together with the backup feature — its
  only desktop consumer — using the desktop contract as the reference.
- **No push surface for progress.** Polling only, per Deviation 7; a CacheService-backed push
  face waits for a handler with high-frequency progress.
- **Schedules stay dormant** (Phase 4): `job_schedule` is written and read by nothing on mobile;
  desktop's `AgentTaskService` semantics occupy the table's shape, awaiting a mobile executor and
  a product feature that needs one.

## Desktop: What We Port And What We Don't

The desktop subsystem (`src/main/core/job/JobManager.ts`, 2,331 lines, plus pure-function runtime
helpers, repositories, and shared zod contracts) splits cleanly along one line:

| Desktop area | Verdict | Why |
| --- | --- | --- |
| Six-state machine (`pending/delayed/running/completed/failed/cancelled`), terminal/active sets | **Already landed** (universal mirror) | Pure vocabulary, zero Electron coupling |
| `job` / `job_schedule` schemas, indexes, partial unique idempotency index, CHECK constraint | **Already landed** (schema + migration) | Same drizzle + SQLite on both ends |
| Jobs DTO / error codes / endpoint map | **Already landed** (universal mirror) | Serialized data contract — dual-end alignment applies letter-for-letter |
| `runtime/backoff.ts`, `runtime/catchUp.ts`, `runtime/recovery.ts` pure functions | **Port verbatim** | Zero platform dependencies; desktop tests port with them |
| Claim query (`priority ASC, scheduledAt ASC`, `cancelRequested=false`, double-checked UPDATE) | **Port** | SQL is engine-portable |
| `JobRegistry` declaration-merging type safety, `JobHandler` contract, `JobContext` (signal, `patchMetadata`, `reportProgress`) | **Port** | Pure TypeScript |
| `enqueue`/`enqueueTx`/`JobHandle.finished` contract (finished never rejects; status carries the outcome; resolvers dropped, not rejected, on shutdown) | **Port semantics** | The "never resolves across shutdown" caveat is *more* true on mobile, not less |
| Cancel flow (persist `cancelRequested` → abort controller → grace `cancelTimeoutMs` 30 s → force-finalize `timed-out`) | **Port** | |
| Recovery strategies `abandon`/`retry`/`singleton` + `cancelRequested` override + in-flight exclusion + orphan-type cancel | **Port verbatim** | We do NOT add a fourth "resume" strategy — see deviations |
| GC (terminal TTL 7 d, keep latest 100 per type) | **Port, run from the pump** | Two independent prune steps are trivial |
| Layer 1 per-queue `async-mutex` + `DispatchQueue` map | **Drop** | Existed to reduce wasted write-tx traffic at ~200 dispatch/s; mobile throughput is orders of magnitude lower and `DbService.withWriteTx` already serializes globally |
| 60 s quiet window + mutable lifecycle registration | **Drop** | Mobile's lifecycle host assembles a complete frozen registry before `JobRuntime` starts, killing the partial-registration race by construction |
| Pause/drain write quiesce + release compensation | **Drop** | Serves desktop backup-restore fingerprinting; no mobile consumer |
| croner / `SchedulerService` timers | **Defer, foreground-only optimization** | Background timers freeze under Hermes/OS suspension; correctness moves to evaluate-on-pump (Phase 4) |
| Shared-window cache progress (`jobs.state.*` / `jobs.progress.*`) | **Adapt** | Single JS context; replace transport, keep the snapshot shape |
| `globalMaxConcurrency = 50` | **Replace with 2** | Backend JS shares the UI Hermes thread; tune from device measurement |

## Architecture

### Placement

Follows the standard "new backend module" drop points; read-path files already exist:

```text
packages/universal/src/data/api/schemas/jobs.ts   # landed — desktop mirror, do not fork
src/backend/data/db/schemas/job.ts                # landed — desktop mirror, do not fork
src/backend/data/services/JobService.ts           # landed — reads + claim/terminal/retry writers
src/backend/data/api/handlers/jobs.ts             # landed — GET-only, stays read-only
src/backend/services/jobs/JobHandlerRegistry.ts   # landed — frozen production handler assembly
src/backend/services/jobs/JobRuntime.ts           # landed — orchestrator (enqueue/cancel/pump)
src/backend/services/jobs/jobRegistry.ts          # landed — declaration-merging JobRegistry
src/backend/services/jobs/types.ts                # landed — JobHandler / JobContext / EnqueueOptions
src/backend/services/jobs/runtime/backoff.ts      # landed — ported pure functions + their tests
src/backend/services/jobs/runtime/catchUp.ts
src/backend/services/jobs/runtime/recovery.ts
src/backend/services/jobs/adapters/               # Phase 2+: wake & lease platform seams
src/backend/services/<domain>/tasks/<Name>JobHandler.ts   # handlers live with their domain
src/backend/services/paintings/tasks/paintingGenerateJobHandler.ts   # landed — first handler
```

Handler runtime types (`JobHandler`, `JobContext`) stay app-side, exactly as desktop keeps them
out of `src/shared` ("main-process internals" per the universal file's own header comment). Ported
runtime files carry the repo's alignment-comment convention
(`// Keep aligned with desktop src/main/core/job/...`).

### Ownership and composition

The application service host owns the module:

1. `JobHandlerRegistry` is the composition boundary. It receives handler dependencies from the
   lifecycle container and exposes the **complete immutable handler registry**. There is no
   `registerHandler` call at runtime, and `JobRuntime` has no feature imports. Adding a handler
   changes the assembly service, not the scheduler's constructor.
2. `JobRuntime` receives `DbService`, `JobHandlerRegistry`, and `KeepAliveCoordinator`. Its stop
   hook aborts controllers, drops `finished` resolvers without rejecting, and performs a bounded
   drain before the database stops.
3. `JobRuntime` is a `PostReady` service. Its initialization calls the cold-start pump off the
   first-paint gate; application-host disposal serializes against that initialization with a
   five-second ceiling.
4. A single `AppState` listener (inside the runtime, not in React) pumps on `active`. Frontend
   never imports the runtime; routes and hooks never own dispatch. *(The listener is deferred to
   Phase 2 — see [Phase 1 As-Built](#phase-1-as-built).)*

React routes, `ChatSessionProvider`, and hooks must not own the job dispatcher. This is the
navigation-ownership fix that PR #473 could not deliver.

### Runtime interface

```ts
type JobRuntime = {
  enqueue<K extends JobType>(
    type: K,
    input: JobPayloadOf<K>,
    opts?: EnqueueOptions,
  ): Promise<JobHandle>;
  enqueueTx<K extends JobType>(
    tx: Database,
    type: K,
    input: JobPayloadOf<K>,
    opts?: EnqueueOptions,
  ): Promise<JobHandle>;
  cancel(id: string, reason?: string): Promise<JobCancelResult>;
  pump(request: PumpRequest): Promise<PumpResult>;
  dispose(): void;
};
```

Same shape as desktop with one signature change: `enqueue` is async (mobile SQLite writes are
async). `JobHandle` keeps the desktop contract — `{ id, snapshot, finished }`, where `finished`
resolves the terminal `JobSnapshot`, **never rejects**, and silently never settles across a
process death; callers that must survive restart observe the ledger via Data API instead.
`enqueueTx` composes with `DbService.withWriteTx` for atomic business-write + job-insert
(e.g. create the painting receipt and enqueue its generation in one transaction), with the
desktop rule that post-commit side effects (dispatch, handle publication) defer past the commit.

Business modules enqueue; UI never does. The renderer-side rule ports unchanged: **Data API stays
read-only for jobs**, and any user-initiated job goes through the owning domain's workflow
contract (e.g. `PaintingsBackend` in `src/shared/contracts`), which internally calls
`JobRuntime`. This preserves compile-time payload safety and keeps queue names, retry policies,
and idempotency keys out of the frontend.

## Data Model

### Mirrored tables stay verbatim

`job` and `job_schedule` are already desktop-verbatim and must remain so — they are sync-audited
mirrors. Checkpoints (provider task IDs, cursors) live in `metadata` via `ctx.patchMetadata`,
exactly like desktop's remote-poll handler; they get promoted to typed columns only when a
handler's correctness depends on them, and any such promotion is negotiated as a deliberate,
documented mirror divergence — not slipped in.

Two properties the assessment wanted as columns are instead derived, keeping the mirror clean:

- **Execution class** is a function of the handler, not the row: the registry maps
  `type → executionClass`, and the pump filters claimable candidates by
  `type IN (classes allowed in this window)`. A per-row column would only matter if one type
  could be enqueued under different classes, which has no use case.
- **Payload version** is a `metadata.payloadVersion` convention (enqueue stamps the handler's
  current version; dispatch fails rows newer than the handler understands, terminal and
  non-retryable). Promote to a typed column only if a real migration ever needs to query on it.

### Fencing: a weak fence plus an invariant, not a sidecar table

Zero new tables. Attempt-scoped writes (`patchMetadata`, retry scheduling, terminal finalization)
are guarded by a **conditional UPDATE** rather than a per-attempt token:

```ts
// setTerminalTx(…, expectedStatuses) — 0 rows updated means the fence held.
.where(and(eq(jobTable.id, id), inArray(jobTable.status, expectedStatuses)))
// setDelayedRetryTx / setMetadataTx are fenced on status='running'.
```

This is already **stricter than desktop**, which updates by id alone
(`.where(eq(jobTable.id, jobId))`) and has no fence at all. It is weaker than a `runToken`
sidecar in exactly one way: it isolates by *state*, not by *attempt*. A late write from attempt 1
is stopped only while the row is not back in the expected state — if attempt 2 had already
re-claimed the row to `running`, attempt 1's write would match and overwrite it.

**Why that window is closed.** For an attempt-1 promise to outlive its own claim, it must still be
running while attempt 2 is claimed:

- `claimNext` skips candidates in `inFlightExecuted`, and that entry is deleted in the `finally`
  block — i.e. only after the handler settles. A live handler is always still in the set.
- Cancel-grace force-finalization leaves the row `cancelled`; claims only select `pending`.
- Across a process death the old attempt's promise does not exist at all.

So the weak fence is sufficient **exactly as long as this invariant holds**:

> At most ONE live `JobRuntime` per process per database.

That invariant is stated at the top of `JobRuntime.ts` and enforced by single-instance
registration in the composition root. Fencing is therefore an *architectural* constraint here,
not a schema feature — cheaper than a table, a migration, a per-claim upsert, and a token compare
on every write.

**The upgrade trigger.** Phase 2's background window must reuse the *same* `JobRuntime` instance.
On iOS this is free (BGTaskScheduler wakes the same JS runtime). If an Android headless path is
ever forced to construct a second React context — two live runtimes against one database — this
invariant breaks and the weak fence with it. That is the signal to introduce a per-attempt
`runToken` (a `job_claim` sidecar keyed by `jobId`, holding `runToken` / `runtimeId` /
`claimedAt` / `claimExpiresAt`, so the `job` mirror still never diverges). Build it then, on
evidence — not now, on speculation. Phase 2's device spike carries the check.

### The all-writes-in-tx rule

All job and claim writes — including single statements — go through `DbService.withWriteTx`.
This is stricter than both desktop convention ("single writes ride the connection") and current
mobile habit, and it is deliberate: on an async single connection, a stray write issued outside
the serialized queue can interleave into another transaction's `BEGIN IMMEDIATE … COMMIT` window.
Desktop is immune because better-sqlite3 is synchronous; we are not. Claim atomicity
(count → select → double-checked claim UPDATE in one queued transaction) depends on this rule.

## Execution Semantics

### Dispatch

Single coalescing dispatcher instead of desktop's per-queue mutex fleet:

1. `schedulePump()` — if a pump is running, mark dirty and return; else start one.
2. Pump loop: promote due `delayed → pending`; then repeatedly claim inside one
   `withWriteTx` (global running count < 2 → per-queue running count < handler concurrency →
   claim next by `priority ASC, scheduledAt ASC`, filtered in SQL to registered types whose
   execution class is allowed in this window). Candidate reads are paged so a full page of
   queue-capped or already in-flight rows cannot starve a runnable row behind it.
3. Spawn `handler.execute` outside the transaction with a `JobContext` whose `signal` is the
   combined abort of: user cancel, handler timeout sentinel (`JobHandlerTimeoutError`, matched by
   abort reason, never by message text), runtime dispose, and — Phase 2+ — lease expiration and
   pump deadline.
4. On settle: finalize fenced on the expected status and return the terminal snapshot from the
   same transaction; retry via `computeBackoff`
   (`none`/`fixed`/`exponential` with clamp, desktop defaults `{3, exponential, 1s, 60s}`) into
   `delayed` with a future `scheduledAt`; fire `onSettled` projection (errors swallowed and
   logged); re-run pump.
5. Arm exactly one foreground `setTimeout` for the earliest future `scheduledAt` among
   `delayed` rows; re-arm after every pump. A failed delayed-row read logs and retries after one
   second instead of being mistaken for an empty queue. Timers frozen by backgrounding are
   harmless: the next explicit or cold-start pump promotes overdue rows. Timers are a latency
   optimization, never a correctness mechanism — this is the design's version of desktop's
   "5-minute fallback tick", except the fallback is the pump itself.
6. Run the two GC prunes (bounded) on cold-start pumps only.

Global concurrency starts at 2 (painting generation + one light job) and is a constructor
parameter, not a hardcode. Backend JS shares the UI thread; desktop's 50 is meaningless here.

### Recovery

Cold-start pump runs the ported `runStartupRecovery` before any claim, with desktop semantics
verbatim: exclude rows the current process is executing; `cancelRequested=true` overrides every
strategy; `abandon` cancels leftovers; `retry` resets `running → pending` (attempt unchanged) and
leaves `delayed` alone; `singleton` keeps the newest row and cancels the rest; rows whose type has
no registered handler are cancelled as orphans. Staleness detection needs no marker column: with
one runtime per process, every active row outside this instance's in-flight set is by definition a
prior-process leftover. Rows this instance enqueued *before* recovery ran are excluded too —
otherwise lazy recovery would cancel work the current session just created.

There is no 60 s quiet window. Recovery rides `JobRuntime`'s `PostReady` initialization (already
after the startup gate, off the critical path), and because the registry is frozen before the
runtime starts, the desktop failure mode "recovery saw a partial registry" cannot occur.

### Cancellation

Desktop flow verbatim: persist `cancelRequested`, abort the live controller if the job is
running, wait up to `cancelTimeoutMs` (default 30 s) for the handler to settle, then
force-finalize `cancelled` and report `timed-out` (the handler may still be running in memory —
fencing makes its late writes no-ops). Forced cancellation releases the job's keep-alive lease
immediately while retaining its execution and scope binding until the real handler promise exits.
Pending/delayed rows finalize immediately. Platform Stop/Cancel surfaces (Phase 3 notifications,
Live Activity) call this same path.

Handler timeout uses the same cooperative-first shape but a distinct sentinel: abort with
`JobHandlerTimeoutError`, wait `cancelTimeoutMs`, then force `failed/HANDLER_TIMEOUT` and release
the lease if the handler is still alive. That terminal row frees scheduling capacity but never
starts a retry of the same attempt while its promise remains live. Resource-scope cancellation is
a synchronous abort and deliberately does not call public `cancel()`; before a scoped
`recovery: 'retry'` handler is registered, scope-cancellation intent must gain a durable form so
cold-start recovery cannot revive work cancelled by a resource mutation.

### Progress and observation

- **Durable truth**: the `job` row plus the handler's domain destination (painting receipt,
  file entry, message rows). Terminal business results always land in domain tables; `output`
  carries orchestration-level results only.
- **Foreground latency**: `JobHandle.finished` for the enqueuing owner that is still mounted;
  TanStack Query invalidation after settle for everyone else. Phase 1 has no live-progress
  consumer (image generation is a single provider call — there is nothing incremental to report),
  so we ship **no subscription surface yet**. When a progress-bearing handler arrives (Phase 2/3),
  add a ChatSession-style `subscribe(jobId)` snapshot listener on a jobs workflow contract,
  reusing the universal `JobProgress` shape (`{progress: 0-100, detail}`) and throttling
  persistence to meaningful checkpoints. Do not build it speculatively.
- Live Activity / Android notifications (Phase 3) observe progress; they never own it, and they
  never mark a job complete.

## Handler Contract

Ported `JobHandler` surface: `recovery` (required), `defaultQueue?(input)`,
`defaultConcurrency?`, `defaultRetryPolicy?`, `defaultTimeoutMs?`, `cancelTimeoutMs?`,
`execute(ctx)`, `onSettled?`, plus two mobile-only fields:

```ts
type JobHandler<K extends JobType> = {
  executionClass: JobExecutionClass;   // mobile-only, required; drives window eligibility
  payloadVersion?: number;             // mobile-only, default 1; stamped into metadata
  recovery: 'abandon' | 'retry' | 'singleton';
  // ... desktop fields unchanged
};
```

`JobExecutionClass` is `'foreground-only' | 'bounded-background' | 'user-continued' |
'system-transfer'`. The pump dispatches `foreground-only` and (as-built, since the
KeepAliveCoordinator landed) `user-continued`, wrapping the latter's `execute` in a keep-alive
lease. `server-required` from the assessment is deliberately not a class — such work must never
be enqueued locally.

Every first-wave handler must declare, in its PR description: destination, idempotency rule,
checkpoint format (or "none"), cancellation behavior, and recovery policy — the assessment's
go/no-go checklist enforced at review time.

### First handlers

**`painting.generate`** — the first real consumer, replacing the route-owned
`PaintingGenerationSessionImpl` execution path while keeping its receipt design:

- The receipt (`PaintingRepository.create`) is already the durable destination, created before
  generation — today's session logic ports almost directly into a handler.
- Input (as built): `{ images: { fileEntryId, mediaType, uri }[], mode, modelId, paintingId,
  paramValues, prompt }` — draft picker images are materialized into durable internal file
  entries before enqueue, so the URIs are internal-storage paths, never ephemeral picker URIs;
  the handler reads data URLs from them.
- `executionClass: 'user-continued'` (as-built; shipped as `'foreground-only'` until the
  KeepAliveCoordinator landed — the dispatch loop now holds a keep-alive lease around `execute`,
  so generation keeps running when the app is backgrounded), `recovery: 'abandon'`,
  `maxAttempts: 1`, queue `'painting'`, concurrency 1. Mobile `generateImage` is a single
  un-resumable provider call with no task ID; process death mid-call is an ambiguous external
  outcome, so recovery must not resubmit. Idempotency key: reuse the session's existing
  `generationSignature` so double-taps join the active job instead of double-charging. The
  handler also drives a `PaintingActivity` Live Activity session (Dynamic Island progress)
  through the `BackgroundActivityManager` while executing.
- `PaintingsModule` gains `startGeneration(input) → { jobId }` (receipt + `enqueueTx` atomically
  in one `withWriteTx`, with an idempotency pre-check so a duplicate signature joins the active
  job instead of orphaning a fresh receipt) and `cancelGeneration(jobId)`;
  `usePaintingGeneration` drops its AbortController ownership, polls `GET /jobs/:id` while a job
  is active, and adopts a still-active job on mount via `GET /jobs`. This delivers the actual
  product ask — generation survives leaving the screen — with zero OS background APIs.

**`internal.echo`** — dev/test-only proof handler (desktop `dummy.echo` precedent), excluded from
the production registry; drives the jest suite and the device sanity pass. *(Not built: the jest
harness registers inline test handlers instead — see [Phase 1 As-Built](#phase-1-as-built).)*

**Deliberately not chat.** `ChatSession` stays route-owned for now; an agent turn is a workflow
with approvals and tool calls, not a replayable job, and no provider recovery contract exists.
Moving chat to app lifetime is its own project; the job module only becomes its execution
coordinator afterwards, if ever.

**Second-consumer candidates** (whichever lands first validates the shared module):
`messages.crash-settle` (migrating `reconcileStalePendingMessages` into a `bounded-background`
job — idempotent, checkpointable, the canonical Phase 2 pilot), file orphan cleanup, or a
desktop-style content-hash backfill (`recovery: 'singleton'`).

## Platform Seams (Phase 2+)

Interfaces defined now, implemented per phase; the pump must stay correct when `acquire` returns
`null` or the signal aborts immediately:

```ts
type JobWakeScheduler = {
  reconcile(input: { earliestAt: number | null; requiresNetwork: boolean }): Promise<void>;
};

type JobExecutionLeaseProvider = {
  acquire(input: {
    jobId: string;
    executionClass: JobExecutionClass;
    title: string;
  }): Promise<JobExecutionLease | null>;
};

type JobExecutionLease = {
  signal: AbortSignal;
  update(progress: JobProgress): void;
  release(outcome: 'completed' | 'checkpointed' | 'expired'): Promise<void>;
};
```

- **Phase 2 wake**: one Expo BackgroundTask registration (single global entry, multiplexed to the
  same pump with `{ allowedClasses: ['bounded-background'], deadline, maxJobs }`). The headless
  composition opens the same `cherry.db` through a headless-safe subset of
  `createBackendServices` — no React, navigation, i18n, or route sessions. OS registration is a
  hint; SQLite stays authoritative; foreground resume remains the guaranteed catch-up path.
  This subset must resolve the *same* `JobRuntime` instance the foreground uses — that is the
  precondition the weak fence rests on (see Fencing), and the spike has to prove it per platform.
- **Phase 3 leases**: local Expo modules + config plugins (repo pattern:
  `modules/pdf-text-extractor` + `scripts/with-health-connect.js`) for iOS 26
  `BGContinuedProcessingTask` and an honestly-typed Android foreground service. iOS 17–25 gets
  `beginBackgroundTask` checkpoint grace only — the product copy must not promise long
  continuation there. *(The first draft added "silent audio is not a fallback"; PR #473 revised
  that on evidence — see the
  [KeepAliveCoordinator appendix](#appendix-keepalivecoordinator-design-draft).)*
- **Transfers**: system-owned engines (background `URLSession`, Android UIDT/WorkManager) behind a
  separate transfer adapter; a JS handler loop never owns bytes.

## Schedules (Phase 4)

The `job_schedule` table already exists (mirror), but no runtime reads it until Phase 4. Port the
semantics with the mobile inversion the assessment mandates: **durable rows are the schedule; OS
registrations and foreground timers are replaceable hints.** Every pump transactionally evaluates
due occurrences (ported `computeCatchUpAction`/`isScheduleOverdue` pure functions: cron by
`nextRun`, interval by `lastRun + ms`, `once` never overdue) and creates occurrence jobs with
deterministic `(scheduleId, occurrenceAt)` idempotency keys, so late, coalesced, or duplicated
wakes cannot double-fire. Croner runs foreground-only as a latency optimization, if at all — it
must first be validated on Hermes. Android exact alarms are an optional, explicitly Android-only
precision tier gated on product accepting the special-access UX; exact cross-platform wall-clock
scheduling and unattended multi-day agents are server-owned, full stop.

## Testing

Reuse the repo's proven backend harness (`McpServerService.test.ts` pattern): `node:sqlite`
in-memory database + drizzle sqlite-proxy + the real generated migration SQL + a duck-typed
`withWriteTx` that replays `BEGIN IMMEDIATE` semantics. Port the desktop scenario list onto it:

1. Six-state transition legality; terminal states never reopen.
2. Recovery matrix: `abandon`/`retry`/`singleton` × `cancelRequested` override × in-flight
   exclusion × orphan-type cancel × this-session-enqueued exclusion.
3. `computeBackoff` three branches + clamp; `computeCatchUpAction` overdue judgments (pure
   functions — desktop tests port nearly verbatim).
4. Idempotency: duplicate enqueue joins the active handle; unique-index backstop under racing
   enqueues.
5. Cancel grace timeout → force-finalize `timed-out`; late handler settle is a fenced no-op.
6. **Weak fence**: a force-finalized row stays terminal when its handler settles late — status
   and output are not overwritten and `onSettled` fires exactly once; `setDelayedRetryTx` /
   `setMetadataTx` no-op once the row leaves `running`.
7. `enqueueTx` rollback: no row, no dispatch, resolver dropped without rejection.
8. Concurrency caps: global and per-queue, backlog does not occupy slots.
9. Payload-version refusal path (metadata stamp newer than handler).
10. Pump coalescing: concurrent `schedulePump` calls produce one pump + one rerun.

Device sanity (not jest): cold start with leftover `running` rows; backgrounding mid-generation
and resuming; force-quit mid-generation → relaunch → `abandon` verdict visible in history.

## Delivery Plan

Re-sequenced from the assessment — each phase carries its own gate instead of one up-front
all-platform spike (see deviations):

| Phase | Contents | Entry gate | Exit criteria |
| --- | --- | --- | --- |
| 1. Foreground durable core (~2 wk) | Zero schema change; `JobService` writers, `JobRuntime` (claim/weak fence/retry/cancel/recovery/GC), bootstrap wiring, `painting.generate` + `internal.echo`, jest suite | None beyond this design | Painting survives navigation; force-quit yields honest `abandon` history; all jest scenarios green; device sanity pass |
| 2. Opportunistic background pump (~1–2 wk) | One Expo BackgroundTask registration, headless-safe composition, pump budgets/class filter, first `bounded-background` handler (`messages.crash-settle`) | 1–2 day device spike: task actually fires on physical iPhone + API-36 Android; denied/disabled background refresh handled; **the headless entry resolves the same `JobRuntime` instance** (if it cannot, add the `runToken` sidecar before shipping the window) | Dual-entry safety proven on device (foreground activation racing a headless window); catch-up correct when the OS never calls |
| 3. User-continued leases + transfers (~1–2 wk) | CP module (iOS 26), typed FGS or long worker (Android), Live Activity/notification progress + Stop plumbing, transfer adapter | Device spike per platform: CP submit/queue/cancel/app-switcher-removal; FGS type/policy review sanity | A user-started job continues after backgrounding on iOS 26 + Android; older iOS checkpoints and stops cleanly |
| 4. Schedules (~1–2 wk) | Schedule runtime over the existing table, CRUD via domain routes, due-occurrence evaluation in pump, catch-up policies, foreground timer optimization | A committed product feature that needs schedules; croner-on-Hermes validation | Late/duplicate wake cannot double-fire an occurrence; UI wording distinguishes best-effort/Android-exact/server tiers |

Phase 1 has product value on its own. Stop-loss: if after Phase 1 no second consumer
materializes, the module cost was ~the cost of an app-owned painting operation plus a reusable
ledger — acceptable; do not build Phases 2–4 speculatively.

## Deviations From The Assessment

Explicit disagreements with [job-manager-portability.md](./job-manager-portability.md), so future
readers know they are decisions, not oversights:

1. **No up-front all-platform spike.** The assessment's Phase 0 (4–7 days validating CP, FGS,
   exact alarms, BGTask delivery) gates work that ships in Phases 2–4. The foreground core needs
   none of it. Each phase gets a narrow entry spike instead; total spike effort is similar but no
   longer blocks first value.
2. **Three recovery strategies, not four.** The assessment adds "resume from checkpoint" as a
   policy. Desktop expresses resume as `recovery: 'retry'` + a persisted checkpoint in
   `metadata` (the remote-poll handler pattern), which composes and keeps the vocabulary aligned.
   We keep desktop's three.
3. **No mobile columns on the `job` table at all — and no sidecar either.** The assessment wants
   execution class, payload version, fencing tokens, and checkpoint/provider IDs as typed job
   columns. Post-merge, `job` is a sync-audited desktop mirror; execution class derives from the
   handler registry, payload version is a metadata convention, checkpoints stay in `metadata`
   desktop-style, and fencing is an invariant rather than state (see Fencing). Net schema change
   for the runtime: zero.
4. **No destination-ID column.** Handler input already carries the business key
   (`paintingId` …); adding a generic column duplicates it. Convention over schema until a
   generic "open the result" UI exists.
5. **`enqueue` returns a full desktop-style `JobHandle`,** not a bare `{ id }`. The assessment's
   worry (promise lifetime treated as truth) is addressed by the ported contract itself:
   `finished` never rejects and never settles across restart, and the ledger stays authoritative.
6. **Fencing is scoped honestly — and stays desktop-shaped.** The assessment reads as if
   dual-runtime races are a Phase 1 threat. With one Hermes runtime, zero background frameworks,
   and cold-start-only recovery, they are not. Rather than pre-building token fencing, Phase 1
   ships a conditional-UPDATE fence (already stricter than desktop, which updates by id alone) and
   pays for it with an explicit single-runtime invariant. Upgrading to `runToken` is a decision
   deferred to evidence, not a schema paid for upfront.
7. **No subscription/progress surface in Phase 1.** The first handler has no incremental
   progress; building the listener plumbing now is speculation. The universal `JobProgress`
   shape is reserved for when it exists.
8. **`server-required` is not an execution class value.** It is a product-mapping decision
   ("don't build this locally"); a local row with that class would be a bug, not a state.
9. **Silent audio is used as a mechanism, against the assessment's ruling — with the review risk
   accepted, not refuted.** The assessment states that silent audio "does not satisfy Apple's
   production background audio contract" and "must not become the Job Manager's execution
   foundation". Those are two separate objections, and the appendix revised the ruling on
   continuation evidence without separating them. *Foundation*: honored — job correctness never
   depends on keep-alive. The ledger, the fence, and cold-start recovery are what make a job
   correct; keep-alive only extends a window.
   *Contract*: the objection stands and is accepted as a known liability. `UIBackgroundModes:
   ["audio"]` without audible content is reviewable under App Review guideline 2.5.4, and Apple
   documents an interruption path for a session that "goes silent for too long" — which is why
   `KeepAliveCoordinator.handlePlayerStatusUpdate` has to restart playback. The mitigation is the
   exit already named in the appendix (iOS 26 Continued Processing, Android FGS); see
   [Agent Runtime execution lifetime](./agent/agent-runtime.md#execution-lifetime), which treats
   Mobile's local execution window as bounded and non-resumable in v1.

## Open Questions

- **Painting UX copy**: force-quit mid-generation now surfaces an honest failed/abandoned receipt
  instead of silently vanishing work — needs a small UI state for "interrupted, tap to retry".
- **Sync-audit registration**: confirm with the `$sync-cherry-desktop` skill that the jobs mirror
  files are classified correctly, and that `JobService`'s mobile-only writers (fenced signatures,
  `*Tx`-only surface) read as `semantic-port` rather than drift.

Resolved since the first draft: the drizzle partial unique index generates correctly (verified in
`0006_*.sql`); snapshot timestamps follow desktop's ISO-string convention via the landed
`rowToSnapshot`; and the `useJob` polling cadence is settled as-built (1 s `refetchInterval`
while a job is active, stop on terminal snapshots, restore-on-mount via `GET /jobs` filtered by
type + active statuses).

## Appendix: KeepAliveCoordinator (design draft)

> Status: **as-built** — PR #473 grew to carry the extraction itself, so the "merge first,
> extract later" sequencing this draft mandated is obsolete. The coordinator lives in
> `src/backend/services/keepAlive/KeepAliveCoordinator.ts`; both consumers below are wired.
> As-built deviations from the draft are flagged inline.

Phase 1 ships `painting.generate` as `foreground-only`: backgrounding the app mid-generation
suspends the JS runtime, and the job settles only on resume (or is abandoned by the next
cold-start recovery). PR #473's `BackgroundReplyRuntime`
(`src/backend/services/backgroundReply/BackgroundReplyRuntime.ts` on that branch) proves the
missing capability for chat: a silent audio session keeps Hermes scheduled while a reply streams
in the background — the OpenMinis approach, already shipped on the App Store. The mechanism is
not chat-specific; only its packaging is. The first draft of this document ruled silent audio
out; that ruling is revised on this evidence.

**What #473 does that the extraction must preserve:**

- iOS-only and preference-gated (`chat.background_reply.enabled`); the service no-ops elsewhere.
- expo-audio session: `setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode:
  true, interruptionMode: 'mixWithOthers' })`, looping `assets/audio/silence.m4a` at volume
  `0.001`.
- `reconcileAudio()` is reference counting in disguise: audio plays iff at least one turn is in
  a generating phase and stops when none is. Every async start/stop rides a serial operation
  queue (`operationTail`), so transitions cannot interleave.
- The Live Activity half (expo-widgets, foreground creation, 1 s-throttled updates across AppState
  transitions, orphan cleanup during initialization) is a separate concern that merely shares the
  service today.

**Extraction shape** — split #473's service along that seam:

```ts
type KeepAliveCoordinator = {
  /** 0→1 starts the silent audio session; idempotent per holder. */
  acquire(tag: string): KeepAliveLease;
};
type KeepAliveLease = { release(): void }; // 1→0 stops the session; idempotent
```

Consumers type against the narrower `KeepAliveSource` port (`acquire` only), so job and activity
runtimes do not depend nominally on the concrete coordinator.

- Owned by the lifecycle service host alongside `JobRuntime`; keeps #473's serial operation queue
  inside the coordinator and retries failed starts through one exponential timer (1, 2, 4, 8,
  16, then 30 seconds). **As-built deviation: no preference gate.** The coordinator is a
  pure counting primitive — gating moved to each consumer, because a coordinator-level
  `chat.background_reply.enabled` gate would let the chat toggle silently kill painting's
  background continuation, a cross-feature coupling no user could predict. Chat's gate now just
  means "chat does not acquire when disabled".
- Consumer 1 — chat: `BackgroundReplyRuntime` keeps its turns; `reconcileAudio` collapsed into a
  per-session `keepAlive` bit (generating phases → held, approval/terminal → released).
  **As-built deviation:** the Live Activity half did not stay in the service — it was extracted
  into the feature-agnostic `BackgroundActivityManager`
  (`src/backend/services/backgroundActivity/`), which owns throttling, AppState handling,
  orphan sweeps, and mirrors each session's keep-alive bit into a coordinator lease.
- Consumer 2 — jobs (wired as designed): the dispatch loop wraps a `user-continued` handler's
  `execute` in acquire/release, so the coordinator never observes job state and the runtime
  never owns audio.
- `painting.generate` moved `executionClass` to `'user-continued'` (landed): the class states
  the product promise ("keeps running while you do something else"), and keep-alive is the
  mechanism honoring it on iOS today — Phase 3's honest leases (iOS 26 Continued Processing,
  Android FGS) can replace the mechanism later without touching the class.

Android is out of scope for the extraction (it would be FGS + WakeLock, a Phase 3 concern).
