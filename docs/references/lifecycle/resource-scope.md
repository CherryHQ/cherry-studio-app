# Resource Scope Lifecycle

> Status: Design complete, not yet wired. Lands in Stage D.
> Framework interfaces live in [lifecycle-overview.md](./lifecycle-overview.md).

## The gap

Deleting a domain resource does not stop the work running under it.

`onTopicsDeleted` — the only coordination hook that exists today — is wired to exactly one consumer:

```typescript
// src/bootstrap/composition/createBackend.ts
onTopicsDeleted: (topicIds) => {
  for (const topicId of topicIds) backgroundReply.clearTopic(topicId)
}
```

That ends the Live Activity presentation. It does not abort the stream. `chat.abort(topicId)` has
exactly one caller in the entire repository — the frontend stop button — and `jobRuntime.cancel()`
has exactly one — the painting cancel action. Neither is on any deletion path. So deleting a topic
mid-generation leaves the turn streaming into a topic that no longer exists, and deleting a painting
mid-generation leaves its job running.

Desktop has the same hole: its topic deletion handler calls `TopicService.delete` and never reaches
`AiStreamManager.abort`, and its painting deletion relies on the renderer cancelling first. The
closest thing to a correct precedent on either platform is desktop's knowledge-base deletion, which
cancels the base's active jobs *outside* the lock, then deletes. This subsystem generalizes that
shape.

## Model

A **scope** is a domain resource that owns work. An **operation** is cancellable work that belongs
to one or more scopes.

```typescript
export type ScopeKind = 'topic' | 'assistant' | 'painting'

export type ResourceScope = {
  readonly kind: ScopeKind
  readonly id: string
}

export type OperationRegistration = {
  /** Diagnostic identity, e.g. 'chat.turn', 'job.painting.generate'. */
  readonly kind: string
  /** Every scope this operation belongs to. Any one of them invalidating cleans it up once. */
  readonly scopes: readonly ResourceScope[]
  /** Idempotent, synchronous, non-throwing. Requests termination; does not await it. */
  cancel(reason: CancelReason): void
  /** Resolves when the operation has actually stopped and written its terminal state. */
  readonly settled: Promise<unknown>
}

export type OperationHandle = {
  /** Idempotent. Must be called on every terminal path. */
  release(): void
}
```

The coordinator is a plain lifecycle service that understands none of this domain vocabulary beyond
the scope kinds — it stores registrations and calls the callbacks it was handed. It does not import
`ChatRuntime`, `JobRuntime`, or `BackgroundActivityManager`, so adding a new kind of cancellable
work requires no change to it.

```typescript
@Injectable('ResourceScopeCoordinator')
@ServicePhase(Phase.Gate)
export class ResourceScopeCoordinator extends BaseService {
  /** Throws ScopeFencedError if any target scope is already fenced. */
  register(registration: OperationRegistration): OperationHandle

  /** Context is invalid but the scope survives: cleanup, mutate, then reopen. */
  invalidate<T>(scopes: readonly ResourceScope[], mutate: () => Promise<T>, options?: MutationOptions): Promise<T>

  /** Resource is gone: cleanup, mutate, then seal against further registration. */
  delete<T>(scopes: readonly ResourceScope[], mutate: () => Promise<T>, options?: MutationOptions): Promise<T>

  /** Diagnostics only. Not a pre-flight check — see the race note below. */
  listActive(scope: ResourceScope): readonly ActiveOperation[]
}
```

## The deletion sequence

`delete()` and `invalidate()` run the same five steps; they differ only in the final one.

```text
1. Fence      every target scope rejects new registrations from this moment
2. Cancel     call cancel() on every operation registered under any target scope, once each
3. Drain      await Promise.allSettled(settled) with a bounded ceiling
4. Mutate     run the caller's persistence mutation
5. Settle     delete: seal the scope    invalidate: unfence the scope
```

Failure handling is what makes the ordering worth having:

- **Drain times out** → step 4 never runs. The mutation fails with a diagnosable result naming the
  straggling operations, and the scope is unfenced. Already-cancelled work is not resurrected.
- **Mutation throws** → the scope is unfenced (`invalidate`) or left fenced and reported
  (`delete`), and the error propagates. Cancelled work stays cancelled.
- **A `cancel()` callback throws** → logged and treated as best effort; it cannot block the pass,
  because a throwing canceller must not strand the resource forever.

```typescript
export type MutationOptions = {
  /** Ceiling for step 3. Default 5000ms, matching the teardown ceiling. */
  readonly drainTimeoutMs?: number
  readonly reason?: CancelReason
}

export type StragglerInfo = { readonly kind: string; readonly scopes: readonly ResourceScope[] }
export class ScopeDrainTimeoutError extends Error { readonly stragglers: readonly StragglerInfo[] }
export class ScopeFencedError extends Error { readonly scope: ResourceScope }
```

### Transaction ordering

Steps 1–3 must complete **before** any write transaction opens. `withWriteTx` is not reentrant —
its `writeTail` promise chain plus `BEGIN IMMEDIATE` means a nested call deadlocks — and a cancelled
operation's terminal write needs the write lock to settle. Cancelling inside the transaction would
therefore deadlock: the drain waits for a write that waits for the transaction that is waiting on
the drain. Desktop hit exactly this and documents "cancel outside the lock" in its knowledge-base
deletion.

The rule: `mutate` opens the transaction; the coordinator never does.

### Batch and cascade

A batch deletion resolves its full scope set up front, deduplicates operations that belong to
several of them, cancels each exactly once, and drains once. Deleting an assistant with its topics
passes every affected scope in a single call, so an operation registered under both the assistant
and one of its topics is cleaned up once — not once per scope, and not left behind by a partial
pass.

### Registration races

`register()` is the atomic gate; there is no check-then-act. A caller does not ask "is this scope
fenced?" and then register — it registers, and handles `ScopeFencedError`. `listActive()` exists for
diagnostics and logging only.

An operation must register **before** it starts any external side effect, and release on every
terminal path — success, error, cancellation, and host disposal alike.

## Integration

### Chat turn

```typescript
// ChatRuntime, when a turn starts
const handle = this.scopes.register({
  kind: 'chat.turn',
  scopes: [{ kind: 'topic', id: topicId }],
  cancel: () => activeTurn.abortController.abort(),
  settled: turnSettled
})
// every terminal path
handle.release()
```

The Live Activity and the keep-alive lease need no separate registration: they are owned by the
turn, so aborting the turn releases them through the paths that already exist
(`clearTopic` → `session.cancel()` → lease release). The coordinator guarantees they are gone by
awaiting `settled`, not by knowing what they are.

### Painting job

```typescript
// the painting.generate handler, at execution start
const handle = this.scopes.register({
  kind: 'job.painting.generate',
  scopes: [{ kind: 'painting', id: input.paintingId }],
  cancel: () => this.jobRuntime.cancel(jobId, 'painting-deleted'),
  settled: executionSettled
})
```

### Data API handlers

```typescript
// DELETE /paintings
await coordinator.delete(
  ids.map((id) => ({ kind: 'painting', id }) as const),
  () => paintingService.deleteMany(ids)
)

// DELETE /messages/:id — the topic survives, so this invalidates
await coordinator.invalidate(
  [{ kind: 'topic', id: message.topicId }],
  () => messageService.delete(id)
)
```

This is the guarantee the current design lacks: every Data API caller gets cancellation, not just
the ones that remembered to call a frontend hook first. `onTopicsDeleted` is deleted once the topic
and message handlers route through the coordinator — renaming it or keeping it alongside would leave
two cleanup paths, which is the defect being removed.

## Correctness when the process is killed

The coordinator only works while the process lives. iOS and Android kill apps without running any
teardown, so it is one leg of four:

| Leg | Mechanism | Covers |
| --- | --- | --- |
| 1. In-process registry | This document | Active cancellation while the app runs |
| 2. Durable job ledger | SQLite rows are the source of truth; intent is persisted before irreversible work | Jobs resume, retry, or abandon on cold start |
| 3. Cold-start sweep | Live Activity `clearOrphans()`, crash-orphaned pending message repair | Native surfaces and rows that outlived the process |
| 4. Write-path guards | **Formalized here** | Late writes after the registry is gone |

Leg 4 exists today by accident and becomes a contract. Topics are soft-deleted, and the message
service's queries — including its write paths — filter on `isNull(deletedAt)`, so a late write
against a deleted topic already fails in most paths. Nothing tests that, so any SQL edit can
silently remove it.

The contract: **a write targeting a deleted resource must fail or no-op, never resurrect it.**
Guard tests delete the resource, then drive a late write, and assert nothing lands. Paintings are
hard-deleted, so their equivalent guard is an existence check when a receipt is persisted.

Legs 1 and 4 are complementary, not redundant: leg 1 makes deletion clean while the app is alive;
leg 4 makes it safe after the app has died and restarted.

## Boundaries

- **App shutdown does not use the coordinator.** Host teardown stops services in reverse dependency
  order and each owner drains its own operations — `ChatRuntime.dispose()` already aborts and awaits
  every turn. Two drain paths for one event would double-wait and double-report.
- **Registrations are per-process.** Anything needing cross-process recovery uses the durable job
  ledger. The registry is never persisted.
- **Manager-wide quiesce is not built.** Desktop's `pause()` + `drainInFlight()` exists for database
  snapshot/restore, hand-copied across `AiStreamManager` and `JobManager`. Mobile has no such
  feature, and the fence/drain contract here is per scope. If snapshot/restore ever lands, a
  manager-level hold is added then.
- **The coordinator stays domain-neutral.** It never learns what a topic is, never touches native
  surfaces, and never invalidates a React Query cache.
