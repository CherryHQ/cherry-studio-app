# Agent Statecharts And Invariants

This reference visualizes Cherry Mobile's highest-risk asynchronous state machines from the user's
perspective and enumerates the invariants verified automatically in CI. A single passing screenshot
cannot show which transitions are permitted or forbidden; review these statecharts alongside test
and device evidence when changing conversation streaming, tool approvals, or queued inputs.

## 1. Session Observation And Streaming Lifecycle

Owned by `AgentSessionChatClient` (`src/frontend/features/chat/runtime/AgentSessionChatClient.ts`).

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> observing: observe(sessionId)
    observing --> ready: snapshot installed + queued events replayed
    observing --> error: observe() rejected
    ready --> ready: live delta / message / queue / approval / turn event
    ready --> error: runtime.failed
    error --> observing: observe(sessionId) retry
    ready --> idle: last subscriber unsubscribes + dispose
    error --> idle: dispose
```

### Active Turn Transitions

```mermaid
stateDiagram-v2
    [*] --> idle_turn: no activeTurn
    idle_turn --> running: turn.updated(running)
    running --> running: message.created / text.append (coalesced flush) / part.replace
    running --> completed: turn.updated(completed)
    running --> failed: turn.updated(failed)
    running --> cancelled: turn.updated(cancelled)
    running --> interrupted: turn.updated(interrupted)
    completed --> idle_turn: turn.deleted / next turn
    failed --> idle_turn: turn.deleted / next turn
    cancelled --> idle_turn: turn.deleted / next turn
    interrupted --> idle_turn: turn.deleted / next turn
```

### Verified Invariants (Session & Streaming)

Automated randomized model check:
[AgentSessionChatClient.invariants.test.ts](../../../src/frontend/features/chat/runtime/__tests__/AgentSessionChatClient.invariants.test.ts).

| ID | Invariant | Forbidden State |
| --- | --- | --- |
| `I1` | **Lossless delta ordering:** Interleaving `text.append`, coalesced flush ticks, `part.add`, `part.replace`, and `message.finalized` preserves every streamed character in exact order. | Dropped, duplicated, or reordered assistant text chunks. |
| `I2` | **Terminal turn clears interactive gates:** Transitioning `activeTurn.status` to `completed`, `failed`, `cancelled`, or `interrupted` clears `pendingApprovals` to `[]` and `pendingQuestion` to `null`. | A settled turn still showing an actionable approval or question prompt. |
| `I3` | **Approval set uniqueness:** Repeated `approval.requested` events with the same `id` upsert rather than duplicate; `approval.resolved` removes only its own `id`. | Duplicate approval cards for one tool call, or resolving one approval clearing a sibling. |
| `I4` | **Deleted turn/message cleanup:** `turn.deleted` or `messages.deleted` removes affected rows from `liveMessages` and clears `activeTurn`, `pendingApprovals`, and `pendingQuestion` when the active turn is deleted. | Stale `activeTurn` pointing to a deleted assistant message. |
| `I5` | **Runtime failure fails safe:** `runtime.failed` transitions client `status` to `'error'` and clears `contextUsages` without throwing on subsequent cleanup or disposal. | Silent stale `ready` status after storage/runtime failure. |
| `I6` | **Zero leaked flush timers:** Finalizing a message or disposing the client cancels pending coalesced flush timers so advancing clocks triggers no phantom state updates. | Unflushed text resurrecting a finalized or disposed session. |

## 2. Tool Approval Policy And Gate

Owned by `src/shared/utils/agentToolApproval.ts` and `AgentSessionChatClient`.

```mermaid
stateDiagram-v2
    [*] --> pending: approval.requested
    pending --> pending: duplicate approval.requested (idempotent upsert)
    pending --> approved: approval.resolved(approved)
    pending --> denied: approval.resolved(denied)
    pending --> cancelled: approval.resolved(cancelled) or terminal turn
    approved --> [*]
    denied --> [*]
    cancelled --> [*]
```

### Verified Invariants (Policy Composition)

Exhaustive state-space check:
[agentToolApproval.invariants.test.ts](../../../src/shared/utils/__tests__/agentToolApproval.invariants.test.ts).

| ID | Invariant | Forbidden State |
| --- | --- | --- |
| `A1` | **Fail-closed deny monotonicity:** Explicit `deny` is never promoted to `ask` or `auto` under any Agent mode or eligibility flag. | Auto-mode overriding an explicit tool denial. |
| `A2` | **Third-party MCP floor:** `clampMcpToolApproval` never returns `auto`, even for legacy persisted `auto` rows. | Unsanctioned third-party MCP tool bypassing interactive approval. |
| `A3` | **Consent-gated eligibility:** When `autoApprovalEligible` is `false` (cost-bearing or OS permission-gated), `applyToolApprovalMode` never promotes `ask` to `auto`. | Silent auto-approval of permission- or cost-gated tools. |
| `A4` | **Idempotence:** Applying `clampMcpToolApproval` or `applyToolApprovalMode` repeatedly yields the same decision as applying once. | Repeated projection changing an approval outcome. |

## 3. Queued Follow-Up Input And Placement Reconciliation

```mermaid
stateDiagram-v2
    [*] --> empty_queue
    empty_queue --> queued: submit while busy -> queue.updated([item])
    queued --> empty_queue: cancelQueuedInput -> removed / queue.updated([])
    queued --> running_turn: cancelQueuedInput -> already-started (reconcile snapshot)
    queued --> running_turn: Host promotes queued item to activeTurn
```

- `isAgentSessionBusy(state)` remains `true` whenever `state.activeTurn` is non-terminal,
  `state.queuedInputs.length > 0`, or `state.isSubmitting === true`, and returns `false` once all
  three settle.

## 4. iOS Background Execution Leases

Owned by `IosBackgroundExecutionSource`
(`src/backend/services/keepAlive/IosBackgroundExecutionSource.ts`), verified across 50 seeded
randomized sequences in
[IosBackgroundExecutionSource.invariants.test.ts](../../../src/backend/services/keepAlive/__tests__/IosBackgroundExecutionSource.invariants.test.ts).

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> protected: acquire() while active/background
    protected --> protected: concurrent acquire() / idempotent release()
    protected --> idle: final lease release()
    protected --> interrupted: platform background expiry while backgrounded
    interrupted --> idle: final lease release() or dispose
```

| ID | Invariant | Forbidden State |
| --- | --- | --- |
| `K1` | **Zero leaked OS tasks:** Releasing every acquired lease returns `getStatus()` to `'idle'` and ends every started native background task. | Background execution or audio session left running after all work completes. |
| `K2` | **Idempotent release:** Calling `lease.release()` repeatedly never throws or underflows sibling leases. | Double release prematurely stopping another active task's protection. |
| `K3` | **Foreground safety:** An expiry event queued before returning to foreground (`AppState === 'active'`) never interrupts foreground holders. | Active foreground generation cancelled by a stale background-expiry callback. |
| `K4` | **Clean shutdown:** After `_doStop()`, `acquire()` degrades to a no-op and starts zero new native tasks. | Native background API calls after service teardown. |

## 5. Remote Session Read Cache Generation Fencing

Owned by `RemoteSessionReadCache`
(`src/backend/services/remoteAgent/RemoteSessionReadCache.ts`), verified across 60 seeded
randomized sequences in
[RemoteSessionReadCache.invariants.test.ts](../../../src/backend/services/remoteAgent/__tests__/RemoteSessionReadCache.invariants.test.ts).

| ID | Invariant | Forbidden State |
| --- | --- | --- |
| `R1` | **Generation fencing:** Writes with a stale `generation` (after `beginHistory`, `setEpoch`, or invalidation) never land in the cache. | Late in-flight network read overwriting newer transcript history. |
| `R2` | **Monotonic history versions:** `beginHistory` rejects strictly older versions without mutating `historyVersion` or `generation`. | History cache rolling backward on out-of-order responses. |
| `R3` | **Bounded byte budget:** Retained value bytes never exceed `policy.maxBytes`, and repeated `retain()` releases never underflow `active`. | Unbounded memory growth or negative refcounts. |
| `R4` | **Active entry retention:** Entries with `active > 0` remain findable past `idleMs` until released or invalidated. | Open conversation view losing its cache entry while mounted. |
