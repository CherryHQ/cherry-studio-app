# Resource Scope Lifecycle

> Status: Built and wired (`src/backend/core/resources/`). It lives under `backend/core` because
> that is the only place all three backend sub-layers may import from, and it stays domain-neutral
> enough to belong there. Consumers: `ChatRuntime` (per task), `JobRuntime` (per execution, via
> `JobHandler.scopes`), and the topic/message/painting Data API delete routes.
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

export class ScopeDrainTimeoutError extends Error { readonly stragglers: readonly ActiveOperation[] }
export class ScopeFencedError extends Error { readonly scope: ResourceScope }
```

As built, a straggler and a live registration are reported with the same
`ActiveOperation` shape rather than through two identically-shaped types.

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

Registered per **task**, not per turn — `startTask` is the choke point. `finishTurn` awaits
`startNextPendingTurn`, so a queued steer or follow-up runs inside the same promise; registering per
turn would let a drain see the topic fall quiet between two turns of one continuous chain and delete
underneath it.

Cancelling clears the steer and follow-up queues before aborting. Abort alone ends the live turn but
leaves the queues, and there is a window where a topic is `continuing` with no active turn at all,
which abort treats as a silent no-op — either way the task would start a fresh turn the deletion
existed to prevent.

New-topic sends start under `NEW_TOPIC_SNAPSHOT_KEY` because the topic does not exist yet; the
handoff that re-keys the turn extends the registration to the created id.

The Live Activity and the keep-alive lease need no separate registration: they are owned by the
turn, so aborting the turn releases them through the paths that already exist
(`clearTopic` → `session.cancel()` → lease release). The coordinator guarantees they are gone by
awaiting `settled`, not by knowing what they are.

### Painting job

Declared on the handler, registered by the runtime:

```typescript
// paintingGenerateJobHandler
scopes: (input) => [{ id: input.paintingId, kind: 'painting' }]
```

`JobRuntime` prepares the execution and registers it before the guarded `pending → running` claim,
using its in-flight promise as `settled`. That closes the registration/claim race: deletion can fence
the scope before the first write, or synchronously abort a registered claim already in progress. The
promise resolves only after the terminal row is written, so a handler ignoring its signal fails the
drain rather than letting deletion proceed over it; if it later returns normally, the runtime's
post-execute abort fence still finalizes it `cancelled`. A job targeting an already-sealed scope is
finalized `cancelled` without being claimed or executed.

The registration is also the `paintingId → jobId` index. No such column exists, and none is needed:
the mapping only has to exist while the execution does.

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
the ones that remembered to call a frontend hook first.

`DELETE /assistants/:assistantId/topics` needs one extra step. Its cascade discovers the topic ids
inside its own write transaction, which is too late to cancel anything, so the route reads them
first through `TopicService.listIdsByAssistantId`. A topic created between that read and the
transaction is missed; the window is sub-millisecond and covered by leg 4, whereas cancelling inside
the transaction would deadlock the drain against it.

`onTopicsDeleted` — the hook quoted at the top — lives on the background-activity branch, not here.
It is deleted when that branch rebases onto this one: keeping it alongside would leave two cleanup
paths, which is the defect being removed.

## Correctness when the process is killed

The coordinator only works while the process lives. iOS and Android kill apps without running any
teardown, so it is one leg of four:

| Leg | Mechanism | Covers |
| --- | --- | --- |
| 1. In-process registry | This document | Active cancellation while the app runs |
| 2. Durable job ledger | SQLite rows are the source of truth; intent is persisted before irreversible work | Jobs resume, retry, or abandon on cold start |
| 3. Cold-start sweep | Live Activity `clearOrphans()`, crash-orphaned pending message repair | Native surfaces and rows that outlived the process |
| 4. Write-path guards | **Formalized here** | Late writes after the registry is gone |

Leg 4 exists today by accident and becomes a contract.

**Correction to this design's original premise.** It assumed topics were soft-deleted and that the
message service's write paths were held by `isNull(deletedAt)` filters. They are not. `deletedAt`
exists on the topic and message tables and is never written — only assistants are soft-deleted.
Topics and their messages are hard-deleted, and paintings are too.

So the mechanism is the cascade, not a tombstone filter. Deleting a topic removes its message rows,
and every write then either re-checks the topic (`create`,
`createUserMessageWithPlaceholders`, `delete`), re-checks its own row
(`finalizeAssistantMessage`, `update`, `createSibling`), or matches nothing
(`updateSiblingsGroupId`, `settleCrashedMessages`). Paintings are guarded by an existence check when
a receipt's outputs are persisted.

The contract is unchanged: **a write targeting a deleted resource must fail or no-op, never
resurrect it.** What changes is what the guard tests defend. They are in
`data/services/__tests__/deletedResourceWrites.integration.test.ts`, and they pin the cascade — so
introducing a real tombstone phase for topics, where the message rows survive their topic, would
fail them rather than silently opening the hole this leg exists to close.

Legs 1 and 4 are complementary, not redundant: leg 1 makes deletion clean while the app is alive;
leg 4 makes it safe after the app has died and restarted.

## Boundaries

- **App shutdown does not use the coordinator.** Host teardown stops services in reverse dependency
  order and each owner drains its own operations — `ChatRuntime.onStop()` already aborts and awaits
  every turn. Two drain paths for one event would double-wait and double-report.
- **Registrations are per-process.** Anything needing cross-process recovery uses the durable job
  ledger. The registry is never persisted.
- **Manager-wide quiesce is not built.** Desktop's `pause()` + `drainInFlight()` exists for database
  snapshot/restore, hand-copied across `AiStreamManager` and `JobManager`. Mobile has no such
  feature, and the fence/drain contract here is per scope. If snapshot/restore ever lands, a
  manager-level hold is added then.
- **The coordinator stays domain-neutral.** It never learns what a topic is, never touches native
  surfaces, and never invalidates a React Query cache.
