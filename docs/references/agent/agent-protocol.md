# Cherry Agent Protocol

Status: **as built**, including managed image resolution. Persisted tool configuration and text
attachment resolution remain separate follow-up work. Version 1 is local-only.

This document defines the application contract between the Agent Client and the Mobile Agent Host.
It does not define the independent [Agent Runtime](./agent-runtime.md) behind the Host.

## Scope

The protocol owns the product meaning of an Agent Session: creating the Session, submitting a
message, observing a turn, cancelling it, responding to tool approval, and recovering UI state from
a snapshot.

Version 1 uses an in-process interface. Operation inputs, results, snapshots, and events are
JSON-safe values validated at the boundary. Subscription callbacks and unsubscribe handles are
process-local transport mechanics, not protocol data. JSON safety keeps application values portable;
this document does not define a network wire protocol.

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

type AgentSessionView = {
  id: string
  agentId: string
  executionTarget: AgentExecutionTarget
  title: string
  titleIsManual: boolean
  createdAt: string
  updatedAt: string
}
```

`executionTarget` expresses application intent, not implementation choice. Version 1 defines and
accepts only `local`. Runtime ids and Pi/provider-SDK implementation details never appear in
protocol values.

`agentId` identifies the application-owned Agent configuration — the assistant/agent settings the
user edits in the application (instructions, model, tools). That configuration is live: before
each turn, the Host resolves its current state and builds the Runtime execution request from it,
so an application-level edit applies from the next turn. Configuration never selects a different
local engine: `local` always means Pi. The client does not duplicate configuration or select an
implementation.

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
      toolRef: AgentToolRef
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

`toolRef` is the stable application identity used by configuration, approval, persistence, and
audit. `providerName` is the deterministic function alias used in model history; `displayName` is a
snapshot for historical UI. For every persisted tool call, `output-available`, `denied`, `error`, and
`interrupted` are terminal states with a paired normalized `RuntimeToolResult` JSON projection. No
finalized message contains a tool left in `input-available`, `awaiting-approval`, or `running`.

`usage` is populated only on assistant messages. The Host accumulates Runtime usage reports during
the turn and commits the final value together with the terminal message state, so
`message.finalized` and later transcript reads both carry it. While the message is streaming,
`usage` is `null`; there is no dedicated usage event.

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
  createSession(input: {
    agentId: string
    executionTarget: AgentExecutionTarget
    title?: string
  }): Promise<AgentSessionView>
  renameSession(input: { sessionId: string; title: string }): Promise<AgentSessionView>
  deleteSession(input: { sessionId: string }): Promise<void>

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

`modelId` and `reasoningEffort` are immutable snapshots of the composer state for that submission.
The model snapshot closes the gap while the same selection is persisted to the Agent. The reasoning
snapshot is turn-local and is never written to Agent configuration. Omitting either field inherits
the Agent definition loaded for that turn; an explicit reasoning `default` uses the selected model's
default instead of the Agent's configured effort.

`observeSession` registers the listener and captures the snapshot as one Host operation, so an
event cannot fall into a snapshot/subscription gap. Calling it again replaces stale frontend state;
the protocol does not need event sequence, host epoch, replay buffers, or revision counters in
version 1.

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
  streamingMessage: AgentMessageView | null
  pendingApprovals: AgentApprovalView[]
}
```

Persisted transcript pagination remains a normal data read and is not duplicated in the runtime
snapshot. The snapshot contains only live state that must be composed over persisted messages.

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
    | 'SESSION_BUSY'
    | 'CAPABILITY_UNSUPPORTED'
    | 'ATTACHMENT_UNAVAILABLE'
    | 'ATTACHMENT_METADATA_MISMATCH'
    | 'APPROVAL_NOT_FOUND'
    | 'EXECUTION_UNAVAILABLE'
    | 'EXECUTION_FAILED'
    | 'CANCELLED'
    | 'INTERRUPTED'
  message: string
  retryable: boolean
}
```

Native errors and stack traces stay behind the Host boundary.

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

## Branching

Version 1 has no branching. The direction is decided (2026-08-20) so later work does not
reintroduce a message tree:

Agent Sessions do not branch in place. Chat-style sibling trees assume switching between
alternatives is harmless, but Agent turns have side effects — a tool call in one branch changes
the one real world that every branch would claim to share. In-place switching therefore
misrepresents history, and an active-path concept would touch nearly every invariant above.

Branching is instead a **fork**: a Host operation (for example
`forkSession({ sessionId, fromMessageId })`) creates a new Session and copies the transcript up
to the fork point inside one transaction. Turns and approvals are not copied; the new Session
starts idle. Because the Host already supplies complete normalized history for every turn, a
forked Session executes through the unchanged flow — the Runtime never knows a fork happened.
Regenerate and "try a different question" are forks from the relevant message boundary.

Rules for the eventual implementation:

1. A fork point must be a clean cut: a message boundary whose turn is terminal. Forking from a
   streaming message or an active turn is rejected.
2. Sessions record lineage (`forkedFromSessionId`, `forkedFromMessageId`, nullable; source
   deletion clears them) so clients can present provenance.
3. Copied history keeps past tool calls and results verbatim. A fork opens a new future; it does
   not claim to undo executed side effects, and results in the copied transcript reflect the
   world at fork time.

Message editing follows the same model. An edit-and-continue operation creates a new Session, copies
the clean transcript before the edited user message, inserts the replacement input, and starts a new
turn. It does not mutate an already-executed Agent history in place, copy later assistant output, or
claim to undo tool side effects. A display-only annotation, if ever added, must be named separately
and must not change model context.

This is an additive protocol extension: no existing operation, event, snapshot, or invariant
changes.

For the record, feeding a model from a tree is not the obstacle: model context is always a
linear message array, and linearizing an active path is a trivial parent walk (current Chat does
exactly this). The fork decision rests on the two costs that remain: an in-place branch switcher
presents divergent timelines as interchangeable views of one conversation, which is dishonest
once tool side effects exist, and an active-path selection is a new piece of mutable state that
every operation, snapshot, event, and invariant would have to carry.
