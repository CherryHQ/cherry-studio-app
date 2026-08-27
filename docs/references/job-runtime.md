# Job Runtime

> Status: as-built.

`JobRuntime` is the application-owned executor for durable work that must survive route changes,
remain observable through SQLite, and settle through an explicit cancellation and recovery policy.
It runs inside the single React Native/Hermes process; the ledger makes intent and terminal state
durable, but it does not make JavaScript execution reliable after process death.

## Ownership

```text
ApplicationHost
    ├─ JobHandlerRegistry       immutable production handler assembly
    ├─ JobRuntime               claim, dispatch, retry, cancel, recovery, and GC
    └─ KeepAliveCoordinator     current iOS lease for user-continued work
             │
             v
        JobService              serialized SQLite reads and writes
             │
             v
          job table             durable source of truth
```

`JobRuntime` is a `PostReady` lifecycle service. Its cold-start pump runs after the first-paint gate,
recovers prior-process work, promotes and claims runnable rows, and sweeps terminal rows. The service
registry creates one runtime per `ApplicationHost`; more than one live runtime over the same
database would violate recovery and claim invariants.

Frontend code never imports the runtime. It observes `/jobs` and `/jobs/:id` through the Data API,
while workflow modules receive narrow job operations from bootstrap composition.

## Durable Ledger

The `job` row records orchestration state:

- identity, type, queue, priority, parent, and optional idempotency key;
- `pending`, `delayed`, `running`, `completed`, `failed`, or `cancelled` status;
- input, output, metadata, error, attempts, timeout, and cancellation intent; and
- created, scheduled, started, updated, and finished timestamps.

The table stays domain-neutral. Business results belong to the owning resource: a painting job
writes output file ids to its `painting` receipt, while the job output carries the terminal workflow
result. There is no schedule table or job-to-file association table.

Every writer runs inside `DbService.withWriteTx()`. `enqueueTx()` lets a caller commit a business
receipt and its job atomically. A partial unique index ensures at most one active row per
idempotency key; callers may join that row instead of creating duplicate work.

## Handler Contract

Handlers declare:

- an `executionClass` describing the required OS execution window;
- a startup `recovery` strategy;
- queue, concurrency, retry, timeout, and cancel-grace defaults when needed;
- optional resource scopes derived from persisted input;
- `execute(ctx)` and an optional terminal `onSettled` callback.

The current execution classes are:

| Class | Current behavior |
| --- | --- |
| `foreground-only` | Dispatched by the in-process pump without a background keep-alive lease |
| `user-continued` | Dispatched with a `KeepAliveCoordinator` lease; currently implemented by silent background audio on iOS and a no-op elsewhere |
| `bounded-background` | Defined but not dispatched; no background-task adapter is installed |
| `system-transfer` | Defined but not dispatched; no system-transfer adapter is installed |

`server-required` is deliberately not an execution class. Work that requires reliable unattended
execution must not be enqueued into the local ledger.

The global running limit defaults to two; each queue defaults to one. Only `running` rows occupy a
slot. The pump coalesces concurrent dispatch requests, promotes due delayed rows, and arms one timer
for the next delay. Timers improve active-app latency and are not a correctness guarantee.

## Claiming And Fencing

A job is claimed and changed to `running` in one serialized transaction. Terminal writes and
metadata changes use conditional updates so a late handler cannot overwrite a row that already left
`running`. This weak fence is sufficient only under the enforced single-runtime invariant.

There is no persisted run token and no second background runtime entry point. Adding either requires
a stronger fencing design before two executors may reach the same database.

## Retry, Cancellation, And Recovery

Retry policy supports `none`, `fixed`, and exponential backoff, bounded by the handler's maximum
attempt count and delay. A retry moves the job to `delayed`; the ledger remains authoritative while
the timer is suspended.

Cancellation persists intent, aborts the active handler, and waits for its grace period. If the
handler ignores the signal, the runtime finalizes the row as `cancelled` with a `CANCELLED` error and
returns the API outcome `timed-out`; a later handler settle is a fenced no-op. A handler execution
timeout instead finalizes the row as `failed` with `HANDLER_TIMEOUT` after the same grace mechanism.

On cold start, each handler selects one recovery strategy:

| Strategy | Non-terminal rows from the previous process |
| --- | --- |
| `abandon` | Cancel all |
| `retry` | Reset `running` rows to `pending`; keep delayed rows |
| `singleton` | Keep the newest row and cancel older rows |

Persisted cancellation intent overrides every strategy. Rows whose type no longer has a registered
handler are cancelled as orphans. Recovery relies only on committed rows and never assumes a prior
process ran cleanup.

## Resource Deletion

A handler may declare domain scopes such as `{ kind: 'painting', id }`. During execution,
`JobRuntime` registers those scopes with `ResourceScopeCoordinator`. Deleting the resource fences
new work, requests cancellation, waits for the registered operation to settle, and only then opens
the delete transaction. A drain timeout leaves the mutation unrun.

Scope cancellation intent is not yet durable. Until it is persisted, a scoped handler must not use
`recovery: 'retry'`, because process death could otherwise revive work cancelled for a deleted
resource.

See [Resource Scope Lifecycle](./lifecycle/resource-scope.md) for the shared five-step deletion
contract.

## Production Handler: `painting.generate`

`JobHandlerRegistry` currently registers one handler:

- queue `painting`, concurrency one;
- execution class `user-continued`;
- recovery `abandon`, no retry, and a ten-minute timeout;
- painting scope derived from `paintingId`;
- managed input files recorded by the painting receipt;
- image generation through `AiService`, managed output import, receipt finalization, and failed
  output cleanup; and
- an optional `PaintingActivity` presentation while work is active.

`PaintingsModule.startGeneration()` materializes draft files, then creates or resets the painting
receipt and enqueues the job in one write transaction. It returns `{ jobId, paintingId }`. The
frontend polls the ledger while work is active and can adopt an existing job after remount. Explicit
cancel reaches `JobRuntime.cancel()`; deleting the receipt drains the painting scope first.

Process death during the provider call has an ambiguous external outcome, so recovery abandons the
row rather than charging for an automatic resubmission. The receipt remains visible as interrupted
and may be retried explicitly.

## Current Boundaries

- The ledger survives process death; an in-memory `JobHandle.finished` promise does not.
- `user-continued` is best effort and currently depends on an iOS background-audio mechanism. It is
  not an exact scheduler or a guarantee after force quit. Silent-audio keep-alive is also an App
  Store review risk, so replacing it with OS continuation APIs remains a release concern.
- No Expo background task, iOS Continued Processing, Android foreground service, system-transfer
  adapter, schedule runtime, or server executor is installed.
- Progress callbacks have no shared consumer; current UI observes ledger state and domain output.
- Terminal rows are garbage-collected after the retention limits in `JobRuntime`; domain receipts
  remain authoritative for product history.

Do not add a generic destination column, progress surface, platform adapter, schedule vocabulary, or
new execution class until a current product consumer needs it. See
[Extending Cherry Mobile](../guides/extending.md#add-a-job-handler) for the handler procedure.

## Related

- [Architecture Overview](./architecture-overview.md) — layer and dependency boundaries
- [Runtime Ownership](./runtime-ownership.md) — app-owned resource lifetime and teardown
- [Lifecycle](./lifecycle/README.md) — service host, phases, and registration rules
- [File Model](./data/file-model.md) — managed file ownership and painting references
