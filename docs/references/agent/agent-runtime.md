# Cherry Agent Runtime

Status: **design**.

This reference defines the independent execution boundary behind the Cherry Mobile Agent Host. It
also defines how the host integrates local, LAN, and cloud Runtime endpoints without making their
private protocols part of the [Cherry Agent Protocol](./agent-protocol.md).

The central rule is that one application protocol does not require one physical database. Session
record mode determines where complete facts live and what Mobile is allowed to retain.

## 1. Layers and dependency direction

```text
Cherry Mobile Frontend
        ↕
Cherry Mobile Agent Protocol
        ↕
Mobile Agent Host
        ↕
Agent Runtime Adapter
        ├── local endpoint
        ├── LAN endpoint
        └── cloud endpoint
```

- The frontend knows only Cherry sessions, turns, messages, parts, commands, snapshots, and
  capabilities.
- The Mobile Agent Host owns application orchestration, protocol sequencing, local persistence,
  compact remote projections, and frontend recovery.
- An adapter translates between the host's execution port and one Runtime's native API.
- A Runtime executes turns. It does not import Cherry protocol envelopes, React, Expo, SQLite,
  Drizzle, or frontend state.

Runtime implementation and deployment are separate dimensions. `codex` or `claude` identifies an
implementation; `local`, `lan`, or `cloud` identifies an endpoint. Application behavior depends on
declared capabilities and session record mode, never an implementation-id switch.

## 2. Session record modes

There are two data paths, both exposed through the same application protocol and renderer.

### 2.1 `local-canonical`

The Mobile Agent Host owns the complete normalized session record.

- Commands execute through a local adapter.
- User messages, final assistant content, reasoning retained by product policy, tool/MCP detail,
  turn state, and usage are persisted locally.
- Local SQLite is authoritative for the normalized Cherry transcript.
- Runtime-native transient objects remain private to the Runtime and do not become application
  records merely because execution is local.

### 2.2 `remote-canonical`

The LAN or cloud endpoint owns the complete execution record. Mobile stores a compact projection.

- The projection is sufficient for session lists, the ordinary transcript, status, search of
  projected text, offline shells, and resuming projection synchronization.
- It may contain user-visible prompts, final assistant text, safe tool summaries, attachment and
  artifact references, status, usage summary, timestamps, a synchronization cursor, and opaque
  remote locators.
- It must not contain raw reasoning, MCP/tool input or output, shell or command logs, traces,
  provider-native events, Runtime snapshots, continuation state, or remote file bodies.
- Expanding a tool, reasoning, trace, or log view performs an authenticated request to the remote
  endpoint. The result remains ephemeral and is not merged into the persisted message.

The compact Mobile row is a projection, not a competing source of truth. A stale projection can be
advanced from the remote cursor; it must never overwrite the remote execution record.
Mobile still owns Cherry-only facts such as the local session id, pin/order state, local display
preferences, and a manually overridden title. Remote authority applies to execution-derived
transcript, state, and detail; it does not turn the independent Runtime into Cherry's product
database.

### 2.3 Default mapping in v1

| Endpoint | Session record mode | Complete execution authority | Mobile detail path |
| --- | --- | --- | --- |
| Local | `local-canonical` | Mobile | Inline/local read |
| LAN | `remote-canonical` | Paired PC | Authenticated HTTP on demand |
| Cloud | `remote-canonical` | Cloud service | Authenticated HTTP on demand |

Record mode is persisted on the session even though v1 has this fixed mapping. This keeps the
policy at one decision point and prevents storage code from accumulating endpoint-kind checks.

## 3. Runtime adapter port

The port is Mobile-owned but does not expose application protocol envelopes to external Runtimes.
Concrete adapters may live in the app; a reusable built-in Runtime may later justify its own
workspace package.

```ts
type RuntimeEndpoint =
  | { kind: 'local'; endpointId: null }
  | { kind: 'lan' | 'cloud'; endpointId: string }

type RuntimeBindingPrivate = {
  runtimeId: string
  endpoint: RuntimeEndpoint
  generation: number
  credentialRef?: string
  remoteSessionRef?: string
}

interface AgentRuntimeAdapter {
  describe(binding: RuntimeBindingPrivate): Promise<RuntimeDescriptor>
  open(binding: RuntimeBindingPrivate): Promise<AgentRuntimeConnection>
}

interface AgentRuntimeConnection {
  execute(request: RuntimeExecutionRequest): AsyncIterable<RuntimeEvent>
  resume?(executionId: string, afterCursor?: string): AsyncIterable<RuntimeEvent>
  projectionSnapshot?(executionId: string): Promise<RuntimeProjectionSnapshot>
  loadDetail?(locator: RuntimeDetailLocator): Promise<RuntimeDetail>
  cancel(executionId: string): Promise<void>
  steer?(executionId: string, input: RuntimeInputPart[]): Promise<void>
  respondApproval?(
    executionId: string,
    approvalId: string,
    decision: RuntimeApprovalDecision,
  ): Promise<void>
  close(): Promise<void>
}
```

`RuntimeExecutionRequest` contains prepared instructions, model selection, context, input, tools,
and a host-generated execution id. It does not contain an `AgentCommandEnvelope`, application
revision, event sequence, React callback, or SQLite row.

`RuntimeEvent` is normalized execution output. Content-bearing events may provide one of:

```ts
type RuntimeEventDetail =
  | { kind: 'inline'; detail: RuntimeDetail }
  | { kind: 'remote'; locator: RuntimeDetailLocator; available: boolean }
  | { kind: 'none' }
```

A local adapter may emit `inline`; a LAN or cloud adapter emits a safe summary plus `remote` or
`none`. `RuntimeDetailLocator` is backend-private. It may be persisted as an opaque mapping but is
never sent to the frontend or used as a remote URL directly.

The contract does not force every external Runtime through a built-in Runtime implementation.
Codex, Claude, a Cherry cloud service, or a paired-PC service may each implement this adapter
directly. A future `packages/agent-runtime` would be one local implementation, not a mandatory
intermediate protocol.

## 4. Adapter responsibilities

An adapter owns exactly the Runtime-specific boundary:

- request and event translation;
- authentication, pairing, connection setup, and remote transport;
- mapping host execution ids to Runtime-native session, execution, event, and approval ids;
- capability discovery;
- compact, safe summaries for remote projection events;
- resume cursor or projection-snapshot translation when supported;
- on-demand detail loading;
- cancellation, steering, and approval translation;
- redaction of native errors before they reach application views.

An adapter does not:

- write Cherry session or message tables;
- assign application `revision`, `sequence`, or `generation`;
- emit `AgentEventEnvelope` directly;
- expose credentials, native locators, or remote URLs to the frontend;
- persist fetched remote detail in a Mobile cache;
- make navigation or rendering decisions.

## 5. Mobile Agent Host responsibilities

`src/backend/services/agent` owns the application workflow around every adapter:

- admit and deduplicate commands by `commandId`;
- enforce session generation, revision, record mode, and capabilities;
- build a Runtime execution request from the allowed context;
- map normalized Runtime events into Cherry turns, messages, and parts;
- apply the session's persistence policy before any write;
- persist a local record or compact remote projection;
- assign application `revision` and event `sequence`;
- publish protocol events only after durable projection facts commit;
- provide snapshots and recover frontend subscriptions;
- resolve a Cherry part id to a backend-private detail locator;
- coordinate cancellation, shutdown, background loss, and remote resynchronization.

SQL-only data services remain responsible for rows and transactions. The Agent Host owns the
cross-resource workflow because a remote request, connection, or secure credential cannot be made
atomic with SQLite.

## 6. Local execution flow

1. The host admits `message.submit`, persists the user message and turn reservation, and publishes
   the corresponding application events.
2. The local adapter executes the prepared request.
3. The host accumulates normalized events. Inline detail allowed by product policy is part of the
   local normalized record.
4. Streaming deltas remain ephemeral; terminal message and turn state commit before terminal events
   are published.
5. If the app loses its execution window and the Runtime cannot continue, the host persists the
   partial result and settles the turn as `interrupted`.

The Runtime may keep transient provider state while the turn is active. That state is not a second
application source of truth and is discarded or fenced when the turn or binding generation ends.

## 7. Remote execution flow

### 7.1 Submit and synchronize

1. The host persists an outbox receipt and an optimistic user-visible projection.
2. The adapter submits the request to the LAN or cloud endpoint with an idempotency key.
3. The remote service accepts the command and returns its private session/execution ids and a
   projection cursor. Until this acknowledgement, the optimistic message is local pending state,
   not a remote transcript fact; rejection leaves an explicit retry-or-discard state.
4. The adapter consumes compact events, usually over SSE, and emits normalized summaries. Raw
   execution detail is not included.
5. The host commits each durable projection change and then publishes the corresponding Cherry
   application event.
6. The remote service retains the complete execution record and can continue while Mobile is
   suspended or disconnected when detached execution is supported.

HTTP plus SSE is the default remote shape: HTTP for commands, snapshots, and detail reads; SSE for
compact forward events. A Runtime may use WebSocket internally, but that choice stays inside its
adapter and does not change the Mobile application protocol.

### 7.2 Expand execution detail

```text
Frontend
  └─ GET /agent-sessions/:sessionId/messages/:messageId/parts/:partId/detail
       └─ Mobile Agent Host
            └─ private locator lookup
                 └─ Runtime adapter
                      └─ authenticated HTTP GET to LAN/cloud endpoint
```

The response is an `AgentPartDetailView`. It uses `Cache-Control: no-store`, remains in volatile UI
memory, and is discarded on normal query collection, screen exit, or app background. It is not
written to SQLite, MMKV, logs, search indexes, protocol snapshots, or event replay buffers.

If the endpoint is unavailable or no longer retains the detail, the UI still renders the locally
stored summary and reports `DETAIL_UNAVAILABLE` for the expanded view.

### 7.3 Approval

An approval event may persist the tool name, safe summary, deadline, and decision state. If the user
needs raw input to decide, opening the approval fetches it through the same detail path. The
approval response carries the user's decision and explicitly edited fields only; the fetched source
payload is not copied into Mobile persistence.

## 8. Storage boundary

The target schema may use separate tables or discriminated columns, but it must preserve this
semantic boundary:

| Mobile may persist for remote sessions | Mobile must not persist for remote sessions |
| --- | --- |
| Session id, agent id, title, binding summary, record mode | Remote credentials or URLs in protocol rows |
| Remote session/execution locator and sync cursor in backend-private rows | Raw reasoning or provider event streams |
| User-visible prompt and final answer projection | MCP/tool input and output |
| Tool name, state, safe summary, and `hasDetail` | Shell/terminal/command logs |
| Attachment/artifact metadata and remote references | Remote file bodies or Runtime snapshots |
| Turn status, safe error summary, usage summary, timestamps | Traces, stack traces, continuation payloads |
| Command receipts, generation, revision, local sequence | Persistent caches of on-demand detail |

Local full-text search indexes only projected text. Searching remote execution detail, if offered,
is a remote capability and query; Mobile does not download detail to improve its local index.

Application logs follow the same policy as storage. Logging a raw HTTP response, MCP argument, or
tool output would violate the boundary even if no database row were written.

## 9. Snapshot, recovery, and backgrounding

### 9.1 Application snapshot

The frontend always recovers through `AgentSessionSnapshot` plus subsequent application events.
For `remote-canonical`, that snapshot contains only the compact projection.

On foreground or sequence mismatch, the host:

1. loads the local projection and remote sync cursor and serves that snapshot immediately;
2. asks the adapter in the background for compact events after that cursor, or a compact projection
   snapshot if replay is unavailable;
3. commits each advanced projection and publishes it through the normal local event sequence.

Execution detail is not part of this loop. It is fetched only after an explicit user action.

### 9.2 Execution lifetime

- A local Runtime depends on the Mobile execution window. If iOS or Android suspends the required
  process and no supported continuation mechanism exists, the turn becomes `interrupted`.
- A LAN or cloud Runtime may declare detached execution only if it retains execution state and can
  resume compact projection delivery after disconnection.
- Endpoint kind alone does not prove recovery. A paired PC that shuts down is unavailable; a cloud
  service that does not retain events is not detached.

When a remote endpoint is offline, Mobile may show its compact offline projection. It cannot show
uncached detail, and it does not fabricate terminal state for an execution whose remote outcome is
unknown.

## 10. Rebind, transfer, and fork

`session.rebind` changes the Runtime implementation or endpoint only when record authority remains
compatible.

- A complete `local-canonical` record can reconstruct context for another compatible local Runtime.
- A `remote-canonical` session may reconnect to the same remote authority using its native ids and
  cursor.
- A compact remote projection is not sufficient to create an equivalent local session or move to a
  different remote authority.

Changing authority therefore requires a separate explicit operation:

- **transfer** obtains a complete, supported export from the old authority and imports it into the
  new authority; or
- **fork** creates a new session from the user-visible projected messages and clearly reports that
  Runtime-native context and detail were not copied.

Protocol v1 does not define transfer. An ordinary rebind that would change record mode fails with
`AUTHORITY_TRANSFER_UNSUPPORTED`.

## 11. Security and retention

- LAN pairing uses a short-lived bootstrap token and stores the resulting credential in platform
  secure storage, referenced from backend-private binding state.
- Production LAN and cloud detail requests require authenticated TLS. LAN pairing should pin the
  selected host identity rather than trust any device on the network.
- Detail locators are opaque, scoped to session, generation, execution, and part, and validated by
  the backend before use.
- Remote detail endpoints enforce the same authorization as the parent execution and return
  `no-store` responses.
- Runtime retention or deletion may make detail unavailable without invalidating the compact
  transcript. The UI represents that state explicitly.
- Session deletion must define whether it removes only the Mobile projection or also requests
  deletion from the remote authority; the product must not imply remote deletion after only a local
  row is removed.

## 12. Placement and integration

```text
src/shared/agent/protocol/           # Mobile application protocol and schemas
src/backend/services/agent/          # Agent Host, adapter registry, workflows
src/backend/services/agent/adapters/ # Local, LAN, and cloud adapters
src/backend/data/                    # SQL-only records and projection persistence
src/frontend/features/agent/         # Client reducer, queries, and rendering
packages/ai-runtime/                 # Existing provider/AI SDK execution primitives
packages/agent-runtime/              # Optional future reusable local Runtime
```

`packages/agent-runtime` is admitted only after an independent consumer exists. It may depend on
portable AI execution primitives, but it must not depend on Mobile protocol, storage, React, Expo,
or application adapters.

`AgentSessionView` is the persisted product conversation aggregate. It is not the caller-owned,
disposable `Session` lifecycle role defined by [Runtime Ownership](../runtime-ownership.md#role-names).

This design does not replace the current Topic, Chat Runtime, or agent-session tables until an
implementation phase lands. Current-state references remain authoritative for shipped behavior.
In particular, the current
[`agent_session_message.data`](../../../src/backend/data/db/schemas/agentSessionMessage.ts) row
stores complete `MessageData`; the existing
[`deferToolOutputs`](../../../src/backend/data/api/handlers/agentSessionMessages.ts) query only
projects large tool results at the renderer boundary. It reduces transport payload but does not
implement `remote-canonical` storage or prevent the full output from being stored locally.

## 13. Conformance

Runtime adapter conformance proves:

- declared capabilities match actual behavior;
- execute reaches one terminal outcome or a recoverable detached state;
- cancellation and close are idempotent;
- approval and steering correlate to the active execution;
- resume cursors do not duplicate or skip compact events;
- remote projection events exclude raw detail;
- detail lookup returns the correct event and fails closed for stale generation or authorization;
- native errors are redacted before conversion.

Mobile Agent Host conformance is defined by
[Agent Protocol §10](./agent-protocol.md#10-invariants). Storage tests additionally prove that a
`remote-canonical` session never writes forbidden detail to SQLite, MMKV, search indexes, logs, or
snapshot fixtures.

## 14. Delivery order

1. Land the Mobile protocol schemas and record-mode invariants.
2. Add local-canonical Host orchestration behind the existing application composition boundary.
3. Add the compact remote projection store and forbidden-detail tests.
4. Add one LAN adapter using HTTP, SSE, resume cursor, and on-demand detail.
5. Reuse the same port for a cloud adapter.
6. Add explicit transfer or fork UX only after a Runtime supplies a complete export contract.
