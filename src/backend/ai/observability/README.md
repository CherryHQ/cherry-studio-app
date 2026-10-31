# AI Diagnostic Tracing

Mobile captures diagnostic metadata in ordinary app operation, including development builds. Capture has no developer-mode gate. Tracing itself has no upload destination; the user can export
or submit selected metadata through the diagnostic bundle screen.

## Ownership and coverage

`TraceStorageService` is a PostReady lifecycle service. `AgentHostDependencies` and
`McpRuntimeService` depend on it so conversation turns and MCP clients stop before storage. Creation
opens no files. A one-second flush timer and an AppState listener are released by the lifecycle
owner. Backgrounding requests a flush; the OS does not guarantee time to finish that write.

The public `index.ts` exposes only platform-independent instrumentation. Shared producer and
snapshot interfaces and error projection live in `backend/utils/diagnosticTrace.ts`, so plugin
services can receive these capabilities without depending on AI implementations. The service constructor is
an assembly entry imported directly by the service registry. Runtime producers receive an optional
`TraceSpan`; they do not access Expo, persistence, or a global active-span context. Explicit parent
handles prevent concurrent Sessions from adopting each other's spans.

Current producers are:

- `DurableAgentHost`: `ai.admission` covers input preparation and native admission; `ai.prepare`
  covers rebuilding execution capabilities. `ai.recovery`, `ai.suspend`, `ai.observe`,
  `ai.settlement` and `ai.checkpoint` record recovery, background suspension, observation, transcript
  writes and checkpoint writes. Operations retain started records so unfinished boundaries remain
  visible; failures retain safe error facts and a fixed `Agent operation failed` log. `ai.queue`
  records queue length and `ai.turn_state` records new queued inputs and changed execution states,
  including approval/question waits and terminal outcomes. Terminal outcomes are recorded after
  successful transcript settlement, even when a later input is running or recovery has no observer;
  `ai.settlement` reports the write outcome separately. These are point-in-time records, not
  full turn-duration spans. Existing identities correlate independent operation traces.
- Pi: language-model requests as `pi.generate_content`, including compaction and failures while
  resolving configuration/permissions before a provider stream exists. `pi.execute_tool` records
  attempted application capability execution, including built-in tools and image generation,
  with tool call id, outcome and safe failure facts. A Code Mode script is one `run_js` record.
  A failed script records its cause: `script_timeout`, `script_aborted`, `sandbox_failed`,
  `script_error` for other terminating exceptions, and `script_failed` when the cause is not visible
  in its result. A failed child call alone does not establish why the script terminated: the script
  may have caught it and failed later for another reason. Each tool call it makes has its own
  record under a `<script call id>/<key>` id. OpenAI Responses call ids join call and item ids with
  `|`, which diagnostic identifiers keep. The model bridge records terminal stream
  events without copying provider payloads.
- MCP: `mcp.connect` for each new connection, `mcp.list_tools` for each complete catalog request
  (including pagination), and `mcp.call_tool` for each attempted tool execution. A reconnect produces
  separate records with a new connection generation. Reusing a client adds no connection record.
- Plugins: authorization begin/callback/poll/confirmation, validation, persistence, actual token
  refresh and remote revocation. Records carry plugin/method/step, outcome and safe failure facts;
  passive state reads add no trace. The existing request flow owns all network activity.

Model failures retain `error.stage` (`configuration`, `model_resolution`, or `stream`) and
`error.category`, the product `AiFailureReason` that `classifyAiFailureReason` derives from the
structured code and status alone. Messages are not used to guess a category. Provider codes the
product table does not list (for example `usage_limit_reached` or `overloaded_error`) map in
`piModelDiagnostics.ts`. A 4xx status without a product reason is `unknown`; `http.status_code`
keeps the status. Final `ai.turn_state` failures also retain `error.product_reason` from the existing
product failure snapshot, `error.source.code` behind the protocol's `EXECUTION_FAILED` wrapper,
and available source name/origin/status. The product reason may have been inferred from the
caller-visible message; it is distinct from the request's structured-only `error.category`.
Only the closed reason is copied, never the message or response body.
Application operation failures unwrap `AgentProtocolError.view` before projecting safe error
facts, so admission rejections retain their protocol code and retryability alongside the wrapper type.
A request rejected before response headers is `no_response` and a body that fails afterwards is
`stream_disconnected`; both are network failures, and `no_response` also covers native timeouts
and TLS errors because the rejection carries no cause. Adapters without a custom fetch (Google)
do not receive these codes. Terminal model failures record Pi's retry classification of the
error as `error.retryable`, qualified by `error.retry_scope: automatic`; whether a retry happened
also depends on the retry budget and context
overflow handling. Cancellation remains a cancelled outcome. Correlate existing retry attempt logs
with model requests and the final `ai.turn_state` to distinguish a failed attempt from a turn that
later succeeded. Retry backoff ending alone does not establish success.
Turn errors use `error.retry_scope: user` for eligibility to retry from the UI. The two scopes need
not agree and neither asserts that a retry actually occurred. Older records have no explicit scope.

Model requests retain the resolved model's context window, optional separate input limit and output
limit under `gen_ai.model.*`. These are local configuration, not provider-confirmed limits.
`gen_ai.request.output_budget_tokens` is the effective output budget passed to the provider adapter;
`max_tokens` and `max_tokens_field` record its serialized cap after application payload transforms.
An `omitted` field means the serialized request supplied no cap; absence of the field means the
payload boundary was not observed. No provider default is invented.
`estimated_input_tokens` reuses Pi's transcript estimator, with `estimate_source` distinguishing a
pure estimate (`pi_estimate`) from prior usage plus estimated trailing messages
(`pi_usage_and_estimate`). Message and current tool counts describe the same logical transcript.
Estimates precede provider serialization and additional native web-tool continuations; they are not
exact provider token counts and must not be presented as proof of overflow. These facts do not
change request budgets, compaction or retry policy.

Tool traces project the built-in tools' app-owned status envelope into `tool.result.status`:
`ok`, `error`, `partial`, `choice_required`, or `requires_user_action`. Returned business errors
and partial failures end the span as an error even when the function did not throw. This projection
does not alter tool results or execution failure policy. External MCP payloads are not interpreted
as built-in envelopes and receive no `tool.result.status`; their trusted failure metadata and the
`mcp.call_tool` record remain authoritative.

MCP diagnostics start in the client/adapter, so connection and catalog failures are retained even
when turn preparation fails before a conversation is admitted. Correlate MCP records by process id,
server id, and connection generation. `tool.call.id` helps locate existing message parts, but a
provider may reuse call ids across turns; use the server and time window to disambiguate. These
records do not share the conversation trace tree. Temporary pre-save connections have no
server id and are marked `mcp.connection.temporary`; endpoint URLs are never stored.

The MCP adapter captures safe transport facts before replacing the error returned to callers.
Categories distinguish timeout, cancellation, HTTP rejection, protocol errors, stable adapter error
codes, and tool-reported `isError` results. Unknown failures remain unknown; messages are not parsed
to guess a cause. Transport responses and caller-visible errors keep their existing behavior.

Pi's existing event observer records fixed failure metadata for failed tasks, automatic retry
attempts and interrupted tool executions. Recovery inspection records blocked tasks and their
closed reason codes; the Harness report callback records extension failures that do not fail the
calling operation. Failed asynchronous usage delivery is logged while its receipt remains pending.
Task ids/kinds and available Session/turn/request/message ids are included, never event messages
or event payloads. Task failures use current turn identities only for generation and tool tasks;
compaction and extension task failures retain Session/task identity without borrowing the active
turn. This does not export the engine database, raw events or its complete task graph.
The observer also records fixed `Pi durable context compaction` info events: `started`, `ended` or
`failed` for an observed task, and `committed` only when a summary entry is appended. They retain
Session/slot, task or entry ID, trigger reason and known blocking state. Task completion alone does
not prove that a summary committed. No summary or failure text is copied, and absence of these
observer events does not establish that compaction did not occur.

Detailed tool/approval timing remains in message runtime statistics, and token usage remains in
the existing invocation ledger. Diagnostics do not duplicate those records or instrument generic
text/image generation outside conversation execution, or model listing/checks.

Span records contain ids, timestamps, elapsed time, model/provider/tool identifiers, catalog counts,
finish reasons, and safe error facts. They never receive prompts, message text, tool
arguments/results, request/response bodies, headers, credentials, stacks, or device file paths.
Error messages and causes are deliberately omitted; the error type, code, origin, retryability,
HTTP status and closed failure reasons remain diagnosable. Known sensitive attribute keys are excluded,
and identifiers are bounded. At most 24 accepted attributes are retained, plus an explicit
`trace.attributes_truncated` marker when more are dropped; rejected/undefined values do not consume
the allowance. Attributes supplied when a span ends take precedence over earlier ones, so
terminal error facts survive the limit. Free text, URLs and recognizable credential values are dropped. This is a metadata
policy, not arbitrary-content redaction.

## Stored format and limits

Files live under `{Paths.document}/Runtime/trace/v1`. Each rolling `.jsonl` file contains
span snapshots conforming to `src/shared/data/types/trace.ts`. Started spans are written before
completion so a later diagnostic package can identify unfinished work after a crash.

Group records by `(processId, traceId, spanId)` and retain the highest `revision`, not the last file
encountered. A start has revision 1; a terminal record has revision 2. `parentSpanId` reconstructs
the tree, and `context` carries application correlation when available. A remaining `running`
record means no terminal record was retained; it must not be interpreted as success. Retention may
remove an older parent or start record. The stored format is mobile-owned JSONL, not OTLP or a
byte-for-byte Desktop schema.

- At most 32 active traces and 256 spans per trace; root completion closes unfinished children.
- At most 256 KiB buffered, 64 KiB per write batch, and 16 KiB per record. Oversized attributes are
  removed before the record is dropped. Capture never waits for filesystem I/O.
- History retains at most 7 days, 20 MiB, and 512 files, whichever limit is reached first.
  Cleanup runs off the first-paint path, after writes, and before diagnostic snapshots.
- Flushes append to the current UTC day's file, rotating before 1 MiB. Starting/ending a request
  still triggers a flush, but no longer consumes a new file for every small batch. The existing
  512-file guard protects against legacy/exceptional file counts rather than limiting ordinary
  request history before the byte budget is reached.
- New files are written to a temporary file then renamed. Incomplete temporary files are discarded
  on cleanup. An interrupted append's final line is separated from the next batch and reported as
  malformed by export when necessary. Files are closed after each write.
- The service queue serializes appends, pruning and snapshot copies, so an export copy stays stable
  while later requests append to the original. Retention limits do not guarantee seven days of history.
- Queue overflow, collection limits, and storage failures do not fail AI work. Dropped record and
  write-failure counts appear in the snapshot manifest; the root also reports its span limit.

## Diagnostic package integration

`DiagnosticBundleService` consumes this snapshot API for both inspection and export, filters the
selected range and projects each JSONL record through the archive field allowlist:

```ts
const snapshot = await application.get('TraceStorageService').createDiagnosticSnapshot();
try {
  // Add snapshot.files to the diagnostic archive. No upload is performed by tracing.
} finally {
  snapshot.dispose();
}
```

This flushes queued records, serializes against retention, and copies retained batches into a
private `{Paths.cache}/Diagnostics/trace-<id>` directory, using the same parent-directory casing as
upload archives. `files` includes `manifest.json` with the
format version, capture policy, retention limits, file sizes, and collection-loss counters for the
current service generation. Subsequent tracing and pruning cannot alter these copies.
`metadata` also exposes retention and loss counters without parsing a file. The caller owns
archive/upload policy and must release the snapshot after consumption. Snapshot creation
reports its own I/O failures to that caller; ordinary trace producers never receive those failures.
