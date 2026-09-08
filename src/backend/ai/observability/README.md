# AI Diagnostic Tracing

Mobile captures diagnostic metadata in ordinary app operation, including development builds. There
is no developer-mode gate, frontend viewer, upload request, or external telemetry destination.

## Ownership and coverage

`TraceStorageService` is a PostReady lifecycle service. `AgentHostDependencies` and
`McpRuntimeService` depend on it so conversation turns and MCP clients stop before storage. Creation
opens no files. A one-second flush timer and an AppState listener are released by the lifecycle
owner. Backgrounding requests a flush; the OS does not guarantee time to finish that write.

The public `index.ts` exposes only platform-independent instrumentation. The service constructor is
an assembly entry imported directly by the service registry. Runtime producers receive an optional
`TraceSpan`; they do not access Expo, persistence, or a global active-span context. Explicit parent
handles prevent concurrent Sessions from adopting each other's spans.

Current producers are:

- `MobileAgentHost`: one `ai.turn` root per reserved turn, with Agent, Session, turn, and assistant
  message ids and terminal outcome, including terminal persistence failures.
- Pi: conversation provider requests as `pi.generate_content`, including compaction. Observation
  uses the existing result promise and does not read, tee, or replace the response stream.
- MCP: `mcp.connect` for each new connection, `mcp.list_tools` for each complete catalog request
  (including pagination), and `mcp.call_tool` for each attempted tool execution. A reconnect produces
  separate records with a new connection generation. Reusing a client adds no connection record.

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

Tool/approval timing remains in message runtime statistics, and token usage remains in the existing
invocation ledger. Diagnostics do not duplicate those records or instrument generic text/image
generation, model listing/checks, context preparation, approvals, or built-in tools. This is a
request-failure diagnostic surface, not a second analytics pipeline.

Span records contain ids, timestamps, elapsed time, model/provider/tool identifiers, catalog counts,
finish reasons, and safe error facts. They never receive prompts, message text, tool
arguments/results, request/response bodies, headers, credentials, stacks, or device file paths.
Error messages and causes are deliberately omitted; the error type, code, origin, retryability,
and HTTP status remain diagnosable. Known sensitive attribute keys are excluded, and attribute
count/string lengths are bounded. This is a metadata policy, not arbitrary-content redaction.

## Stored format and limits

Files live under `{Paths.document}/Runtime/trace/v1`. Each immutable `.jsonl` file contains a batch
of span snapshots conforming to `src/shared/data/types/trace.ts`. Started spans are written before
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
- History retains at most 7 days, 20 MiB, and 512 batch files, whichever limit is reached first.
  Cleanup runs off the first-paint path, after writes, and before diagnostic snapshots.
- Batches are written to a temporary file then renamed. Incomplete temporary files are discarded
  on the next cleanup. Storage writes and snapshot copies are serialized.
- Queue overflow, collection limits, and storage failures do not fail AI work. Dropped record and
  write-failure counts appear in the snapshot manifest; the root also reports its span limit.

## Diagnostic package integration

Backend code can obtain a stable export without adding a frontend API:

```ts
const snapshot = await application.get('TraceStorageService').createDiagnosticSnapshot();
try {
  // Add snapshot.files to the diagnostic archive. No upload is performed by tracing.
} finally {
  snapshot.dispose();
}
```

This flushes queued records, serializes against retention, and copies retained batches into a
private `{Paths.cache}/diagnostics/trace-<id>` directory. `files` includes `manifest.json` with the
format version, capture policy, retention limits, file sizes, and collection-loss counters for the
current service generation. Subsequent tracing and pruning cannot alter these copies. The caller
owns archive/upload policy and must release the snapshot after consumption. Snapshot creation
reports its own I/O failures to that caller; ordinary trace producers never receive those failures.
