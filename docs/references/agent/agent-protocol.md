# Cherry Agent Protocol

Status: **design**. Version `1`.

This reference defines the Cherry Mobile-owned, transport-neutral application contract between the
Agent Client and the Mobile Agent Host. It spans frontend state, host orchestration, persistence
projection, transport, and rendering. It is deliberately **not** the API of the independent Agent
Runtime. Read [Agent Architecture](./README.md) for the thesis and
[Agent Runtime](./agent-runtime.md) for the execution boundary behind the host.

## 1. Scope and design rules

The protocol defines what a conversation *is* in Cherry Mobile. Everything else — which runtime
executes a turn, which SDK or remote process the runtime uses, and which component renders a part —
is an implementation choice behind or above the application boundary.

Six rules govern every definition in this document.

**R1 — JSON only.** Every command, event, and snapshot survives `JSON.parse(JSON.stringify(x))` and
re-validates against its zod schema. No `AbortSignal`, no `ReadableStream`, no `Error` instance, no
callback, no class. This is asserted in `__DEV__` on the in-process transport, so a violation fails
in development rather than the first time someone pairs a PC.

**R2 — Application-transport-safe.** Definitions do not rely on frontend and backend sharing object
identity. They remain valid if that application boundary later crosses a process or network. A LAN
or cloud Agent Runtime has its own independent contract behind the backend adapter; it does not
receive these envelopes directly.

**R3 — Addressable, incremental deltas.** Streaming content is addressed by stable part id and
applied as an append or patch. Re-sending an entire message per chunk is O(n²) serialization and
projection work and prevents the application boundary from moving cleanly across a process or
network later.

**R4 — Capabilities, never runtime identity.** Shared code branches on declared capabilities.
Runtime identity may be displayed for selection and diagnostics; it must not drive behavior.

**R5 — Fail closed.** An unsupported command, an unknown approval, a stale generation, or a
sequence gap produces an explicit protocol error. Nothing is silently ignored or approximated as
success.

**R6 — Persist a selective projection, not a remote mirror.** Session record mode decides which
facts Mobile may persist. A remote session carries compact records only for Mobile-initiated
executions. Remote-native turns are not imported, and raw execution detail is neither pushed
through the event stream nor written to Mobile storage.

### 1.1 Ownership and non-goals

The source owner is `src/shared/agent/protocol`. This is a Mobile-native shared domain because both
the frontend Agent Client and backend Agent Host consume it. It does not belong in
`src/shared/contracts`: that directory defines the existing in-process workflow seam and explicitly
excludes serialized envelopes and transport concerns. It also does not belong in
`packages/universal`, whose owner is desktop-mirrored portable data.

The protocol does not define `AgentRuntime`, runtime ports, runtime-native events, AI SDK projection,
or process-local execution handles. The Agent Host maps between this document and the independent
runtime contract. External Runtime implementations and their transports never consume the Mobile
application protocol directly.

## 2. Entities

### 2.1 Agent definition

Business identity. Runtime-independent, portable between runtime bindings.

```ts
type AgentDefinition = {
  id: string
  name: string
  description: string
  instructions: string
  model: ModelRef                 // { providerId, modelId }
  planModel?: ModelRef
  smallModel?: ModelRef
  tools: ToolPolicy[]             // { toolId, mode: 'auto' | 'ask' | 'deny' }
  skills: SkillRef[]
  knowledgeBases: KnowledgeBaseRef[]
  mcpServers: McpServerRef[]
}
```

A "plain assistant" is an `AgentDefinition` with no skills, no workspace, and the in-app binding.
There is no second configuration entity.

### 2.2 Runtime binding

How a definition executes.

```ts
type AgentRuntimeBinding = {
  agentId: string
  runtimeId: string               // implementation: 'ai-sdk' | 'codex' | 'claude' | …
  endpoint:
    | { kind: 'local'; endpointId: null }
    | { kind: 'lan' | 'cloud'; endpointId: string }
  generation: number              // increments on every rebind, never reused
  capabilities: AgentCapabilities
}
```

Runtime-specific configuration, credentials, and transport details are backend-private adapter
state. The application protocol exposes identity, location, generation, and capabilities only.

`generation` is the safety boundary. A continuation token, a warm connection, a pending approval,
or an in-flight turn is valid only for the exact `(sessionId, runtimeId, endpoint, generation)`
tuple that produced it. Rebinding closes the previous connection and discards its private state.
A `local-canonical` session may rebuild context from its complete Mobile record. A
`remote-canonical` session cannot rebuild from its compact projection; moving it to another
authority requires an explicit Runtime export/import capability or creates a new fork. Compact
history is never silently promoted into a complete execution record.

### 2.3 Session

The single conversation aggregate. There is no separate Topic entity.

```ts
type AgentSessionView = {
  id: string
  agentId: string
  title: string
  titleIsManual: boolean
  binding: {
    runtimeId: string
    endpoint: { kind: 'local' | 'lan' | 'cloud'; endpointId: string | null }
    generation: number
  }
  recordMode: 'local-canonical' | 'remote-canonical'
  workspaceId: string | null
  activeMessageId: string | null   // tip of Mobile's local projection, not the remote head
  status: 'idle' | 'running' | 'awaiting-approval' | 'cancelling'
  createdAt: string                // ISO 8601
  updatedAt: string
}
```

`recordMode` identifies authority, not transport. It is fixed when the session is created and is
persisted explicitly. In Mobile v2 a local endpoint creates `local-canonical`; LAN and cloud
endpoints create `remote-canonical`. Application code branches on `recordMode` when it chooses a
storage or detail-loading path, rather than assuming that every Runtime with a particular id has
the same deployment.

The two modes have different source-of-truth rules:

| Fact | `local-canonical` | `remote-canonical` |
| --- | --- | --- |
| Cherry-only metadata such as local id, pin/order, manual title, and binding | Mobile record | Mobile record |
| User input, final assistant output, and execution status | Mobile record | Remote record; selectively projected only for Mobile-initiated executions |
| Raw reasoning, tool/MCP input and output, command logs, traces | Mobile record when the product retains it | Remote execution store only |
| Detail shown after expansion | Read locally | Fetched through the backend adapter; held in memory only |

There is no conflict between two complete stores because a remote session has only one complete
execution record. Mobile remains authoritative for Cherry-only metadata and local UI state; the
remote service owns execution-derived transcript and detail facts. The Mobile projection may remain
incomplete and permanently stale after the user continues the same session on the remote PC.
For `remote-canonical`, `status`, `activeMessageId`, and `updatedAt` describe the last state Mobile
observed through its own executions, not the remote Session's current state.

Unifying assistant chat and agent session into one aggregate is the main deviation from the desktop
proposal, which keeps them physically separate. That separation is argued on migration grounds —
two shipped stores with incompatible invariants. In a clean build the objection largely dissolves: a
linear history is a tree that never branches, and the cost of carrying tree columns on a linear
session is two nullable fields plus one constraint. The benefit is that the desktop workaround —
a synthetic `agent-session:` topic namespace and a derived Topic view — cannot exist here, because
there is nothing to synthesize.

Branching is therefore a **capability** (§7), not a schema difference.

### 2.4 Turn

One admitted unit of execution.

```ts
type AgentTurnView = {
  id: string
  sessionId: string
  generation: number
  status: 'reserved' | 'running' | 'awaiting-approval' | 'completed'
        | 'cancelled' | 'failed' | 'interrupted'
  executions: AgentExecutionView[]   // one per target model; length 1 unless multiExecution
  startedAt: string
  endedAt: string | null
  error: AgentErrorView | null
}

type AgentExecutionView = {
  id: string
  messageId: string
  model: ModelRef
  status: 'pending' | 'streaming' | 'completed' | 'cancelled' | 'failed' | 'interrupted'
}
```

`interrupted` is a first-class terminal state, not a variant of `failed`. It means the host lost its
execution window — on mobile, the OS suspended JS mid-turn. It renders as resume-or-regenerate, not
as an error.

### 2.5 Message

```ts
type AgentMessageView = {
  id: string                        // UUIDv7, time-ordered
  sessionId: string
  turnId: string | null             // null for the session root
  parentId: string | null
  role: 'user' | 'assistant' | 'system' | 'root'
  status: 'streaming' | 'complete' | 'cancelled' | 'failed' | 'interrupted'
  parts: AgentMessagePart[]
  model: ModelRef | null
  siblingGroupId: string | null     // set for regenerate / multi-execution siblings
  usage: AgentUsageView | null
  timing: AgentTimingView | null
  createdAt: string
  updatedAt: string
}
```

Messages form an adjacency-list tree. `role: 'root'` is a single virtual root per session with
`parentId === null`; every other message has a non-null parent. A session with `branching: false`
never produces siblings, and its active path is a plain id-ordered scan.

### 2.6 Supporting entities

`AgentToolInvocationView`, `AgentApprovalView`, `AgentTaskView`, `AgentUsageView`,
`AgentArtifactView`, and runtime-private continuation metadata namespaced by `runtimeId` and
`generation`. Their shapes appear where they are used below.

## 3. Message parts

The part union is Cherry-owned, zod-validated, and shaped for Cherry's needs rather than mirroring
any SDK.

```ts
type AgentMessagePart =
  | AgentTextPart
  | AgentReasoningPart
  | AgentFilePart
  | AgentToolPart
  | AgentSourcePart
  | AgentDataPart
  | AgentErrorPart
```

Every part carries a stable `id`, unique within its message:

```ts
type AgentTextPart = {
  id: string
  type: 'text'
  text: string
  state: 'streaming' | 'done'
}

type AgentReasoningPart = {
  id: string
  type: 'reasoning'
  state: 'streaming' | 'done'
  summary?: string
  durationMs?: number
  detail:
    | { kind: 'inline'; text: string; signature?: string }
    | { kind: 'on-demand'; available: boolean }
    | { kind: 'none' }
}

type AgentFilePart = {
  id: string
  type: 'file'
  mediaType: string
  name?: string
  uri: string                       // cherry-file://<fileId> or https://
  sizeBytes?: number
}

type AgentToolPart = {
  id: string
  type: 'tool'
  toolCallId: string
  toolName: string                  // explicit field, never encoded in `type`
  source: 'builtin' | 'mcp' | 'provider'
  serverId?: string                 // for source: 'mcp'
  state: 'input-streaming' | 'input-available' | 'awaiting-approval'
       | 'executing' | 'output-available' | 'output-error' | 'denied'
  approvalId?: string
  summary?: string                   // safe compact label for transcript/search
  error?: AgentErrorView             // user-facing summary, never a raw remote error
  detail:
    | { kind: 'inline'; input?: unknown; output?: unknown }
    | { kind: 'on-demand'; available: boolean }
    | { kind: 'none' }
}

type AgentSourcePart = {
  id: string
  type: 'source'
  sourceType: 'url' | 'document'
  url?: string
  title?: string
  snippet?: string
}

type AgentDataPart = {
  id: string
  type: 'data'
  kind: string                      // 'code' | 'translation' | 'compact' | 'video' | vendor-namespaced
  payload: unknown                  // validated by a kind-specific schema
}

type AgentErrorPart = {
  id: string
  type: 'error'
  error: AgentErrorView
}
```

`detail` is a persistence boundary, not merely a rendering hint. A `local-canonical` session may
persist an `inline` tool detail. A `remote-canonical` session persists only `on-demand` or `none`;
its tool input, output, MCP payload, trace, shell log, and provider-native event never appear in a
snapshot, application event, SQLite row, search index, log field, or disk cache on Mobile.

The same rule applies beyond tools. A remote compact projection may retain user-visible prompts,
final assistant text, attachment metadata, artifact references, status, usage summary, timestamps,
and safe error summaries. It does not retain raw reasoning, full source bodies, terminal output,
debug traces, continuation state, remote file contents, or Runtime-native snapshots.

When a user expands a remote part, the frontend requests a detail view by Cherry ids:

```ts
type AgentPartDetailView = {
  sessionId: string
  messageId: string
  partId: string
  input?: unknown
  output?: unknown
  reasoning?: string
  log?: string
  error?: AgentErrorView
}
```

The backend resolves those ids through its private adapter mapping. The response is ephemeral UI
state: it is not merged into `AgentMessageView`, persisted, indexed, included in a snapshot, or
replayed as an event. Collapsing the part, leaving the screen, or backgrounding the app may discard
it.

Three deliberate departures from the AI SDK shape, each of which would be a painful migration later
and is free now:

**Explicit `toolName`.** The SDK encodes the tool name in the discriminant (`tool-${name}`). That
defeats a closed discriminated union, defeats runtime validation, and forces typed tool-renderer
routing to parse strings. A `toolName` field costs nothing and makes tool rendering a table lookup.

**Stable part ids.** The SDK addresses parts positionally in its UI stream. Positional addressing is
fine in a lossless in-process pipe and fragile over a network where a client may join mid-stream or
apply events out of a replay buffer. Ids make deltas addressable (§5.3) and idempotent-by-position
bugs impossible.

**`data` parts are a namespace, not a union arm each.** `AgentDataPart.kind` keeps the top-level
union closed and stable while letting product features add content types without a protocol version
bump. Each `kind` registers its own payload schema.

### 3.1 Input parts

Commands carry a narrower union — a client may not fabricate assistant content:

```ts
type AgentInputPart =
  | { type: 'text'; text: string }
  | { type: 'file'; mediaType: string; name?: string; uri: string }
```

## 4. Commands

```ts
type AgentCommand =
  // session
  | { type: 'session.create'; agentId: string; workspaceId?: string; title?: string }
  | { type: 'session.rename'; title: string }
  | { type: 'session.delete' }
  | { type: 'session.rebind'; runtimeId: string
      endpoint: { kind: 'local' | 'lan' | 'cloud'; endpointId: string | null } }
  // conversation
  | { type: 'message.submit'; parts: AgentInputPart[]; parentMessageId?: string
      models?: ModelRef[]; options?: AgentTurnOptions }
  | { type: 'message.edit'; messageId: string; parts: AgentInputPart[]; options?: AgentTurnOptions }
  | { type: 'message.delete'; messageId: string; cascade: boolean }
  | { type: 'branch.select'; throughMessageId: string }
  // turn
  | { type: 'turn.regenerate'; messageId: string; models?: ModelRef[]; options?: AgentTurnOptions }
  | { type: 'turn.steer'; turnId: string; parts: AgentInputPart[] }
  | { type: 'turn.queue'; parts: AgentInputPart[]; options?: AgentTurnOptions }
  | { type: 'turn.cancel'; turnId: string; executionId?: string }
  // tools and tasks
  | { type: 'approval.respond'; approvalId: string; decision: ApprovalDecision }
  | { type: 'task.stop'; taskId: string }

type AgentTurnOptions = {
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  mode?: 'auto' | 'fast' | 'plan'
}

type ApprovalDecision =
  | { approved: true; updatedInput?: Record<string, unknown> }
  | { approved: false; reason?: string }
```

Commands express user intent. None of them names a runtime or SDK operation, and none of them carries
a process-local handle — notably, **cancellation is a command, not an `AbortSignal`**. The Mobile
Agent Host translates the command to the runtime's cancellation API; the execution adapter owns any
`AbortController` internally.

`session.rebind` changes a Runtime binding only when the target preserves the session's
`recordMode` and authoritative record. A local record may reconstruct a compatible local Runtime;
a remote record may reconnect through another endpoint only when it still identifies the same
remote authority. Moving to a different authority is a separate export, import, or fork workflow
and is out of scope in protocol v1. Treating a compact projection as a complete transcript would
silently lose execution context, so the host rejects that transition.

For `remote-canonical`, `parentMessageId`, `activeMessageId`, `expectedRevision`, and the local
message tree describe Mobile's projection only. They are not concurrency guards for the remote
Session head. A subsequent Mobile command continues against the Runtime's current native context,
which may include PC-originated turns that Mobile has never observed.

### 4.1 Envelope

```ts
type AgentCommandEnvelope = {
  protocolVersion: number
  commandId: string            // client-generated, idempotency key
  sessionId: string            // absent only for session.create
  expectedGeneration?: number
  expectedRevision?: number
  issuedAt: string
  command: AgentCommand
}

type AgentCommandAck =
  | { ok: true; commandId: string; revision: number; sequence: number; result?: unknown }
  | { ok: false; commandId: string; error: AgentErrorView }
```

`commandId` idempotency is mandatory, not advisory. A flaky network plus a user tapping send twice
on a stalled spinner is the ordinary failure mode; a replayed `message.submit` must return the
original ack, not create a second turn. Hosts persist command receipts
([Agent Runtime §8](./agent-runtime.md#8-storage-boundary)) so idempotency survives a restart.

`expectedGeneration` guards against a command issued against a binding the user has since changed.
`expectedRevision` is used only where lost-update semantics matter — `message.edit`, `branch.select`,
`session.rename`.

### 4.2 On-demand detail query

Execution detail is a read, not a durable command and not an event subscription:

```text
GET /agent-sessions/:sessionId/messages/:messageId/parts/:partId/detail
  -> AgentPartDetailView
```

The route is part of the Mobile application boundary even when its current implementation is an
in-process Data API call. For `local-canonical`, the host reads the local record. For
`remote-canonical`, the adapter performs an authenticated HTTP request to the bound LAN or cloud
endpoint. The frontend never receives a remote URL, credential, or Runtime-native locator.

Remote responses use `Cache-Control: no-store`; the Mobile query layer does not persist them or
hydrate them into an offline cache. If the endpoint is offline, expired, or has deleted the detail,
the compact part remains renderable and the query returns an explicit unavailable error.

## 5. Events

```ts
type AgentEvent =
  | { type: 'session.updated'; session: AgentSessionView }
  | { type: 'session.deleted'; sessionId: string }
  | { type: 'turn.started'; turn: AgentTurnView }
  | { type: 'turn.updated'; turn: AgentTurnView }
  | { type: 'turn.completed'; turnId: string }
  | { type: 'turn.failed'; turnId: string; error: AgentErrorView }
  | { type: 'message.created'; message: AgentMessageView }
  | { type: 'message.delta'; messageId: string; delta: AgentPartDelta }
  | { type: 'message.finalized'; message: AgentMessageView }
  | { type: 'message.deleted'; messageId: string }
  | { type: 'approval.requested'; approval: AgentApprovalView }
  | { type: 'approval.resolved'; approval: AgentApprovalView }
  | { type: 'task.updated'; task: AgentTaskView }
  | { type: 'usage.updated'; messageId: string; usage: AgentUsageView }
```

### 5.1 Envelope

```ts
type AgentEventEnvelope = {
  protocolVersion: number
  epoch: string        // host instance identity
  sessionId: string
  generation: number   // runtime binding generation
  sequence: number     // monotonic per session, per epoch, gapless
  revision: number     // persisted-state revision after this event
  event: AgentEvent
}
```

### 5.2 `epoch` and `generation` are different

Both are required and conflating them produces a subtle class of bug.

`generation` changes when the **user rebinds** the session to another Runtime implementation or
endpoint. It scopes continuations, approvals, and connections.

`epoch` changes when the **host process restarts**. On mobile that is every cold start and every
background kill. A restarted host resumes its sequence counter at 1; a client holding sequence 400
would read the next events as a stale replay and discard them. With `epoch`, the mismatch is
detected on the first envelope and the client takes a fresh snapshot.

### 5.3 Deltas

```ts
type AgentPartDelta =
  | { op: 'add'; index: number; part: AgentMessagePart }
  | { op: 'append'; partId: string; text: string }        // text and inline reasoning only
  | { op: 'patch'; partId: string; patch: Record<string, unknown> }   // shallow merge
  | { op: 'remove'; partId: string }
```

Deltas are ephemeral — never persisted, never replayed from storage. Ordering and completeness are
guaranteed by the envelope's gapless `sequence`; a client that detects a gap reloads the snapshot
rather than attempting delta reconciliation. Mid-stream state is carried in the snapshot
(§6), so a client joining a running turn never needs the deltas it missed.

For `remote-canonical`, deltas exist only for a Mobile-initiated execution and contain compact
projection fields only. The host does not subscribe to the remote Session's global event stream.
Raw execution detail is not temporarily smuggled through
`message.delta`; it remains behind the detail query even while the turn is live.

This is the concrete replacement for whole-message overlays. Today's runtime republishes the entire
accumulated assistant message on every chunk, which is quadratic in serialized size and repeated
projection work.

### 5.4 Ordering guarantee

> A durable application-projection fact is persisted before its event is published.

`message.delta` is fire-and-forget. `message.finalized`, `turn.completed`, and `turn.failed` are
emitted only after the corresponding local record or compact projection is committed. A client that
observes `turn.completed` and immediately queries the transcript must find the terminal projection
already there. This ordering does not transfer authority for remote execution detail to Mobile.

Optimistic pre-persistence display is a client concern, expressed through
`turn.started` and `message.created` before content exists — not through publishing a terminal fact
early.

## 6. Snapshot and recovery

```ts
type AgentSessionSnapshot = {
  protocolVersion: number
  epoch: string
  session: AgentSessionView
  capabilities: AgentCapabilities
  activeTurn: (AgentTurnView & {
    streamingMessages: AgentMessageView[]   // accumulated-so-far, one per execution
  }) | null
  messages: AgentMessageView[]              // active branch window
  branchPoints: BranchPointView[]           // sibling counts for navigable nodes
  approvals: AgentApprovalView[]            // unresolved only
  tasks: AgentTaskView[]                    // active only
  queued: QueuedInputView[]
  generation: number
  revision: number
  lastSequence: number
}
```

Every message in a snapshot obeys `session.recordMode`. A local snapshot may contain inline detail;
a remote snapshot contains only Mobile's selective compact projection. It is not a snapshot of the
remote Session and need not include PC-originated turns. `AgentPartDetailView` is deliberately not
part of this type.

Recovery is one loop, identical over every transport:

1. Load the snapshot.
2. Subscribe from `lastSequence + 1`.
3. On an `epoch` mismatch, or a sequence gap the host cannot replay, discard local state and go
   to 1.

No frontend client inspects Runtime-native state to recover the application projection. For a
remote session, the Mobile Agent Host serves the cached compact snapshot as-is. It may resume a
Mobile-known unfinished execution by `executionId` and its per-execution cursor, but it never asks
for messages added elsewhere to the remote Session. Each recovered event for that known execution
arrives through normal application events. Detail is independent of recovery and remains on demand.

`activeTurn.streamingMessages` is what makes step 1 sufficient mid-turn: the host serves the
accumulated application projection, so a client joining at any moment gets the complete locally
renderable picture without replaying deltas. For a remote session this is still the compact picture,
not a copy of the remote execution log.

On mobile this loop is not an error path. It runs on every foreground transition.

## 7. Capabilities

One declaration per binding, enforced by the host and read by the UI.

```ts
type AgentCapabilities = {
  // conversation shape
  branching: boolean              // sibling messages, edit-and-resend, regenerate
  multiExecution: boolean         // one turn fanning out to several models
  followUpQueue: boolean
  // execution control
  steering: boolean
  cancellation: boolean
  detachedExecution: DetachedExecution   // can execution recover after the app connection goes away?
  // tools
  editableApprovalInput: boolean
  taskStop: boolean
  backgroundTasks: boolean
  autonomousTurns: boolean
  // context
  compaction: boolean
  contextUsage: boolean
  slashCommands: boolean
  // input
  attachments: { audio: boolean; image: boolean; pdf: boolean; video: boolean }
  modes: { auto: boolean; fast: boolean; plan: boolean }
}
```

`detachedExecution` is not a boolean, because on mobile the honest answer is "for a while":

```ts
type DetachedExecution =
  | { kind: 'none' }
  | { kind: 'bounded'; budgetMs: number; mechanism: string; userVisible: boolean }
  | { kind: 'unbounded' }
```

The Mobile Agent Host derives this value from the Runtime's recovery support, endpoint properties,
platform budget, and product policy. A LAN or cloud label alone never implies `unbounded`: the
Runtime must retain execution state and support resume or snapshot recovery.
[Runtime Ownership](../runtime-ownership.md#principles) already records that backgrounding is not a
reliable execution window, and
[Agent Runtime §9.2](./agent-runtime.md#92-execution-lifetime)
applies that constraint to local and remote execution.

A boolean would force the UI to lie in one direction or the other. The budget lets the composer say
"about 30 seconds after you leave the app" versus "keeps running, stop it from the notification"
versus "keeps running on your Mac" — which is the whole difference between a long-running agent a
user can trust and one that silently dies in their pocket.

Two enforcement rules:

- Shared components branch on capabilities, never on `runtimeId` (R4).
- **Client-side gating is UX. The host re-validates every command against the binding's
  capabilities**, because a remote client is untrusted input. An unsupported command returns
  `CAPABILITY_UNSUPPORTED`.

## 8. Errors

```ts
type AgentErrorView = {
  code: AgentErrorCode
  message: string             // already localized or localizable by key
  retryable: boolean
  details?: Record<string, unknown>
}
```

| Code | Meaning |
| --- | --- |
| `PROTOCOL_VERSION_UNSUPPORTED` | Host and client cannot negotiate a version |
| `COMMAND_INVALID` | Failed schema validation |
| `SESSION_NOT_FOUND` / `TURN_NOT_FOUND` | Unknown id |
| `SESSION_BUSY` | A turn is already active and the binding rejects concurrency |
| `GENERATION_MISMATCH` | `expectedGeneration` does not match the current binding |
| `REVISION_CONFLICT` | `expectedRevision` is stale |
| `CAPABILITY_UNSUPPORTED` | The binding does not declare the required capability |
| `APPROVAL_NOT_FOUND` / `APPROVAL_ALREADY_SETTLED` | Approval correlation failed |
| `RUNTIME_UNAVAILABLE` | Endpoint unreachable, unpaired, or not running |
| `RUNTIME_FAILED` | The runtime reported a terminal failure |
| `DETAIL_UNAVAILABLE` | On-demand detail is offline, expired, deleted, or not retained by the Runtime |
| `AUTHORITY_TRANSFER_UNSUPPORTED` | A rebind would change record mode or execution authority without an explicit transfer workflow |
| `CANCELLED` / `INTERRUPTED` | Terminal, non-error outcomes surfaced as turn results |
| `UNAUTHORIZED` | Pairing token invalid or revoked |
| `RATE_LIMITED` | Provider or host throttling; `details.retryAfterMs` |

An `Error` instance never crosses the boundary. Stack traces stay in host logs.
For a `remote-canonical` session, `details` is limited to explicitly allowlisted display metadata;
it never carries a native error, request body, tool payload, remote response, or stack trace.

## 9. Versioning

A single integer `protocolVersion`. Additive, optional fields do not bump it; removing a field,
narrowing a type, or changing a semantic does.

Negotiation happens once per connection: the host advertises `supportedVersions: number[]`, the
client picks the highest it also supports, and a failed negotiation is
`PROTOCOL_VERSION_UNSUPPORTED`.

The compatibility rule is asymmetric, and deliberately so:

- **Clients ignore unknown events and unknown part types.** A newer host must be able to add an
  event or a `data` part `kind` without breaking older clients. An unknown part renders as a
  neutral placeholder.
- **Hosts reject unknown commands.** Guessing at an intent the host does not implement is exactly
  the silent-downgrade failure R5 exists to prevent.

Unknown-part tolerance is why the part union is closed at the top level with an open `data`
namespace (§3): product features extend without a version bump, structural changes do not sneak in
without one.

## 10. Invariants

These are executable application-protocol conformance tests, run against every Mobile Agent Host
implementation and transport adapter. The independent runtime has a smaller execution-conformance
suite of its own. See [Agent Runtime](./agent-runtime.md#13-conformance) for the separation.

1. Every admitted turn reaches exactly one terminal outcome.
2. No content event is accepted for a turn after its terminal state.
3. Commands are idempotent by `commandId`, across host restarts.
4. Per session and epoch, `sequence` is gapless and strictly increasing.
5. A durable application-projection fact is persisted before its event is published.
6. `turn.cancel` and connection close are idempotent.
7. Approval decisions correlate to session, generation, turn, and tool call, and fail closed.
8. Runtime-private continuation state is never reused across a change of runtime, endpoint, or
   generation.
9. `session.rebind` closes the previous connection before activating the next generation.
10. An unsupported capability is rejected explicitly, never silently downgraded.
11. A client recovers the locally renderable projection from snapshot plus subsequent events alone.
12. A `local-canonical` session's complete record is authoritative in Mobile persistence; a
    `remote-canonical` session's execution record is authoritative at its bound Runtime endpoint,
    and its Mobile record is explicitly a compact projection.
13. Every envelope survives a JSON round trip and re-validates against its schema.
14. A turn settles as `interrupted` when its bound Runtime cannot continue or recover after the
    application loses its execution window; a recoverable detached execution remains resumable.
15. Cherry-owned autonomous, scheduled, and channel-triggered turns enter through the same command
    path as client-issued ones; remote-native PC activity is outside this rule.
16. Raw detail for a `remote-canonical` session is returned only by an explicit detail query and is
    never persisted, indexed, logged, snapshotted, or replayed by Mobile.
17. A session never changes record authority through ordinary `session.rebind`; an explicit
    transfer or fork must prove it has a complete source record.
18. A remote PC may continue or mutate its native Session without Mobile coordination. Mobile does
    not import those turns, and its selective projection is allowed to remain stale indefinitely.
19. Remote recovery is scoped to Mobile-known `executionId` values and per-execution cursors; it
    never enumerates or synchronizes the remote Session transcript.
