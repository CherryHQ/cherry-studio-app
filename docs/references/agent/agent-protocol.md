# Cherry Agent Protocol

> Status: as-built. Mobile Agent execution is device-local only.

This document defines the application contract between the Agent Client and the Mobile Agent Host.
It does not define the independent [Agent Runtime](./agent-runtime.md) behind the Host.

## Scope

The protocol owns the product meaning of an Agent Session: creating the Session, submitting a
message, observing a turn, cancelling it, responding to tool approval, and recovering UI state from
a snapshot.

Version 1 uses an in-process interface. Operation inputs, results, snapshots, and events are
JSON-safe values validated at the boundary. Subscription callbacks and unsubscribe handles are
process-local transport mechanics, not protocol data. JSON safety keeps application values
portable; this document does not define a network wire protocol.

Cloud control and LAN desktop control are separate product domains. They do not execute a Mobile
Agent, reuse its Session or definition, or extend `AgentExecutionTarget` with remote variants.

The approved future remote boundary preserves that distinction: a mobile-owned HTTP adapter calls
the remote service and maps its wire DTOs and events into a future versioned Agent Protocol
representation accepted by the application. The remote API is not this in-process interface, and
remote data remains authoritative on the service rather than being copied into the Mobile Agent
Host or its Session store. Version 1 does not yet accept, select, or route a remote source. See
[Agent Architecture](./README.md#approved-future-remote-boundary).

The protocol does not expose provider SDK objects, Runtime-native events, SQLite rows,
`AbortSignal`, streams, callbacks inside values, or implementation-specific Pi/provider-SDK state.

## Values

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

type AgentView = {
  id: string
  name: string
}

type AgentExecutionTarget = { kind: 'local' }

type AgentToolRef =
  | { source: 'builtin'; capabilityId: string }
  | { source: 'mcp'; serverId: string; rawToolName: string }

type AgentMessageToolRef = AgentToolRef | { source: 'meta'; name: string }

type AgentSessionView = {
  id: string
  agentId: string
  executionTarget: AgentExecutionTarget
  title: string
  titleIsManual: boolean
  forkedFromSessionId: string | null
  createdAt: string
  updatedAt: string
}
```

`executionTarget` expresses the Mobile Agent boundary, not implementation choice. It defines and
accepts only `local`, meaning this mobile app. Runtime ids and Pi/provider-SDK implementation
details never appear in protocol values.

`agentId` identifies the application-owned Agent configuration — the definition the user edits in the
application (instructions, model, tool-approval preference, and MCP extensions). That configuration
is live: before each turn, the Host resolves its current state and builds the Runtime execution
request from it, so an application-level edit applies from the next turn. Shared system
capabilities are not Agent configuration. The frontend selects web search per Session and snapshots
that selection into each submission, while image generation is selected by the submission that
needs it. Configuration never selects a different engine or device: `local` always means Pi running
in this mobile app. The client does not duplicate configuration or select an implementation.

### Turn

One submitted user input creates one turn and one assistant response.

```ts
type AgentTurnView = {
  id: string
  sessionId: string
  status:
    | 'running'
    | 'awaiting-approval'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
  assistantMessageId: string
  error: AgentErrorView | null
  startedAt: string
  endedAt: string | null
}
```

Version 1 has one execution per turn and at most one active turn per Session. It has no execution
entity, follow-up queue, steering, autonomous turn, or background task.

### Message

```ts
type AgentMessageView = {
  id: string
  sessionId: string
  turnId: string | null
  role: 'user' | 'assistant' | 'system'
  status: 'pending' | 'streaming' | 'success' | 'error' | 'cancelled' | 'interrupted'
  parts: AgentMessagePart[]
  usage: AgentUsageView | null
  modelId: UniqueModelId | null
  inferenceSnapshot: AgentInferenceSnapshotView | null
  createdAt: string
  updatedAt: string
}

type AgentMessagePart =
  | {
      id: string
      type: 'text' | 'reasoning'
      text: string
      state: 'streaming' | 'done'
    }
  | {
      id: string
      type: 'file'
      fileEntryId: string
      mediaType: string
      name?: string
      purpose: 'input-attachment' | 'artifact'
    }
  | {
      id: string
      type: 'tool'
      toolCallId: string
      toolRef: AgentMessageToolRef
      providerName: string
      displayName: string
      state:
        | 'input-available'
        | 'awaiting-approval'
        | 'running'
        | 'output-available'
        | 'denied'
        | 'error'
        | 'interrupted'
      input?: JsonValue
      output?: JsonValue
      approvalId?: string
      error?: AgentErrorView
    }
  | {
      id: string
      type: 'error'
      error: AgentErrorView
    }

type AgentUsageView = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

type AgentInferenceSnapshotV1 = {
  version: 1
  model: {
    uniqueModelId: UniqueModelId
    providerId: string
    modelId: string
    apiModelId?: string
    name: string
  }
  reasoningEffort?: string
  parameters: { temperature?: number; maxOutputTokens?: number }
  tools: Array<{
    ref: AgentToolRef
    providerName: string
    displayName: string
    approval: 'auto' | 'ask' | 'deny'
  }>
}

type AgentInferenceSnapshotView =
  | { status: 'supported'; snapshot: AgentInferenceSnapshotV1 }
  | { status: 'unsupported'; raw: JsonValue }
```

Part ids are stable within a message. The protocol owns these normalized parts; neither Pi nor a
provider SDK shape leaks through the boundary. Text parts may contain Markdown, but tool calls and
results remain structured protocol parts and are not flattened into display Markdown.

Every file part records a managed `fileEntryId` that existed when the part was written, together
with stable display metadata such as name and media type; protocol values never use absolute device
paths or transient import URIs as authority. The managed entry may later be deleted, in which case
the historical part remains visible but its content is unavailable. User input is imported before
submission. Before reservation, the Host verifies the live entry and managed blob, rejects client
metadata that differs from the entry, and persists the authoritative name and media type with
`purpose: 'input-attachment'`. A tool that produces an Office
document, image, or edited file keeps its structured tool result and also emits a part with
`purpose: 'artifact'` so the assistant message durably owns the reference. Artifact content is not
automatically projected as a model attachment in later history. See
[Agent Tools And Controlled Resources](./agent-tools-and-resources.md#tool-results-and-artifacts).

Current JPEG, PNG, GIF, and WebP inputs are admitted only when the authoritative entry and blob,
selected model capability, Pi endpoint adapter, and centralized request limits all pass before
reservation. Available historical user images are projected again for an image-capable model;
missing historical content is omitted without deleting or rewriting the message. The temporary
Data URL exists only inside the Host-to-Runtime request.

Text inputs accept authoritative `text/*` media types and an explicit application/source-code
media-type and extension allowlist. The Host reads managed bytes before reservation, accepts and
strips a leading UTF-8 BOM, rejects invalid UTF-8, NUL/binary controls, unsupported types, and
oversized current files, then projects a temporary structured Runtime part. Pi JSON-escapes that
part as untrusted user text with the authoritative name, media type, and `[complete]` or
`[truncated]` state; its body cannot alter the system/tool instruction layer or expand the Turn
resource ledger. Historical text read failures are omitted without rewriting the persisted file
part. Extracted text never enters protocol values or persistence.

`AgentToolRef` is the stable application capability identity used by configuration, approval,
snapshots, persistence, and audit. A message-only `meta` ref records a user-visible model-loop
activity such as catalog search without claiming that an application capability ran; meta refs
cannot enter configuration, approval, or inference snapshots. `providerName` is the deterministic
function alias used in model history; `displayName` is a snapshot for historical UI. For every
persisted tool call, `output-available`, `denied`, `error`, and `interrupted` are terminal states with
a paired normalized `RuntimeToolResult` JSON projection. No finalized message contains a tool left
in `input-available`, `awaiting-approval`, or `running`. A failed catalog dispatch persists only its
requested target name and normalized error, never unresolved parameters.

`usage` is populated only on assistant messages. The Host accumulates Runtime usage reports during
the turn and commits the final value together with the terminal message state, so
`message.finalized` and later transcript reads both carry it. While the message is streaming,
`usage` is `null`; there is no dedicated usage event.

Every accepted assistant placeholder carries the selected `modelId` and a versioned inference
snapshot committed in the same reservation transaction. The snapshot is Agent-owned and does not
reuse the Chat `MessageSnapshot`: it records only request model facts, explicit inference options,
and the frozen tool identity/policy catalog. It never records credentials, endpoints, headers,
tool schemas, callbacks, Data URLs, or device paths. A missing value is a pre-snapshot message and
stays `null`; an unknown or invalid persisted version is projected as `unsupported` with its raw
JSON preserved rather than making the message unreadable or reconstructing it from current Agent
configuration.

### Input and approval

```ts
type AgentInputPart =
  | { type: 'text'; text: string }
  | { type: 'file'; fileEntryId: string; mediaType: string; name?: string }

type AgentApprovalView = {
  id: string
  sessionId: string
  turnId: string
  toolCallId: string
  toolRef: AgentToolRef
  displayName: string
  input: JsonValue
  status: 'pending' | 'approved' | 'denied'
}

type AgentCapabilities = {
  reasoning: boolean
  tools: boolean
  approvals: boolean
  attachments: boolean
}
```

`assistant` remains the standard message role; the configurable product entity is always `Agent`.

Cancellation is required by the Runtime contract and is therefore not a capability flag.
Capabilities are a stable projection of what the Session's execution target and engine contract can
represent. `tools: true` means Pi supports tool-loop protocol parts; it does not mean the Agent has a
tool configured, that OS permission is granted, or that execution is approved. The Host resolves
those effective gates for every turn. The Agent Client may branch on protocol capabilities, never on
Runtime identity.

## Operations

```ts
interface AgentProtocol {
  renameSession(input: { sessionId: string; title: string }): Promise<AgentSessionView>
  deleteSession(input: { sessionId: string }): Promise<void>
  forkSession(input: {
    sessionId: string
    fromMessageId: string
    title?: string
  }): Promise<AgentSessionView>

  startSession(input: {
    agentId: string
    executionTarget: AgentExecutionTarget
    parts: AgentInputPart[]
    modelId?: UniqueModelId
    reasoningEffort?: ReasoningEffortOption
  }): Promise<AgentSessionView>

  submitMessage(input: {
    sessionId: string
    parts: AgentInputPart[]
    modelId?: UniqueModelId
    reasoningEffort?: ReasoningEffortOption
  }): Promise<{ turnId: string; userMessageId: string; assistantMessageId: string }>

  cancelTurn(input: { sessionId: string; turnId: string }): Promise<void>

  respondApproval(input: {
    sessionId: string
    turnId: string
    approvalId: string
    decision: 'approve' | 'deny'
  }): Promise<void>

  observeSession(
    sessionId: string,
    listener: (event: AgentEvent) => void,
  ): Promise<AgentSessionObservation>
}

type AgentSessionObservation = {
  snapshot: AgentSessionSnapshot
  unsubscribe(): void
}
```

`startSession` is the Draft-to-Session boundary. It performs the same write-free turn preparation
as `submitMessage`, opens the Runtime, and then atomically creates the durable Session together with
the first user message and assistant placeholder. A failed Draft submission therefore leaves no
empty Session. The client observes and navigates to the returned Session only after this operation
succeeds. The chat Draft does not create a Session directly.

`modelId` and `reasoningEffort` are immutable snapshots of the composer state for that submission.
The model snapshot closes the gap while the same selection is persisted to the Agent. The reasoning
snapshot is turn-local and is never written to Agent configuration. Omitting either field inherits
the Agent definition loaded for that turn; an explicit reasoning `default` uses the selected model's
default instead of the Agent's configured effort.

Capability enablement is Agent configuration, not submission state: the Agent record carries a
capability-group deny-list (`disabledCapabilities`), and the Host resolves it together with the
other system gates when it freezes the turn's tool snapshot. The assistant's inference snapshot
records the concrete tools frozen for the turn, so history does not depend on reconstructing
configuration state.

`forkSession` copies the transcript up to and including `fromMessageId` into a new idle Session,
and is the only operation that creates a Session from existing history. It is refused with
`SESSION_BUSY` while the source Session has an active turn, so the fork point is always a clean cut
(see [Branching](#branching)). The new Session is not observed by the operation; the client
navigates to it and observes it like any other Session.

`title` defaults to the source's. The client supplies it because a derived name is localized copy
and the Host has no locale: it resolves the app language only to tell a naming model which language
to write in, and never composes user-visible text itself.

`observeSession` registers the listener and captures the snapshot as one Host operation, so an
event cannot fall into a snapshot/subscription gap. Calling it again replaces stale frontend state;
the protocol does not need event sequence, host epoch, replay buffers, or revision counters in
version 1. Observation admission is serialized with Session deletion: an observation already
loading must finish or fail before rows are removed, and one overlapping the deletion barrier fails
with `SESSION_BUSY` rather than returning a snapshot for a deleted Session.

## Events

```ts
type AgentEvent =
  | { type: 'turn.updated'; turn: AgentTurnView }
  | { type: 'message.created'; message: AgentMessageView }
  | { type: 'message.delta'; messageId: string; delta: AgentMessageDelta }
  | { type: 'message.finalized'; message: AgentMessageView }
  | { type: 'approval.requested'; approval: AgentApprovalView }
  | { type: 'approval.resolved'; approval: AgentApprovalView }

type AgentMessageDelta =
  | { op: 'part.add'; index: number; part: AgentMessagePart }
  | { op: 'text.append'; partId: string; text: string }
  | { op: 'part.replace'; part: AgentMessagePart }
```

`text.append` applies only to text and reasoning parts. State changes replace the addressed part;
there is no untyped patch object.

Durable facts commit before their events publish. Streaming deltas are ephemeral; a fresh observer
gets the accumulated streaming message from the snapshot.

## Snapshot and recovery

```ts
type AgentSessionSnapshot = {
  agent: AgentView
  session: AgentSessionView
  capabilities: AgentCapabilities
  activeTurn: AgentTurnView | null
  activeUserMessage: AgentMessageView | null
  hasHistoryBeforeActiveTurn: boolean | null
  streamingMessage: AgentMessageView | null
  pendingApprovals: AgentApprovalView[]
}
```

Persisted transcript pagination remains a normal data read and is not duplicated in the runtime
snapshot. The snapshot contains only live state that must be composed over persisted messages. An
active turn includes its user row and whether older history precedes it, so a newly created
Session can render its first exchange immediately without waiting behind the history-layout cover.

On route remount or foreground transition, the client creates a new observation and replaces its
live projection with the returned snapshot. On process restart, the Host reconciles unfinished
local turns to `interrupted`, replaces their non-terminal tool parts with `interrupted` parts carrying
normalized results, and removes live approvals; version 1 does not resume execution.

## Errors

```ts
type AgentErrorView = {
  code:
    | 'AGENT_NOT_FOUND'
    | 'SESSION_NOT_FOUND'
    | 'MESSAGE_NOT_FOUND'
    | 'SESSION_BUSY'
    | 'CAPABILITY_UNSUPPORTED'
    | 'ATTACHMENT_INVALID'
    | 'ATTACHMENT_UNAVAILABLE'
    | 'ATTACHMENT_METADATA_MISMATCH'
    | 'APPROVAL_NOT_FOUND'
    | 'EXECUTION_UNAVAILABLE'
    | 'EXECUTION_FAILED'
    | 'CANCELLED'
    | 'INTERRUPTED'
  message: string
  retryable: boolean
  failure?: AgentFailureSnapshot
}

type AgentFailureSnapshot = {
  version: 1
  reasonCode:
    | 'auth'
    | 'permission'
    | 'region'
    | 'model_not_found'
    | 'quota'
    | 'rate_limit'
    | 'context_length'
    | 'payload_too_large'
    | 'network'
    | 'proxy_tls'
    | 'stream_interrupted'
    | 'content_filter'
    | 'provider_unavailable'
    | 'timeout'
    | 'invalid_input'
    | 'tool_limit'
    | 'tool_failed'
    | 'mcp'
    | 'parse'
    | 'internal'
    | 'unknown'
  source: {
    layer: 'provider' | 'runtime' | 'host' | 'tool'
    name?: string
    code?: string
  }
  context?: {
    statusCode?: number
    providerId?: string
    modelId?: string
    finishReason?: string
    responseBody?: string
  }
}
```

`EXECUTION_FAILED` remains the closed protocol envelope. New execution failures carry the
versioned `failure` snapshot so source identity is not overwritten by that envelope; the UI derives
localized copy from `reasonCode` and keeps the sanitized source message from the outer
`AgentErrorView` as detail. The outer `message` and `retryable` fields are the single authoritative
facts; the nested snapshot does not duplicate them. `failure` is optional so historical persisted
rows remain readable. Native errors, request bodies, credentials, and stack traces stay behind the
Host boundary.

## Invariants

1. A Session has at most one active turn.
2. An admitted submission reserves the user message and assistant placeholder before execution.
3. Every admitted turn reaches exactly one terminal state.
4. No content event is accepted after the turn becomes terminal.
5. Terminal message and turn state commit before terminal events publish.
6. Cancellation is idempotent and settles as `cancelled` or `interrupted`, not `failed`.
7. Approval responses correlate to the active Session, turn, and approval and fail closed.
8. A new observation is sufficient to reconstruct all live UI state.
9. Every protocol value survives a JSON round trip and re-validates against its schema.
10. The client supplies an execution target and Agent identity, never a Runtime identity.
11. Tool identity is a stable `AgentToolRef`; provider aliases and display names are not authority.
12. Every finalized tool call is terminal and reconstructs as a paired model tool call/result.
13. Every file part uses a managed id rather than a raw path; deleted content remains an unavailable
    historical reference, and artifact parts are not implicit model attachments.
14. A Draft Session becomes durable in the same transaction that reserves its first message pair.

## Branching

Agent Sessions do not branch in place. Chat-style sibling trees assume switching between
alternatives is harmless, but Agent turns have side effects — a tool call in one branch changes
the one real world that every branch would claim to share. In-place switching therefore
misrepresents history, and an active-path concept would touch nearly every invariant above.

Branching is instead a **fork**: `forkSession({ sessionId, fromMessageId })` creates a new Session
and copies the transcript up to the fork point inside one transaction. Turns and approvals are not
copied; the new Session starts idle. Because the Host already supplies complete normalized history
for every turn, a forked Session executes through the unchanged flow — the Runtime never knows a
fork happened. Regenerate and "try a different question" are forks from the relevant message
boundary.

Rules:

1. A fork point must be a clean cut: a message boundary whose turn is terminal. The Host rejects
   the operation outright while the source Session has an active turn, and the store rejects an
   anchor whose own row has not settled. Unsettled rows before the anchor are skipped rather than
   copied, so a fork never carries a placeholder that will never resolve.
2. Sessions record lineage so clients can present provenance. Only `forkedFromSessionId` is
   stored — enough to name and open the source. The fork point itself is not recorded: no surface
   asks which message a fork was cut at, and storing it would add a second column and a second
   dangling reference to reconcile. Lineage is a self-referencing `ON DELETE SET NULL` foreign
   key, so deleting the source clears the claim and leaves the fork intact.
3. Copied history keeps past tool calls and results verbatim. A fork opens a new future; it does
   not claim to undo executed side effects, and results in the copied transcript reflect the
   world at fork time. Copied messages keep their original `createdAt` for the same reason: the
   transcript shows when the conversation happened, not when it was copied.

Message editing is not implemented, and when it is it follows the same model. An edit-and-continue
operation creates a new Session, copies the clean transcript before the edited user message, inserts
the replacement input, and starts a new turn. It does not mutate an already-executed Agent history
in place, copy later assistant output, or claim to undo tool side effects. A display-only
annotation, if ever added, must be named separately and must not change model context.

Fork was an additive protocol extension: no existing operation, event, snapshot, or invariant
changed.

For the record, feeding a model from a tree is not the obstacle: model context is always a
linear message array, and linearizing an active path is a trivial parent walk (current Chat does
exactly this). The fork decision rests on the two costs that remain: an in-place branch switcher
presents divergent timelines as interchangeable views of one conversation, which is dishonest
once tool side effects exist, and an active-path selection is a new piece of mutable state that
every operation, snapshot, event, and invariant would have to carry.
