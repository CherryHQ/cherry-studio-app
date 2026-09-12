# Resource Scope Lifecycle

> Status: as-built. The coordinator stays domain-neutral; its current production scope is painting
> jobs. Framework interfaces live in
> [lifecycle-overview.md](./lifecycle-overview.md).

## Purpose

Deleting a painting must terminate work that can still write to it. Frontend cancellation alone is
not sufficient because a Data API caller may delete the same resource from another surface.
`ResourceScopeCoordinator` therefore fences the resource, cancels registered work, waits for it to
settle, and only then performs the mutation.

The old Topic/Assistant/Message scopes were retired with the legacy Chat runtime and schema. Agent
Sessions own cancellation through `MobileAgentHost`; they are not resource-scope registrations.

## Model

```typescript
export type ScopeKind = 'painting'

export type ResourceScope = {
  readonly kind: ScopeKind
  readonly id: string
}

export type OperationRegistration = {
  /** Diagnostic identity, for example `job.painting.generate`. */
  readonly kind: string
  readonly scopes: readonly ResourceScope[]
  cancel(reason: CancelReason): void
  /** Resolves only after the operation has stopped and written terminal state. */
  readonly settled: Promise<unknown>
}
```

An operation registers before its first external side effect and releases its handle on every
terminal path. `register()` is the atomic gate; callers must not implement a separate pre-flight
fence check.

## Mutation Sequence

`delete()` and `invalidate()` run the same ordered steps:

```text
1. Fence      reject new registrations for every target scope
2. Cancel     invoke each overlapping operation once
3. Drain      await all settled promises within the configured ceiling
4. Mutate     run the caller's persistence mutation
5. Settle     seal a deleted scope, or reopen an invalidated scope
```

- A drain timeout raises `ScopeDrainTimeoutError`; the mutation does not run and the scope reopens.
- A mutation failure propagates; an invalidated scope reopens and a failed delete remains fenced.
- A throwing canceller is logged and skipped so one callback cannot strand the whole pass.
- Cancellation and draining happen before any write transaction opens. A cancelled operation may
  need the same serialized SQLite writer for its terminal write, so cancelling inside a transaction
  would deadlock.

## Painting Integration

The painting generation handler declares its scope:

```typescript
scopes: (input) => [{ id: input.paintingId, kind: 'painting' }]
```

`JobRuntime` registers the execution before its guarded `pending -> running` claim and uses the
in-flight promise as `settled`. A painting deletion routes through `coordinator.delete()` before
`PaintingService.deleteMany()`. This closes both the registration/claim race and late output-write
race without adding a `paintingId -> jobId` database index.

## Process Death

The registry is process-local. Crash safety therefore uses complementary mechanisms:

| Mechanism | Covers |
| --- | --- |
| In-process scope registry | Active cancellation while the app runs |
| Durable job ledger | Resume, retry, or abandon work after restart |
| Cold-start sweep | Native Activity surfaces that outlived the process |
| Write-path guards | Late output writes after their painting was deleted |

The write contract is: a write targeting a deleted painting fails or becomes a no-op; it never
recreates the resource.

## Boundaries

- Host shutdown does not use the coordinator. Reverse dependency teardown drains `JobRuntime`
  before SQLite closes.
- Registrations are never persisted; cross-process recovery belongs to the job ledger.
- The coordinator knows only scope keys and operation callbacks. It does not touch native surfaces,
  navigate, or invalidate React Query caches.
