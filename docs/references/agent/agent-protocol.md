# Cherry Agent Protocol

Status: **design**. Version 1 is local-only.

This document defines the application contract between the Agent Client and the Mobile Agent Host.
It does not define the independent [Agent Runtime](./agent-runtime.md) behind the Host.

## Scope

The protocol owns the product meaning of an Agent Session: creating the Session, submitting a
message, observing a turn, cancelling it, responding to tool approval, and recovering UI state from
a snapshot.

Version 1 uses an in-process interface. Operation inputs, results, snapshots, and events are
JSON-safe values validated at the boundary. Subscription callbacks and unsubscribe handles are
process-local transport mechanics, not protocol data.

The protocol does not expose provider SDK objects, Runtime-native events, SQLite rows,
`AbortSignal`, streams, callbacks inside values, or implementation-specific Pi/AI SDK state.

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

`executionTarget` expresses application intent, not implementation choice. Version 1 accepts only
`local`; LAN and cloud may add target variants after their authority and transport contracts are
designed. Runtime ids and Pi/AI SDK implementation details never appear in protocol values.

`agentId` identifies the application-owned Agent configuration. Before each turn, the Host resolves
that configuration, including its Agent tools, and passes the result to the Runtime Router. The
client does not duplicate configuration or select a Runtime.

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
      mediaType: string
      name?: string
      uri: string
    }
  | {
      id: string
      type: 'tool'
      toolCallId: string
      toolName: string
      state:
        | 'input-available'
        | 'awaiting-approval'
        | 'running'
        | 'output-available'
        | 'denied'
        | 'error'
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
```

Part ids are stable within a message. The protocol owns these normalized parts; neither Pi nor the
AI SDK shape leaks through the boundary.

### Input and approval

```ts
type AgentInputPart =
  | { type: 'text'; text: string }
  | { type: 'file'; mediaType: string; name?: string; uri: string }

type AgentApprovalView = {
  id: string
  sessionId: string
  turnId: string
  toolCallId: string
  toolName: string
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
The Host projects these values from the selected Runtime descriptor.
The Agent Client may branch on these protocol capabilities, never on Runtime identity.

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
local turns to `interrupted`; version 1 does not resume execution.

## Errors

```ts
type AgentErrorView = {
  code:
    | 'AGENT_NOT_FOUND'
    | 'SESSION_NOT_FOUND'
    | 'SESSION_BUSY'
    | 'CAPABILITY_UNSUPPORTED'
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
