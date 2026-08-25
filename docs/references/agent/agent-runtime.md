# Cherry Agent Runtime

Status: **Pi Runtime active behind the Mobile Agent Host**. Version 1 is local-only.

The Agent Runtime is the independent execution boundary behind the Mobile Agent Host. Pi is the
only local implementation. AI SDK may remain an implementation detail of non-Agent services, but
it is not an Agent Runtime and does not own conversation or tool-loop state.

## Dependency rule

```text
Mobile Agent Host
    ↕ Agent Runtime contract
Pi Runtime
```

The Runtime knows prepared prompts, models, history, tools, input, and normalized execution events.
It does not know Cherry Agent or Session entities, application commands or snapshots, SQLite,
Data API, React, Expo, navigation, or UI state.

The Host is the only adapter between the [Agent Protocol](./agent-protocol.md) and the Runtime. It
loads application data, validates the local execution target, constructs the request, maps events,
and persists the result.

Runtime independence is enforced by imports and conformance, not by checking the directory name.
Promotion to a workspace package happens only when a real independent consumer exists.

## Local execution binding

Version 1 accepts only the `local` execution target. Application composition injects one Pi Runtime
directly into the Host. There is no Runtime registry, no implementation-selection Router, and no
persisted Runtime binding. Agent configuration, Session configuration, model selection, and tool
availability never select another local engine.

The Agent's application-owned instructions, model, and tools are resolved afresh for every turn.
The injected Pi Runtime remains stable for the Host lifetime.

## Production Pi binding

The production Host binds `local` directly to Pi and injects provider/model resolution through an
application adapter. The Runtime itself imports neither Expo transport nor application data
services. Current provider coverage is intentionally narrow: API-key-authenticated OpenAI Responses
endpoints. Unsupported endpoint or authentication types fail before partial execution; expanding
that adapter is follow-up work.

Pi receives the complete structured transcript and Agent inference options on each execution. It
maps text, reasoning, tool parts, approvals, cancellation, normalized failures, and cumulative
multi-call usage onto this contract. The Runtime tool loop is implemented, but the Host currently
supplies `tools: []` until the application-owned tool configuration model lands. Attachments remain
disabled pending Host-side file resolution.

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

Capabilities describe what the engine contract can represent. In particular, `tools: true` means
Pi can run a tool loop; it does not mean the current Agent has any tools configured. The Host derives
the effective tools for each turn, and the Pi model adapter separately checks whether the selected
model supports native tool calling.

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

File input is resolved by the Host before it reaches a Runtime: attachments enter the application's
file storage first, and the Host converts stored `file://` references into a directly consumable
`uri` (such as a data URL). A Runtime never reads the device filesystem; until the Host-side
resolution step lands (owned separately), local Runtimes declare `attachments: false` and reject
file parts before partial execution.

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

Text parts may contain Markdown, but the history is never flattened into one Markdown document.
Tool calls and results remain structured and paired by `toolCallId`; Pi needs those records to
continue a tool loop and to reconstruct later turns correctly.

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

The Host supplies an immutable tool snapshot after applying current Agent configuration, platform
availability, system permissions, and Agent policy. Configuration changes during execution apply to
the next turn, not the active one. A Runtime validates tool input, enforces the approval mode, and
invokes `execute` only after approval when the mode is `ask`.

`tools: []` is a complete and valid request: Pi performs ordinary conversation and the Host must not
leave stale tool instructions in the prompt. A non-empty snapshot enables Pi's model → tool → result
→ model loop. A call to a name absent from the snapshot fails closed with a normalized unavailable
tool result; a Runtime never looks up and executes an arbitrary application tool dynamically.

Tool configuration, OS permission, and execution approval are separate gates. A configured tool is
not automatically approved. If the snapshot is non-empty but the selected model cannot call tools,
the Pi Runtime rejects the turn with a normalized unsupported-tools failure before partial execution
instead of silently degrading to prompt-encoded pseudo calls.

When a tool call is denied — approval mode `deny`, or an `ask` approval resolved as deny — the
Runtime never invokes `execute`. It reports the tool part as `denied` and returns
`{ "status": "denied", "reason": "..." }` to the model as that call's result, so the loop
continues without the tool running. This feedback shape is a cross-implementation rule.

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

`usage` values are cumulative for the execution; the last report before the terminal event is
authoritative. A Runtime that cannot report usage emits no `usage` event, and the assistant
message's protocol `usage` stays `null`.

## Host execution flow

1. The Host validates that the Session is idle.
2. It persists the user message and assistant placeholder.
3. It validates that the Session target is `local` and resolves the current Agent configuration.
4. The Host uses its injected Pi Runtime.
5. The Host normalizes instructions, model, structured history, the immutable tool snapshot, input,
   and options.
6. The selected Runtime executes the prepared request.
7. The Host maps Runtime parts, approvals, usage, and terminal events into Agent Protocol state.
8. Terminal message and turn state commit before the Host publishes terminal protocol events.

The Runtime never writes application storage. The Host never interprets Pi-native events outside
the Pi implementation.

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

The production conformance target is the Pi Runtime. A fake Runtime exercises Host behavior without
Pi or a provider connection.
