# Cherry Agent Runtime

Status: **design**. Version 1 is local-only.

The Agent Runtime is the independent execution boundary behind the Mobile Agent Host. Pi and the AI
SDK are separate implementations of this contract.

## Dependency rule

```text
Mobile Agent Host
    ↓ Agent Runtime Router
    ↕ Agent Runtime contract
Pi Runtime | AI SDK Runtime
```

The Runtime knows prepared prompts, models, history, tools, input, and normalized execution events.
It does not know Cherry Agent or Session entities, application commands or snapshots, SQLite,
Data API, React, Expo, navigation, or UI state.

The Host is the only adapter between the [Agent Protocol](./agent-protocol.md) and the Runtime. It
loads application data, invokes the Router, constructs the request, maps events, and persists the
result. The Router is Host-owned orchestration, not part of the Agent Runtime contract.

Runtime independence is enforced by imports and conformance, not by checking the directory name.
Promotion to a workspace package happens only when a real independent consumer exists.

## Runtime routing

The Agent Runtime Router is the single implementation-selection point:

```ts
type RuntimeRouteInput = {
  target: { kind: 'local' }
  agentToolIds: string[]
}

interface AgentRuntimeRouter {
  resolve(input: RuntimeRouteInput): AgentRuntime
}
```

The Host derives `agentToolIds` from the current Agent configuration; the client does not send this
derived field or a Runtime id. Version 1 routing is deliberately small:

| Execution target | Resolved Agent configuration | Runtime |
| --- | --- | --- |
| `local` | At least one Agent tool | Pi Runtime |
| `local` | No Agent tools | AI SDK Runtime |

The Router is the only component that branches on `pi` or `ai-sdk`. It resolves the selected
implementation through the Runtime registry and fails closed when no registered Runtime satisfies
the route. The selected route is fixed for an active turn; configuration changes are evaluated on
the next turn. If that changes the selected Runtime, the Host closes the old Runtime session before
opening the new one.

LAN and cloud may add execution-target variants and corresponding adapters later. They use this
same routing point, but version 1 does not define their markers, connections, authority, or fallback
behavior.

## Descriptor and lifecycle

```ts
type RuntimeDescriptor = {
  id: string
  name: string
  capabilities: RuntimeCapabilities
}

type RuntimeCapabilities = {
  reasoning: boolean
  tools: boolean
  approvals: boolean
  attachments: boolean
}

interface AgentRuntime {
  readonly descriptor: RuntimeDescriptor
  open(): Promise<AgentRuntimeSession>
}

interface AgentRuntimeSession {
  execute(request: RuntimeExecutionRequest): AsyncIterable<RuntimeEvent>
  cancel(turnId: string): Promise<void>
  respondApproval(input: {
    turnId: string
    approvalId: string
    decision: 'approve' | 'deny'
  }): Promise<void>
  close(): Promise<void>
}
```

The Host owns one `AgentRuntimeSession` for each active application Session. The Runtime session may
hold provider clients and execution-local state, but every `execute` request contains the complete
normalized context required for that turn.

`cancel` and `close` are required and idempotent. Version 1 permits only one active `execute` call
per Runtime session.

## Execution input

```ts
type RuntimeJsonValue =
  | null
  | boolean
  | number
  | string
  | RuntimeJsonValue[]
  | { [key: string]: RuntimeJsonValue }

type RuntimeExecutionRequest = {
  turnId: string
  instructions: string
  model: RuntimeModel
  history: RuntimeMessage[]
  input: RuntimeInputPart[]
  tools: RuntimeTool[]
  options: RuntimeOptions
}

type RuntimeModel = {
  providerId: string
  modelId: string
}

type RuntimeOptions = {
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  maxOutputTokens?: number
  temperature?: number
}

type RuntimeInputPart =
  | { type: 'text'; text: string }
  | { type: 'file'; mediaType: string; name?: string; uri: string }
```

Runtime implementations receive model/provider dependencies from application composition. They do
not query Cherry provider or model tables.

### History

```ts
type RuntimeMessage = {
  role: 'user' | 'assistant' | 'system'
  parts: RuntimeMessagePart[]
}

type RuntimeMessagePart =
  | { type: 'text' | 'reasoning'; text: string }
  | { type: 'file'; mediaType: string; name?: string; uri: string }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      input: RuntimeJsonValue
    }
  | {
      type: 'tool-result'
      toolCallId: string
      output: RuntimeJsonValue
      isError: boolean
    }
```

The Host converts persisted Cherry messages into this normalized history. Runtime-native messages
never become the application source of truth.

### Tools

```ts
type RuntimeTool = {
  name: string
  description: string
  inputSchema: RuntimeJsonValue
  approval: 'auto' | 'ask' | 'deny'
  execute(
    input: RuntimeJsonValue,
    context: { signal: AbortSignal; toolCallId: string },
  ): Promise<RuntimeJsonValue>
}
```

`inputSchema` is portable JSON Schema, not a provider-native schema object.

The Host supplies tool implementations after applying Agent policy. A Runtime validates tool input,
enforces the approval mode, and invokes `execute` only after approval when the mode is `ask`.

Tool callbacks and `AbortSignal` are allowed here because the Runtime contract is process-local.
They never cross the JSON-safe application protocol.

## Execution output

```ts
type RuntimeEvent =
  | { type: 'part.add'; index: number; part: RuntimeOutputPart }
  | { type: 'text.delta'; partId: string; text: string }
  | { type: 'part.replace'; part: RuntimeOutputPart }
  | { type: 'approval.requested'; approval: RuntimeApproval }
  | { type: 'approval.resolved'; approval: RuntimeApproval }
  | { type: 'usage'; usage: RuntimeUsage }
  | { type: 'completed' }
  | { type: 'failed'; error: RuntimeError }
  | { type: 'cancelled' }

type RuntimeOutputPart =
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
      input?: RuntimeJsonValue
      output?: RuntimeJsonValue
      approvalId?: string
      error?: RuntimeError
    }

type RuntimeApproval = {
  id: string
  turnId: string
  toolCallId: string
  toolName: string
  input: RuntimeJsonValue
  status: 'pending' | 'approved' | 'denied'
}

type RuntimeUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

type RuntimeError = {
  code: string
  message: string
  retryable: boolean
}
```

Every execution emits exactly one terminal event: `completed`, `failed`, or `cancelled`. No event
may follow it. Runtime-native errors are normalized and must not expose credentials or stack traces.

## Host execution flow

1. The Host validates that the Session is idle.
2. It persists the user message and assistant placeholder.
3. It loads the Session's execution target and resolves the current Agent configuration.
4. The Router selects a Runtime from the target and configured Agent tools.
5. The Host normalizes instructions, model, history, tools, input, and options.
6. The selected Runtime executes the prepared request.
7. The Host maps Runtime parts, approvals, usage, and terminal events into Agent Protocol state.
8. Terminal message and turn state commit before the Host publishes terminal protocol events.

The Runtime never writes application storage. The Host never interprets Pi- or AI-SDK-native events
outside the corresponding implementation.

## Runtime registry

Application composition registers implementations by descriptor id. The Router resolves its
decision through this registry. Agent and Session configuration do not store a selected
`runtimeId`; neither Runtime ids nor the registry are exposed through the Agent Protocol.

```text
pi      -> Pi AgentRuntime
ai-sdk  -> AI SDK AgentRuntime
```

Adding an implementation means registering another conforming Runtime and, when needed, adding one
Router policy. Shared Host workflow, protocol, persistence, and frontend code do not add a
Runtime-name branch.

## Execution lifetime

Route unmount does not own or cancel execution; the app-owned Host and Runtime session do. A
foreground transition creates a fresh protocol observation from the Host snapshot.

Local execution depends on the Mobile JavaScript process. If the process is suspended or killed and
the turn cannot reach a terminal event, startup reconciliation marks the persisted placeholder and
turn as interrupted. Version 1 has no resume API or background-execution guarantee.

## Conformance

Every Runtime implementation passes the same suite:

1. Descriptor id and capabilities are stable.
2. A valid request reaches exactly one terminal event.
3. No output follows a terminal event.
4. Text deltas and part replacements address existing stable part ids.
5. Unsupported input or tools fail before partial execution.
6. `cancel` is idempotent and causes the active turn to settle as cancelled.
7. Approval is requested only for an `ask` tool and correlates to the active turn and tool call.
8. Denied tools are never executed.
9. `close` is idempotent and releases provider, iterator, and tool resources.
10. Native errors are normalized without secrets or stack traces.
11. The implementation imports no application protocol, persistence, React, or Expo module.

The first conformance targets are the AI SDK Runtime and the Pi Runtime. A fake Runtime exercises
Host behavior without either implementation.
