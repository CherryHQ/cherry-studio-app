# Cherry Agent Runtime

> Status: as-built. Mobile Agent execution is device-local only.

The Agent Runtime is the independent execution boundary behind the Mobile Agent Host. Pi is the
only local implementation. AI SDK may remain an implementation detail of non-conversation
model-capability services called through application-owned tools, but it is not an Agent Runtime and
does not own conversation or tool-loop state.

## Dependency rule

```text
Mobile Agent Host
    ↕ Agent Runtime contract
Pi Runtime
    ↕ RuntimeTool callback
Application capability adapter → device / MCP / AI SDK / managed files
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

Mobile Agent accepts only the `local` execution target. Application composition injects one Pi
Runtime directly into the Host. There is no Runtime registry, no implementation-selection Router,
and no persisted Runtime binding. Agent configuration, Session configuration, model selection, and
tool availability never select another engine or execution device. Cloud and LAN desktop control
use a separate execution domain.

Future remote Agent support does not add a `RemoteRuntime` to this process. A mobile-owned HTTP
adapter sits at the application-protocol boundary, converts the remote service's wire data into
Agent Protocol values, and leaves execution and authoritative Session state on the remote service.
The local Host never turns remote tools into `RuntimeTool` callbacks. See
[Agent Architecture](./README.md#approved-future-remote-boundary).

The Agent's instructions, model, and MCP bindings, plus application-owned system capabilities, are
resolved afresh for every turn. Mobile Skill persistence and prompt projection are not implemented;
their target boundary is documented separately and does not change the current Runtime input. The
injected Pi Runtime remains stable for the Host lifetime.

## Production Pi binding

The composition root binds the `AgentRuntime` registration to Pi and injects it into the Host;
provider/model resolution enters through an application adapter. The Host never constructs a
Runtime. The Runtime itself imports neither Expo transport nor application data
services. Current provider coverage includes API-key-authenticated Anthropic Messages, Google
Generate Content, OpenAI Chat Completions, and OpenAI Responses endpoints. Unsupported endpoint,
non-standard adapter family, or authentication types fail before partial execution.

Pi receives the grouped structured transcript, an optional opaque context checkpoint, a frozen tool
catalog, and Agent inference options on each execution. It maps text, reasoning, tool parts,
approvals, cancellation, normalized failures, and cumulative multi-call usage onto this contract.
Before reservation, the Host combines the shared system catalog and the Agent's capability-group
deny-list with the Agent's persisted, currently executable MCP bindings. It also resolves bounded
managed images for registry-declared image-capable models supported by the selected Pi endpoint
adapter, plus bounded UTF-8 managed text as untrusted user content.

The repository patches expose `pi-agent-core/compaction` and its exact RN-safe Pi AI utility
subpaths. Short conversations retain the complete-history path. Long conversations reuse or
incrementally update a Runtime checkpoint before the first provider turn.

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
  preflightModel(model: RuntimeModel): Promise<RuntimeModelPreflight>
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

`RuntimeModelPreflight` is a narrow, JSON-safe projection of input modalities, context/input/output
limits, and native tool support. The Host calls it before reservation; provider SDK model objects,
credentials, endpoints, and headers remain private to the Runtime adapter. Pi preflight and final
model resolution read the same mobile model/provider services and enforce the same endpoint rules.

Capabilities describe what the engine contract can represent. In particular, `tools: true` means
Pi can run a tool loop; it does not mean any effective tool will enter the turn. The Host derives
the effective tools from system and Agent-owned inputs, and the Pi model adapter separately checks
whether the selected model supports native tool calling.

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

type RuntimeToolRef =
  | { source: 'builtin'; capabilityId: string }
  | { source: 'mcp'; serverId: string; rawToolName: string }

type RuntimeMessageToolRef = RuntimeToolRef | { source: 'meta'; name: string }

type RuntimeArtifact = {
  ref: { kind: 'managed-file'; fileEntryId: string }
  mediaType: string
  name: string
  kind: 'created' | 'derived'
}

type RuntimeToolResult = {
  value: RuntimeJsonValue
  artifacts: RuntimeArtifact[]
}

type RuntimeToolCall = {
  input: RuntimeJsonValue
  signal: AbortSignal
  toolCallId: string
}

type RuntimeExecutionRequest = {
  turnId: string
  instructions: string
  model: RuntimeModel
  history: RuntimeHistoryTurn[]
  contextCheckpoint: RuntimeContextCheckpoint | null
  input: RuntimeInputPart[]
  tools: RuntimeTool[]
  options: RuntimeOptions
}

type RuntimeModel = {
  providerId: string
  modelId: string
}

type RuntimeOptions = {
  reasoningEffort?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  maxOutputTokens?: number
  temperature?: number
}

type RuntimeInputPart =
  | { type: 'text'; text: string }
  | {
      type: 'text-attachment'
      mediaType: string
      name: string
      text: string
      truncated: boolean
      trust: 'untrusted-user-content'
    }
  | { type: 'file'; mediaType: string; name?: string; uri: string }
```

Runtime implementations receive model/provider dependencies from application composition. They do
not query Cherry provider or model tables.

The Host resolves protocol-level turn snapshots before this boundary. `default` and the current Pi
`auto` fallback become an absent `reasoningEffort`, while `none` becomes `off`; Runtime
implementations therefore receive only an executable effort level.

File input is resolved by the Host before it reaches a Runtime: attachments enter the application's
file storage first, `AgentInputPart` carries the resulting `fileEntryId`, and the Host validates the
live entry and managed blob before message reservation. The Host authorizes tools from managed ids
referenced by the current input and complete Session transcript, while it resolves attachment
content only for the current input and checkpoint-visible history. A Runtime never reads the device
filesystem. For supported images, the Host enforces the shared JPEG/PNG/GIF/WebP whitelist plus
at most 9 images, 10 MiB per file, 20 MiB total, and a conservative context reserve of 4,096 input
tokens per image plus 1,024 tokens for text. This remains the Host's current-input admission ceiling;
S2b separately includes image costs in Pi compression-trigger estimates. The Host then reads a
temporary Data URL after reservation. Cancellation aborts that read boundary and late content is
discarded. Current image read failure settles the reserved turn; missing historical content is
omitted while its persisted reference remains.

For text, the Host accepts `text/*` and an explicit application/source-code allowlist cross-checked
by filename extension. It reads at most 1 MiB per current file before reservation, accepts and strips
a leading UTF-8 BOM, rejects invalid UTF-8, NUL, and binary controls, then emits at most 200,000
Unicode code points per file and 400,000 across all model-visible text attachment occurrences. The
temporary Runtime part keeps body, authoritative metadata, truncation, and the
`untrusted-user-content` trust label structurally separate. Pi JSON-escapes that part only while
adapting it to ordinary user message text, so attachment data cannot become system instructions or
forge its boundary metadata. Pi's current-input/history estimator counts the resulting text
alongside images, tool schemas, the output reserve, and the safety margin. Exact attachment bodies
are redacted if a compaction model reproduces them in a persisted checkpoint.

Neither Data URLs, extracted text, nor device URIs enter protocol values, SQLite, snapshots, or
logs. Tool-side access follows the stricter managed-id ledger in
[Agent Tools And Controlled Resources](./agent-tools-and-resources.md#controlled-file-ledger).

### History

```ts
type RuntimeHistoryTurn = {
  turnId: string | null
  messages: RuntimeMessage[]
}

type RuntimeMessage = {
  role: 'user' | 'assistant' | 'system'
  parts: RuntimeMessagePart[]
  usage?: RuntimeUsage
}

type RuntimeMessagePart =
  | { type: 'text' | 'reasoning'; text: string }
  | {
      type: 'text-attachment'
      mediaType: string
      name: string
      text: string
      truncated: boolean
      trust: 'untrusted-user-content'
    }
  | { type: 'file'; mediaType: string; name?: string; uri: string }
  | {
      type: 'tool-call'
      toolCallId: string
      toolRef: RuntimeMessageToolRef
      providerName: string
      input: RuntimeJsonValue
    }
  | {
      type: 'tool-result'
      toolCallId: string
      output: RuntimeToolResult
      isError: boolean
    }

type RuntimeContextCheckpoint = {
  version: 1
  anchorTurnId: string
  payload: RuntimeJsonValue
}
```

The Host converts persisted Cherry messages into normalized history grouped by their durable Turn.
Rows without a Turn id retain a `null` group id and cannot be checkpoint anchors. Runtime-native
messages never become the application source of truth. User attachment parts may become Runtime
file parts; assistant artifact parts remain application-visible managed references and are not
automatically inlined into model history. Pi accesses their content only through a controlled
read/inspect tool or after the user explicitly attaches the managed entry again.

Text parts may contain Markdown, but the history is never flattened into one Markdown document.
Tool calls and results remain structured and paired by `toolCallId`; Pi needs those records to
continue a tool loop and to reconstruct later turns correctly.

The optional checkpoint is a Runtime-produced context artifact, not Runtime identity or resumable
session state. The Host does not inspect `payload`; it validates version 1, verifies that
`anchorTurnId` belongs to the Session, and enforces a 256 KiB serialized payload limit. With a valid
checkpoint, the request carries complete Turn groups after the anchor. With no checkpoint—or an
invalid, incompatible, oversized, or orphaned candidate—the Host supplies the entire grouped
history. Pi owns all later selection, formatting, and compaction policy.

Pi estimates history with `pi-agent-core` provider usage when the last persisted assistant usage is
available and otherwise uses its conservative message estimator. The adapter adds system
instructions, current input, tool schemas, image reserves, requested output, and a fixed safety
margin before calling Pi's `shouldCompact`. A current input whose fixed costs alone exceed the
window fails before the first model call.

On compaction, Pi owns the cut point, `previousSummary` merge, retained tail, and split-turn prefix
summary. Checkpoint payloads store the redacted summary and an optional structural resume cursor;
they do not duplicate attachment bodies or raw retained tool results. Anchors remain complete
durable Turns. A split-turn cursor reconstructs the retained suffix from the Host-supplied complete
Turn so tool calls and results remain paired after restart. Summary calls reuse the current model
transport, credentials, timeout, and cancellation signal, and their usage is added to the active
Turn.

Initial compaction is not the last admission check. Before Pi continues after a tool batch, the
Runtime re-estimates the live assistant request and tool-result messages together with system,
tool-schema, attachment, output, and safety reserves. A continuation that no longer fits stops as
`context_window_exceeded` before another provider request. Model-only catalog results additionally
consume this live headroom while they are produced.

### Tools

```ts
type RuntimeTool = {
  ref: RuntimeToolRef
  providerName: string
  displayName: string
  description: string
  inputSchema: RuntimeJsonValue
  approval: 'auto' | 'ask' | 'deny'
  execute(call: RuntimeToolCall): Promise<RuntimeToolResult>
}
```

`ref` is the stable application identity used by approval and audit, and by MCP persistence.
`providerName` is the deterministic catalog alias by which a Runtime identifies the tool. A Runtime
may expose that alias as a direct model function or as the exact target name accepted by a private
model-binding tool; that encoding never changes the tool's `ref`, approval, input, or persisted
identity. `displayName` is a historical UI snapshot. `inputSchema` is portable JSON Schema, not a
provider-native schema object.

The Host supplies an immutable tool snapshot after applying the system catalog, the Agent's
capability-group deny-list, current Agent MCP configuration, platform availability, system
permissions, and application policy. Changes during execution apply to the next turn, not the active one. A Runtime
validates tool input, enforces the approval mode, and invokes `execute` only after approval when the
mode is `ask`.

`tools: []` is a complete and valid request: Pi performs ordinary conversation and the Host must not
leave stale tool instructions in the prompt. A non-empty snapshot enables Pi's model → tool → result
→ model loop. A call to a name absent from the snapshot fails closed with a normalized unavailable
tool result; a Runtime never looks up and executes an arbitrary application tool dynamically.

Tool configuration, OS permission, and execution approval are separate gates. A configured tool is
not automatically approved. If the snapshot is non-empty but the selected model cannot call tools,
the Host rejects admission before reserving messages; Pi repeats the check before execution as a
defensive boundary instead of silently degrading to prompt-encoded pseudo calls.

When a tool call is denied — approval mode `deny`, or an `ask` approval resolved as deny — the
Runtime never invokes `execute`. It reports the tool part as `denied`, persists
`{ "value": { "status": "denied", "reason": "..." }, "artifacts": [] }` as its output, and
returns that envelope to the model as the call's result, so the loop continues without the tool
running. This feedback shape is a cross-implementation rule.

Runtime-generated failures use the same outer envelope. An `error` result uses
`value: { status: 'error', error: { code, message, retryable } }`; an `interrupted` result uses
`value: { status: 'interrupted', reason: '...' }`; both use `artifacts: []`. Startup reconciliation
uses that interrupted shape as well. Native errors, stack traces, and late callback results never
enter these envelopes.

Pi permits at most eight tool-loop steps and sixteen requested tool calls per turn. Calls beyond the
limit do not execute their callback and receive a classified error result; reaching either limit
stops the loop with a stable terminal failure. A whole turn is bounded to ten minutes. Cancellation
and timeout abort the model, approval waiters, and the callback signal before terminalizing live
tool parts. Streamable HTTP MCP callbacks add their own 60-second invocation bound.

Tool callbacks and `AbortSignal` are allowed here because the Runtime contract is process-local.
They never cross the JSON-safe application protocol.

A callback may close over a narrow application capability service. This is how Streamable HTTP MCP,
device capabilities, web access, image generation, and managed-file operations reach Pi without Pi
importing application or provider SDK modules. Image generation may use `AiService`,
`@cherrystudio/ai-core`, or AI SDK behind that callback; those dependencies still do not own the
conversation or tool loop. The current inventory lives in
[Agent Tools And Controlled Resources](./agent-tools-and-resources.md).

Every callback returns `RuntimeToolResult`. A non-artifact tool returns `artifacts: []`; an MCP
adapter wraps the remote payload in `value` and never interprets its shape as an artifact envelope.
A file-producing application capability creates and validates each managed entry before returning
its artifact ref. The Pi adapter gives the model the typed outer envelope, including bounded managed
refs but never artifact bytes, and also emits the artifacts as Runtime file parts for Host
projection. This preserves same-turn follow-up access without treating assistant artifact parts as
later model attachments. See
[Agent Tools And Controlled Resources](./agent-tools-and-resources.md#tool-results-and-artifacts).
Absolute paths and large base64 payloads are never tool results.

Mobile Skills are not resolved by the current Host. Their target contract keeps them as instruction
context that cannot change the tool snapshot, approval policy, OS permission, or turn resource
ledger. See [Agent Skills](./agent-skills.md).

## Execution output

```ts
type RuntimeEvent =
  | { type: 'part.add'; index: number; part: RuntimeOutputPart }
  | { type: 'text.delta'; partId: string; text: string }
  | { type: 'part.replace'; part: RuntimeOutputPart }
  | { type: 'approval.requested'; approval: RuntimeApproval }
  | { type: 'approval.resolved'; approval: RuntimeApproval }
  | { type: 'context.checkpoint'; checkpoint: RuntimeContextCheckpoint }
  | {
      type: 'usage'
      usage: RuntimeUsage
      context: RuntimeUsageContext
      completedAt: number
    }
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
      ref: { kind: 'managed-file'; fileEntryId: string }
      mediaType: string
      name: string
      purpose: 'artifact'
    }
  | {
      id: string
      type: 'tool'
      toolCallId: string
      toolRef: RuntimeMessageToolRef
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
      input?: RuntimeJsonValue
      output?: RuntimeToolResult
      approvalId?: string
      error?: RuntimeError
    }

type RuntimeApproval = {
  id: string
  turnId: string
  toolCallId: string
  toolRef: RuntimeToolRef
  displayName: string
  input: RuntimeJsonValue
  status: 'pending' | 'approved' | 'denied'
}

type RuntimeUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  noCacheTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

type RuntimeUsageContext = {
  providerId: string
  providerName: string | null
  modelId: string
  modelName: string | null
  pricingSnapshot: AiUsagePricingSnapshot | null
  trustProviderReportedCost: boolean
  reportedCostCurrency: Currency | null
  credentialReceipt: ServingCredentialReceipt
}

type RuntimeError = {
  code: string
  message: string
  retryable: boolean
  origin?: 'provider' | 'runtime' | 'host' | 'tool'
  name?: string
  context?: {
    statusCode?: number
    providerId?: string
    modelId?: string
    finishReason?: string
    responseBody?: string
  }
}
```

`RuntimeToolRef` identifies an executable application capability and remains the only ref accepted
by execution requests and approvals. `RuntimeMessageToolRef` additionally admits `meta` activity
such as catalog search: it is observable and replayable model-loop history, but it is not executable
through the Host capability catalog and never appears in an inference tool snapshot.

Every execution emits exactly one terminal event: `completed`, `failed`, or `cancelled`. Before a
terminal event, the Runtime settles every live tool part: denial includes the canonical denial
output envelope, tool failure includes a normalized error result envelope, and cancellation replaces
unfinished tool parts with `interrupted` and a normalized result envelope. No event may follow the
terminal event. Runtime-native errors are normalized and must not expose credentials or stack
traces. `code` and `name` retain the source identity when it is available; `context` is an
allowlisted, bounded snapshot. Messages and response bodies are credential-redacted before they
cross the Runtime boundary. Request bodies, URLs, headers, and stacks are never included.

Supported Pi Provider adapters attach a terminal diagnostic at the SDK catch boundary before the
assistant error reaches the Runtime. That diagnostic preserves only the original error identity,
HTTP status, bounded response body, and explicit retryability. The Runtime ignores diagnostics from
recovered transport attempts, then redacts and projects the terminal diagnostic into `RuntimeError`.
This keeps the original terminal failure distinct from an earlier WebSocket or stream fallback.

A `context.checkpoint` event is non-terminal. The Host retains only the latest valid candidate from
the active execution and commits it atomically with a successful assistant terminal result. Failed,
cancelled, or interrupted turns never persist a candidate, and oversized payloads are rejected
rather than truncated.

`usage` values are cumulative for the execution; the last report before the terminal event is
authoritative. Detailed cache and reasoning counts remain available for pricing even though the
Agent Protocol message projects only the input, output, and total counts. `context` is the immutable
provider, served-model, pricing, and credential-attribution snapshot captured when the provider is
resolved, before execution starts. `completedAt` is recorded at the Runtime provider boundary. The
Host adds the Agent source and Session message reference without re-reading mutable provider/model
configuration. It does not synthesize provider timing from the broader Host turn lifetime. A
Runtime that cannot report usage emits no `usage` event, and the assistant message's protocol
`usage` stays `null`.

## Host execution flow

1. The Host validates that the Session is idle.
2. It validates that the Session target is `local`, resolves the current Agent, public model facts,
   the latest checkpoint candidate, its Store-loaded history tail, and lightweight authorization
   indexes, then creates the turn resource ledger. Invalid candidates load the full history.
3. It freezes the immutable tool catalog against that ledger and builds the versioned,
   credential-free inference snapshot from the same model, options, and tools sent to the Runtime.
4. It preflights attachments and opens the injected Pi Runtime Session. Only after that succeeds
   does it atomically persist the user message and assistant placeholder with the selected model id
   and inference snapshot.
5. The Host normalizes instructions, model, grouped structured history after the checkpoint anchor,
   the immutable tool snapshot, input, and options.
6. The selected Runtime executes the prepared request.
7. The Host maps Runtime parts, approvals, usage, and terminal events into Agent Protocol state.
8. Terminal message and turn state commit before the Host publishes terminal protocol events. A
   transient terminal-write failure retries the same outcome; a persistently unwritable store makes
   that Host generation reject new submissions and leaves startup reconciliation to settle the
   durable placeholder.

The Runtime never writes application storage. The Host never interprets Pi-native events outside
the Pi implementation.

## Execution lifetime

Route unmount does not own or cancel execution; the app-owned Host and Runtime session do. A
foreground transition creates a fresh protocol observation from the Host snapshot.

Host shutdown closes submission admission before aborting both in-flight admission work and active
turns. Attachment reads and automatic naming generation inherit the same lifecycle cancellation
boundary; shutdown joins admissions before closing Runtime Sessions.

Local execution depends on the Mobile JavaScript process. If the process is suspended or killed and
the turn cannot reach a terminal event, startup reconciliation marks the persisted placeholder and
turn as interrupted and terminalizes every non-terminal persisted tool part as `interrupted`.
Version 1 has no resume API or background-execution guarantee.

History projection never sends an unanswered approval or another dangling tool call to Pi. A
persisted `denied`, `error`, or `interrupted` tool part contributes its paired normalized tool result;
an abandoned incomplete call without a durable result is omitted as a whole. This follows the PC
Agent invariant while keeping Mobile Version 1 non-resumable.

Context checkpoint replay also does not make a turn resumable. A restart interrupts active work as
before; only a checkpoint already committed with a successful assistant row may affect a later
fresh execution. The full transcript remains untouched and is the fallback when checkpoint
validation fails.

## Conformance

Every Runtime implementation passes the same suite:

1. Descriptor id and capabilities are stable.
2. A valid request reaches exactly one terminal event.
3. No output follows a terminal event.
4. Text deltas and part replacements address existing stable part ids.
5. Unsupported input or tools fail before partial execution.
6. `cancel` is idempotent and causes the active turn to settle as cancelled.
7. Approval is requested only for an `ask` tool and correlates to the active turn and tool call.
8. Denied tools are never executed and still produce a paired canonical result.
9. `close` is idempotent and releases provider, iterator, and tool resources.
10. Native errors are normalized without secrets or stack traces.
11. The implementation imports no application protocol, persistence, React, or Expo module.
12. Tool refs remain stable when display names or provider aliases change.
13. Artifact output contains validated managed refs, never absolute paths or unbounded inline bytes.
14. Cancellation and startup recovery leave no non-terminal tool part or dangling model-history call.
15. Skills cannot become executable capabilities or expand a turn's tool snapshot or resource ledger.
16. Image preflight happens before reservation, and Runtime image payloads contain only bounded,
    request-local managed content accepted by the model and endpoint.
17. Tool-step, tool-call, callback, and whole-turn limits stop new work with classified outcomes.
18. History is grouped by durable Turn id, and flattening it without a checkpoint preserves the
    previous complete-history model input.
19. Checkpoint events round-trip as JSON; only successful terminals persist a valid bounded
    candidate, and invalid replay candidates fall back to full history.
20. Short history does not summarize; compacted history replays summary plus retained complete-Turn
    context, preserves tool pairs across split turns, and accounts summary usage in the active Turn.

The production conformance target is the Pi Runtime. A fake Runtime exercises Host behavior without
Pi or a provider connection.
