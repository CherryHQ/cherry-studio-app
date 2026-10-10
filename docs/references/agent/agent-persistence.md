# Agent Persistence

Cherry owns the complete durable transcript in `cherry.db`: message parts, checkpoints, usage and
lifecycle metadata. The [Pi Durable integration](./pi-durable-migration.md) uses `pi-agent.db` for
resumable execution working copies. Reads and search use Cherry directly; backup format v1 includes
Cherry and managed resources. Pi copies persist across launches, are rebuilt from Cherry when
missing, and are never a backup input.

This document defines the durable SQLite schema and production adapter behind the Host-owned
[`AgentSessionStore`](../../../src/backend/ai/agent/sessionStore/AgentSessionStore.ts) port. It
implements the storage side of the [Agent Protocol](./agent-protocol.md) and follows the authority
model direction of
[#568](https://github.com/CherryHQ/cherry-studio-app/issues/568): mobile SQLite is the complete
record for mobile-originated Agent Sessions only.

## Scope

- Four Agent-owned tables: `agent`, `agent_tool_binding`, `agent_session`,
  `agent_session_message`, plus an FTS index for message search.
- A message-centric `AgentSessionStore` port: the protocol's Turn is a Host projection over the
  assistant message plus Host-held live state. Starting from a Draft atomically inserts the Session
  and its first user/assistant message pair.
- A `SqliteAgentSessionStore` adapter that is the production `AgentSessionStore` binding;
  `InMemoryAgentSessionStore` remains as the conformance-suite reference adapter.
- Agent CRUD plus cursor-paginated Session and transcript reads through the Data API, and an
  Agent-table-backed `AgentDefinitionSource` used by the production Host. Session renames and
  removals delegate to the Host so an active turn is cancelled and drained before the row is
  hard-deleted.
  The `agent` table intentionally starts empty; retired Assistant data is discarded rather than
  migrated.

Branching is a fork, not a message tree, so `agent_session` carries nullable source and copied-prefix
boundary metadata but no per-message parent/active-path columns
([Agent Protocol](./agent-protocol.md#branching)).

Out of scope: message-tree columns, Mobile Skill configuration/loading, and broader
Pi provider coverage. The Host projects Agent-specific MCP bindings into each Runtime snapshot.
System capability enablement persists on the Agent row as a capability-group deny-list
(`disabled_capabilities`, JSON group ids, unknown ids dropped on read); everything else about a
capability resolves per turn and needs no Session persistence.

The Agent's `mode` is either `standard` (the creation and migration default) or
`minimal`. Minimal mode has a fixed text-chat and direct-image boundary: the Host skips built-in
tools, MCP discovery and plugin guides, rejects new document attachments and image generation,
and uses a compact application prompt. Capability, approval and MCP binding preferences stay
stored when modes change, so switching back to standard restores them. Mode changes apply to
subsequent turns; existing transcript content remains part of the conversation history.
Provider-native web search is not configured by this mode setting.

## Current limitations

The Agent Data API, `Backend.agent`, and frontend surfaces share these current constraints:

- Session observation currently resolves the live Agent definition first. Soft-deleting an Agent
  or clearing its model can therefore make its existing Sessions unavailable through the public
  Host API even though their rows remain durable. The Data API's static Session and transcript
  reads remain available without resolving an executable Agent definition.
- Batch reorder callers must provide unique Agent ids. Duplicate ids can currently be reported as
  `NOT_FOUND`, despite the underlying ordering helper otherwise using the last move for an id.
- Agent deletion is soft so historical Sessions retain their definition and avatar reference.
  Replacing an avatar deletes the previous file, but soft deletion does not reclaim the current
  avatar; no orphan cleanup exists yet.

## Decisions

**No persisted Runtime identity.** There is no `runtime_binding` column. Runtime ids never appear in
protocol values or application data ([Agent Runtime](./agent-runtime.md), protocol invariant 10).
Mobile Agent has one execution target and one engine: `local → Pi` in this mobile app. Application
composition injects Pi directly into the Host, so there is no implementation choice to persist. The
PC Agent Controller does not represent PC execution as a local Runtime binding or extend the
current local execution-target value. PC Agent Sessions remain authoritative on the PC. A mobile
adapter may map them into Agent Protocol values for the application, but it does not copy them into
these tables as a second source of truth. Any offline cache or projection requires a separate
versioned adapter and invalidation design.
`contextCheckpoint` does not change this decision: it is a versioned, Runtime-produced content
artifact anchored to a durable turn, not an engine id, resumable Runtime instance, provider cursor,
or routing choice. The Host treats its payload as opaque. Pi owns resumable task state outside
these business tables; `runtimeRevision` only invalidates stale execution copies.

**Cherry stores no model-side replay.** Signed thinking and raw provider content live only in the
Pi working copy, which persists between launches. A missing copy is rebuilt from normalized parts;
historical reasoning is omitted because stored parts carry no signature. Migration `0005` drops the
interim `replay` column, and the pre-Pi MMKV replay cache is cleared once at startup.

**No workspace; controlled resources come from managed references.** A desktop workspace encodes a
working directory and filesystem/shell execution environment; mobile has neither, so Sessions carry
no workspace reference or execution-target column. Every file is imported into `file_entry` before
submission or tool use. The Host
initializes a turn resource ledger from managed file ids in the current input and Session transcript,
then may add only validated entries created by application capabilities during that turn. Those
durable references already live on messages, while the monotonic same-turn ledger is process-local,
so no generic `resource_scope` column is added. Any broad Agent-to-library grant requires an explicit
relation rather than a directory path or opaque JSON scope.

**Turn is a projection, not a table.** Decomposed by requirement, a V1 Turn is three things and
none of them needs a row of its own:

- a *correlation id* pairing one submission's user and assistant messages — a shared `turnId`
  column on both message rows;
- *live lifecycle state* (`running`, `awaiting-approval`, `cancelling`) — Host memory by
  definition: Pi persists task recovery and the Host reconstructs presentation from it;
- *terminal facts* — turn terminal statuses map one-to-one onto message statuses
  (`completed→success`, `failed→error`, `cancelled`, `interrupted`), usage already lives on the
  assistant message, `startedAt`/`endedAt` come from its `stats.runtimeTiming`, and the turn-level
  error gets an `error` column on the message row.

The Host synthesizes `AgentTurnView` from the assistant message row plus its live state; the
protocol keeps Turn as a UI-facing concept unchanged.

**Approval decisions are not reusable grants.** Pending UI callbacks live in Host memory. Pi owns
execution interruption/recovery; current tool and approval policy is reconstructed before resume.
Completed decisions appear in terminal ToolPart state and normalized output. Missing native work
is reconciled as interrupted, closing unfinished parts rather than replaying a dead callback.
No `agent_approval` table is needed.

**Avatar stores the built-in Cherry emoji or a stable file reference.** The initial Cherry Agent
and the onboarding fallback store `🍒`, matching Desktop's Cherry Assistant. Existing records are
preserved. Uploaded avatars follow the user-avatar pattern
([File Model](../data/file-model.md), `userAvatarStorage.ts`): processed to
WebP under `{documentDirectory}/agent-avatars/`, referenced as
`agent-avatar-file:{agentId}.{uuid}.webp`, never as an absolute `file://` path. `file_entry` is for
user-visible library content with independent lifecycle; an avatar is replace-in-place and remains
attached to a soft-deleted Agent for historical Sessions.

Implemented as `agentAvatarStorage.ts` over the parameterized `userContentImageStorage`, driven by
`PUT /agents/:id/avatar`: store the new image, write the column, then drop the previous file, with a
column-write failure compensating the new file. Creation accepts only the built-in `🍒` value;
updates reject direct avatar writes, and managed file references always use the image workflow.
The uuid rotates on every replace so the uri, which doubles as the image cache key,
changes with it.

Emoji avatars render from `Agent.avatar` and have no image URI. File references project into a
device-local `Agent.avatarUri`, rebuilt per read because the
absolute path does not survive container relocation. That projection happens at the Data API
boundary, not in `AgentService`: resolving it is file-system work under `backend/services`, which
`backend/data` must not depend on. `createAgentAvatars` owns both directions and is injected through
`dataApiDependencies`, the same channel `mcpServerMutations` uses.

**Delete semantics.** `agent` soft-deletes (`deletedAt`), so Sessions never orphan; hard cleanup of
an Agent is refused while Sessions exist (`RESTRICT`). Session deletion aborts execution, drains
settlement/usage, then hard-deletes Cherry rows and cascades messages. Forks are independent row
copies and survive source deletion. The Host retires the Pi binding; no owner can be recreated from
Pi. Retired upstream bytes remain until the next idle initialization closes and deletes the Pi
file. No raw upstream SQL or archive tombstone is involved.

The deletable message unit is a whole settled turn, keeping tool calls and results paired. Deleting
its Cherry rows also clears checkpoints that may include the turn and increments `runtimeRevision`
in the same transaction. The old Pi copy is then retired; a crash cannot make that stale revision
usable. Deletion does not undo external tool actions or erase the independent usage ledger.

**MCP bindings are mobile-owned Agent configuration.** `agent_tool_binding` stores a stable MCP
`(serverId, rawToolName?)` identity, its enabled state, approval policy, and an optional display
snapshot. A missing `rawToolName` is the server default; a specific row overrides it. MCP server ids
deliberately have no foreign key, so deleting a server atomically disables but does not erase its
bindings. Partial unique indexes enforce the stable identities and the service preserves row ids
during upsert/replace. Third-party MCP writes default to `ask` and the binding Data API rejects `auto`;
display names never resolve or retarget a dangling binding. The Host reads the effective MCP
projection; Pi does not read persistence. The data resolver deterministically selects a specific
MCP tool row before its server default and reports missing Server/discovery facts as effective
unavailability without deleting or retargeting the row. Runtime projection is described in
[Agent Tools And Controlled Resources](./agent-tools-and-resources.md#tool-catalog-and-bindings).
The Agent row's separate `toolApprovalMode` may promote the resulting per-turn `ask` policy to
`auto`; it does not rewrite bindings or make an unavailable tool executable.

The physical table and typed Data API accept only MCP bindings. Built-in capability enablement
lives on the Agent row's group-level deny-list, never in this per-tool relation.

Skill configuration remains deferred. Pi reads neither tool nor Skill persistence directly.

**Naming and types.** DB columns use the protocol vocabulary (`name`, `isNameManuallyEdited`), not a
second synonym set. Timestamps are integer epoch millis via `createUpdateDeleteTimestamps`; the
store maps to the protocol's ISO strings at the boundary. `agent` uses UUID v4 (like `assistant`);
`agent_session` and `agent_session_message` use time-ordered UUID v7 (`uuidPrimaryKeyOrdered`).
For chat sends, the send action allocates these IDs before asynchronous preparation so the displayed
rows and persisted rows have identical identities. The store inserts those supplied IDs inside the
existing reservation transaction; it still creates a new Session together with its first message
pair. Record timestamps and turn IDs remain store-generated. Primary-key collisions reject the
transaction without overwriting records or leaving a partial Session.
Agent updates advance `updatedAt` with `max(previous + 1, wall clock)` inside the serialized write
transaction. The composer can therefore use it as a strict row version when reconciling optimistic
model selection with Agent definition edits and inactive query caches.

**Desktop divergence is documented.** Mobile shares the desktop table names and the
`agent → agent_session → agent_session_message` shape but owns its columns, per the #568
authority split and the schema README's alignment rule: columns that presume a resumable
external runtime (workspace, delivery, resume tokens) are deliberately absent, while
`turnId`/`error` and Agent soft delete are mobile-owned.

## Tables

### `agent`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | text | PK, UUID v4 | |
| `name` | text | NOT NULL | |
| `instructions` | text | NOT NULL DEFAULT `''` | System instructions |
| `avatar` | text | NULL | Built-in Cherry emoji or stable file reference; NULL uses the name fallback |
| `model` | text | NULL, FK → `user_model.id` ON DELETE SET NULL | `UniqueModelId` |
| `toolApprovalMode` | text | NOT NULL DEFAULT `auto` | `default` preserves tool policy; `auto` promotes effective `ask` to `auto` and withholds `ask_user_question` |
| `orderKey` | text | NOT NULL | `orderKeyColumns` fractional index |
| `createdAt` / `updatedAt` / `deletedAt` | integer | helper defaults | Soft delete via `deletedAt` |

Indexes: `orderKeyIndex('agent')`, `agent_created_at_idx`.

### `agent_tool_binding`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | text | PK, UUID v4 | Preserved across stable-identity upserts |
| `agentId` | text | NOT NULL, FK → `agent.id` ON DELETE CASCADE | Hard Agent cleanup removes bindings; soft delete does not |
| `source` | text | NOT NULL, CHECK `mcp` | MCP bindings only |
| `mcpServerId` | text | NOT NULL, nonempty, no FK | Survives server deletion |
| `rawToolName` | text | NULL | NULL is the MCP server default |
| `enabled` | integer (bool) | NOT NULL DEFAULT `true` | Server deletion sets related rows false in the same transaction |
| `approval` | text | NOT NULL DEFAULT `ask`, CHECK `auto`/`ask`/`deny` | MCP Data API writes admit only `ask`/`deny` |
| `displayNameSnapshot` | text | NULL | Repair-only UI context; never authority |
| `createdAt` / `updatedAt` | integer | helper defaults | Stable row timestamps |

Partial unique indexes enforce `(agentId, mcpServerId)` for MCP server defaults plus
`(agentId, mcpServerId, rawToolName)` for specific MCP tools. Plain indexes cover Agent
listing/cascade and MCP server delete-time disabling.

### `agent_session`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | text | PK, UUID v7 | |
| `agentId` | text | NOT NULL, FK → `agent.id` ON DELETE RESTRICT | Agent soft-deletes first |
| `name` | text | NOT NULL DEFAULT `''` | |
| `isNameManuallyEdited` | integer (bool) | NOT NULL DEFAULT `false` | |
| `runtimeRevision` | integer | NOT NULL DEFAULT `0` | Incremented on turn deletion/retry to invalidate Pi working copies |
| `lastActivityAt` | integer | NOT NULL | Monotonic Session recency: reservation time or terminal `stats.runtimeTiming.completedAt` |
| `createdAt` / `updatedAt` | integer | helper defaults | Hard delete; no `deletedAt` |
| `forkedFromSessionId` | text | FK → `agent_session.id` ON DELETE SET NULL | Fork lineage; `NULL` for an ordinary Session and reset to `NULL` when the source is deleted |
| `forkBoundaryMessageId` | text | NULL | Message inside the fork that closes the copied prefix; maintained atomically with lineage and not a cross-table FK |

Indexes: `agent_session_agent_id_idx`, `agent_session_last_activity_idx` (list ordering is
recency; no `orderKey`).

### `agent_session_message`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | text | PK, UUID v7 | Time-ordered; transcript order is `(createdAt, id)` |
| `sessionId` | text | NOT NULL, FK → `agent_session.id` ON DELETE CASCADE | |
| `turnId` | text | NULL, indexed | Correlation id shared by a submission's user/assistant pair; nullable per protocol |
| `role` | text | NOT NULL, CHECK `user`/`assistant`/`system` | No `root`: transcript is linear |
| `data` | text (json) | NOT NULL | `{ parts: AgentMessagePart[] }` |
| `status` | text | NOT NULL, CHECK in 6 protocol statuses | `pending` … `interrupted` |
| `stats` | text (json) | NULL | Desktop-aligned `MessageStats`; current executions persist wall-clock, tool-execution, and approval-wait spans in `runtimeTiming`, and a completed answer's final-request context size in `contextTokens` |
| `error` | text (json) | NULL | Terminal `AgentErrorView` diagnostics, including cancellation reasons with no inline error part; historical Turn views are not reconstructed from this column |
| `contextCheckpoint` | text (json) | NULL | Versioned opaque Runtime context artifact; successful assistant terminal rows only |
| `modelId` | text | NULL, FK → `user_model.id` ON DELETE SET NULL | Model selected when the assistant placeholder was reserved |
| `inferenceSnapshot` | text (json) | NULL | Versioned Agent inference snapshot; raw JSON retained for unknown versions |
| `searchableText` | text | NOT NULL DEFAULT `''` | Visible plain text of `text` parts, written by the store |
| `ftsRowid` | integer | NULL, UNIQUE | Stable FTS5 `content_rowid`, trigger-assigned |
| `createdAt` / `updatedAt` | integer | helper defaults | Physical row timestamps; hard delete via session cascade |

Indexes: `(sessionId, createdAt)`, `turnId`, `status` (backs settlement recovery), and unique
`ftsRowid`. Multiple pending assistant rows represent queued inputs. Pi's scheduler serializes their
execution; the old partial unique index on unsettled assistants is removed by migration `0004_agent_message_replay`.

`data.parts` is exactly the protocol's `AgentMessagePart` union
([contract](../../../src/shared/contracts/agent/views.ts)). The database migration journal owns
format upgrades; individual messages store no format version. Migration `0003_align_agent_fields`
removes the old `data.version` and aligns part fields: `tool` becomes `dynamic-tool`, with
`toolName` and `title`; file parts use `filename`; and error parts become
`{ type: 'data-error', data }`. It preserves part order, tool states and result envelopes.
The same migration renames the inference column to `inference_snapshot` without changing its JSON,
removes the constant local execution target and consolidates message `usage` into `stats`, filling
missing counters without overwriting existing statistics. It also aligns the database approval
default with new Agent creation (`auto`) while retaining saved modes.

FTS mirrors the chat `message` architecture (external-content FTS5 table keyed on
`ftsRowid`, idempotent statements in the schema module, executed via `customSql.ts`) and indexes
`text` parts only. `reasoning` is model-internal and deliberately not searchable; tool payloads are
structured data, not prose. The store writes `searchableText` as the parts' visible plain text,
with Markdown formatting removed and code content kept, so a trigram `LIKE` finds every visible
match without scanning the index. Triggers only mirror that column into FTS. Every write of `data`
supplies it except the mid-stream snapshot, so a turn's streamed text is indexed once, when the row
settles. When the custom SQL changes, startup re-derives settled rows whose stored text still
contains Markdown markers; this also converts restored backups indexed by an older trigger.

`reserveSubmission` writes the selected `modelId` and `AgentInferenceSnapshotV1` on the assistant
placeholder in the same transaction as the user/assistant pair. The existing nullable columns from
the Agent Session schema are reused, so this contract requires no table rebuild. The column does
not store the Chat `MessageSnapshot` shape. Reads validate known versions with the Agent-specific
schema, return `null` for old rows, and retain unknown raw JSON behind an `unsupported` projection.
Model deletion may null the foreign key but never rewrites the historical snapshot.

## Store port and adapter

Manual retry adds `reserveRetry`: the Session's last answer and its user row receive a fresh
shared turn id in one transaction, with the same message ids and transcript position. The
transaction re-reads the two trailing rows and rejects anything else, so a message that stopped
being the last one between preparation and reservation cannot be replaced. The assistant is reset
to `pending`, its error and context checkpoint cleared, runtime timing reset, and any retained
tool results saved immediately. Retained part ids are reissued so new Runtime output cannot
collide with them. The transaction increments `runtimeRevision` to invalidate the old Pi copy. Only the replaced answer's own checkpoint is dropped — it is the last message,
so no earlier summary can describe it, and earlier compaction work stays reusable. Invocation
ledger totals remain intact. Preparation must finish before this operation; a rejected preflight
does not clear the old answer. A restarted answer begins with empty parts; a resumed one keeps its
recorded prefix. Retry never creates a Session or inserts another user message.

The `AgentSessionStore` port reshapes to message-centric operations; the Host owns the Turn
projection:

- *Reserve* inserts the user message and assistant placeholder (shared fresh `turnId`) in one
  `DbService.withWriteTx()` transaction (invariant 2). *Finalize* settles the assistant message —
  status, parts, token counts in `stats`, `stats.runtimeTiming`, turn-level error and an optional validated context
  checkpoint — in one write (invariant 5). Failed, cancelled, and interrupted terminal rows force
  the checkpoint to `NULL`. Failed turns write the same `AgentErrorView` to the inline part and
  diagnostic column. Cancellation retains its reason only in the column; historical rows without
  a failure snapshot remain valid. Reservation advances
  Session `lastActivityAt` to the assistant placeholder's `createdAt`; normal finalization advances
  it to `stats.runtimeTiming.completedAt`. Message and Session `updatedAt` remain physical row
  modification timestamps.
  Startup reconciliation is administrative recovery and preserves the reservation activity time.
  `deleteSession` explicitly clears surviving forks' source and boundary metadata, advancing their `updatedAt`, before
  cascading the source delete to its messages.
- Streaming state comes from Pi observation. Native execution persists its progress; the Cherry
  reservation stays unsettled until the full terminal write succeeds. Terminal events follow that
  write. Startup, next submission and backup retry matching native results; a reservation without
  native admission is interrupted with its saved parts retained.
- `forkSession` inserts the new Session and every copied message in one `withWriteTx` transaction.
  It copies `isNameManuallyEdited` from the source, takes `name` from the caller
  or else from the source, sets
  `forkedFromSessionId`, records the reissued copied anchor as `forkBoundaryMessageId`, and copies
  `lastActivityAt` from the source assistant's `stats.runtimeTiming.completedAt` at the inclusive
  fork point, falling back to the anchor's `createdAt` when it has no completed runtime. Creating
  the fork is an administrative row mutation, not conversation
  activity, so it does not move the fork to "now" in the recency list. Startup recovery preserves
  the original reservation activity because it is not new conversation activity. Copied rows keep
  `createdAt`, `role`, `data`, `status`, `stats`, `error`,
  `modelId`, and `inferenceSnapshot` verbatim; `turnId` is reissued through a per-fork map so pairing
  survives without colliding across Sessions; `contextCheckpoint` is forced to `NULL` because a
  checkpoint anchors to a turn that no longer exists. Keeping `createdAt` deliberately breaks the
  "never set timestamps by hand" rule: transcript order is `(createdAt, id)`, the source is already
  ordered, and the reissued UUID v7 ids break ties in the same direction, so copying the value
  preserves order while stamping "now" on every row would be visibly wrong in the UI.
  `searchableText` is copied; `ftsRowid` is left to the insert trigger, which is race-free because
  the whole copy runs inside the serialized write transaction. Copies are inserted in chunked
  multi-row statements with ids generated in transcript order.
  The boundary is Session metadata rather than a synthetic Message, so it does not enter FTS,
  transcript pagination counts, Runtime history, or recursive fork copies.
- Deleting a turn increments `runtimeRevision` and clears, in the same transaction, every checkpoint in that Session whose anchor
  does not sit strictly before the deleted turn — including anchors the deletion itself orphans.
  A summary covers everything up to its anchor, and its text is opaque to the store, so a
  checkpoint that may have absorbed the deleted content cannot be replayed without putting that
  content back in front of the model. The cost is a full replay, and usually a fresh compaction,
  on the next turn. The Session's own `forkBoundaryMessageId` is cleared when it names a deleted
  row, and `lastActivityAt` rewinds to the newest surviving message, since a deleted turn is no
  longer activity to sort by. The FTS delete trigger keeps the index consistent with no extra
  work; `ai_usage_record` rows are a separate ledger and deliberately survive.
- The latest assistant row with a non-null checkpoint is the replay candidate. The Host validates
  schema version, anchor membership, and the 256 KiB payload ceiling. Invalid, incompatible,
  oversized, or orphaned candidates are classified in logs and ignored; execution receives full
  history instead. The store resolves anchor membership and loads rows after the anchor directly;
  it also returns a lightweight full-transcript file-reference index, so the Host does
  not materialize the complete transcript merely to discard its checkpoint-covered prefix.
- Turn reads and live-status transitions leave the store: the Host holds the active turn's live
  state (`running`/`awaiting-approval`/`cancelling`) in memory and synthesizes `AgentTurnView`
  from it plus the assistant message row. Terminal statuses derive from the message row alone,
  so transcript-history turns need no extra reads.
- Every unsettled assistant row is a durable settlement receipt. The Host compares its message and
  turn identity with Pi before accepting another input, at startup, and before backup. A failed
  settlement cannot be skipped by a later cursor advance. Deleted owners and obsolete revisions
  are retired, never reconstructed from Pi. Finalization rejects a mismatched retry turn id.
- Approvals stay in Host/adapter memory, cleared on destroy — live-process state by design (see
  Decisions), not a missing table.
- Row ↔ view mapping converts epoch millis to ISO strings and validates `data` against the
  protocol schema on read paths that leave the store.

A shared store conformance suite runs against both adapters, mirroring the Runtime conformance
approach. The Agent Protocol, including `AgentTurnView`, its events, and its invariants, remains
independent of the Host-private storage boundary.
