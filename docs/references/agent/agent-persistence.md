# Agent Persistence

> Status: as-built. Mobile Agent execution is device-local only.

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
  deletes delegate to the Host so an active turn is cancelled and drained before rows disappear.
  The `agent` table intentionally starts empty; retired Assistant data is discarded rather than
  migrated.

Branching is a fork, not a message tree, so `agent_session` carries one nullable lineage column and
no per-message parent/active-path columns ([Agent Protocol](./agent-protocol.md#branching)).

Out of scope: message-tree columns, background turns, Mobile Skill configuration/loading, and broader
Pi provider coverage. The Host projects Agent-specific MCP bindings into each Runtime snapshot.
System capability enablement persists on the Agent row as a capability-group deny-list
(`disabled_capabilities`, JSON group ids, unknown ids dropped on read); everything else about a
capability resolves per turn and needs no Session persistence.

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
composition injects Pi directly into the Host, so there is no implementation choice to persist.
Cloud and LAN desktop control are separate domains and must not reuse Mobile Agent definitions,
Sessions, or execution-target values.
Future remote Agent Sessions remain authoritative on the remote service. A mobile HTTP adapter may
map them into Agent Protocol values for the application, but it does not copy them into these tables
as a second source of truth or represent remote execution as a local Runtime binding. Any offline
cache or projection requires a separate versioned wire and invalidation design.
`contextCheckpoint` does not change this decision: it is a versioned, Runtime-produced content
artifact anchored to a durable turn, not an engine id, resumable Runtime instance, provider cursor,
or routing choice. The Host treats its payload as opaque and a process restart still interrupts an
active turn.

**No workspace; controlled resources come from managed references.** A desktop workspace encodes a
working directory and filesystem/shell execution environment; mobile has neither, so Sessions carry
no workspace reference. `execution_target` records the mobile boundary (`{"kind":"local"}`). Every
file is imported into `file_entry` before submission or tool use. The Host
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
  definition: the protocol declares process death non-resumable and boot reconciliation
  interrupts everything unfinished, so persisting these states stores only dead values;
- *terminal facts* — turn terminal statuses map one-to-one onto message statuses
  (`completed→success`, `failed→error`, `cancelled`, `interrupted`), usage already lives on the
  assistant message, `startedAt`/`endedAt` are its `createdAt`/terminal `updatedAt`, and the
  turn-level error gets an `error` column on the message row.

The Host synthesizes `AgentTurnView` from the assistant message row plus its live state; the
protocol keeps Turn as a UI-facing concept unchanged.

**Approvals are not persisted.** Sessions cannot resume: boot reconciliation interrupts every
unfinished turn, so a persisted pending approval is dead on arrival. Pending approvals live in
adapter memory. A user decision is recorded in the terminal ToolPart state and normalized output;
denial becomes `denied`. Cancellation, failure, or startup reconciliation converts every remaining
`input-available` / `awaiting-approval` / `running` ToolPart to `interrupted` before the assistant
message settles. Later model history therefore contains paired calls/results and never replays an
unanswerable approval. No `agent_approval` table.

**Avatar is a stable file reference, not emoji and not `file_entry`.** Agent avatars follow the
user-avatar pattern ([File Model](../data/file-model.md), `userAvatarStorage.ts`): processed to
WebP under `{documentDirectory}/agent-avatars/`, referenced as
`agent-avatar-file:{agentId}.{uuid}.webp`, never as an absolute `file://` path. `file_entry` is for
user-visible library content with independent lifecycle; an avatar is replace-in-place and remains
attached to a soft-deleted Agent for historical Sessions.

Implemented as `agentAvatarStorage.ts` over the parameterized `userContentImageStorage`, driven by
`PUT /agents/:id/avatar`: store the new image, write the column, then drop the previous file, with a
column-write failure compensating the new file. The CRUD DTOs still refuse `avatar` — the column has
no other writer. The uuid rotates on every replace so the uri, which doubles as the image cache key,
changes with it.

Reads project the column into a device-local `Agent.avatarUri`, rebuilt per read because the
absolute path does not survive container relocation. That projection happens at the Data API
boundary, not in `AgentService`: resolving it is file-system work under `backend/services`, which
`backend/data` must not depend on. `createAgentAvatars` owns both directions and is injected through
`dataApiDependencies`, the same channel `mcpServerMutations` uses.

**Delete semantics.** `agent` soft-deletes (`deletedAt`), so Sessions never orphan; hard cleanup of
an Agent is refused while Sessions exist (`RESTRICT`). `agent_session` hard-deletes and cascades
messages — matching the store port's `deleteSession` contract. Before deleting rows, the Host
installs a per-Session barrier, waits any already-admitted submission to install its turn state,
then cancels and drains that turn. New submissions fail closed until deletion finishes. Messages
are never deleted individually in V1.

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

The physical table and typed Data API retain the `builtin` variant to read existing databases
without a destructive migration. Those rows are legacy compatibility data: the Host ignores them,
and the Agent editor omits them when replacing bindings. Built-in capability enablement lives on
the Agent row's group-level deny-list, never in this per-tool relation.

Skill configuration remains deferred. Pi reads neither tool nor Skill persistence directly.

**Naming and types.** DB columns use the protocol vocabulary (`title`, `titleIsManual`), not a
second synonym set. Timestamps are integer epoch millis via `createUpdateDeleteTimestamps`; the
store maps to the protocol's ISO strings at the boundary. `agent` uses UUID v4 (like `assistant`);
`agent_session` and `agent_session_message` use time-ordered UUID v7 (`uuidPrimaryKeyOrdered`).
Agent updates advance `updatedAt` with `max(previous + 1, wall clock)` inside the serialized write
transaction. The composer can therefore use it as a strict row version when reconciling optimistic
model selection with Agent definition edits and inactive query caches.

**Desktop divergence is documented.** Mobile shares the desktop table names and the
`agent → agent_session → agent_session_message` shape but owns its columns, per the #568
authority split and the schema README's alignment rule: columns that presume a resumable
external runtime (workspace, delivery, resume tokens) are deliberately absent, while
`turnId`/`error`, `executionTarget`, and Agent soft delete are mobile-owned.

## Tables

### `agent`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | text | PK, UUID v4 | |
| `name` | text | NOT NULL | |
| `instructions` | text | NOT NULL DEFAULT `''` | System instructions |
| `avatar` | text | NULL | Stable file reference; NULL renders the default avatar |
| `modelId` | text | NULL, FK → `user_model.id` ON DELETE SET NULL | `UniqueModelId` |
| `toolApprovalMode` | text | NOT NULL DEFAULT `default` | `default` preserves tool policy; `auto` promotes effective `ask` to `auto` |
| `orderKey` | text | NOT NULL | `orderKeyColumns` fractional index |
| `createdAt` / `updatedAt` / `deletedAt` | integer | helper defaults | Soft delete via `deletedAt` |

Indexes: `orderKeyIndex('agent')`, `agent_created_at_idx`.

### `agent_tool_binding`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | text | PK, UUID v4 | Preserved across stable-identity upserts |
| `agentId` | text | NOT NULL, FK → `agent.id` ON DELETE CASCADE | Hard Agent cleanup removes bindings; soft delete does not |
| `source` | text | NOT NULL, CHECK `builtin`/`mcp` identity shape | `builtin` is legacy compatibility data |
| `capabilityId` | text | NULL | Retained only for legacy `builtin` rows |
| `mcpServerId` | text | NULL, no FK | Required only for `mcp`; survives server deletion |
| `rawToolName` | text | NULL | NULL is the MCP server default |
| `enabled` | integer (bool) | NOT NULL DEFAULT `true` | Server deletion sets related rows false in the same transaction |
| `approval` | text | NOT NULL DEFAULT `ask`, CHECK `auto`/`ask`/`deny` | MCP Data API writes admit only `ask`/`deny` |
| `displayNameSnapshot` | text | NULL | Repair-only UI context; never authority |
| `createdAt` / `updatedAt` | integer | helper defaults | Stable row timestamps |

Partial unique indexes retain `(agentId, capabilityId)` for legacy built-ins and enforce
`(agentId, mcpServerId)` for MCP server defaults plus `(agentId, mcpServerId, rawToolName)` for
specific MCP tools. Plain indexes cover Agent listing/cascade and MCP server delete-time disabling.

### `agent_session`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | text | PK, UUID v7 | |
| `agentId` | text | NOT NULL, FK → `agent.id` ON DELETE RESTRICT | Agent soft-deletes first |
| `title` | text | NOT NULL DEFAULT `''` | |
| `titleIsManual` | integer (bool) | NOT NULL DEFAULT `false` | |
| `executionTarget` | text (json) | NOT NULL DEFAULT `{"kind":"local"}` | Mobile app execution boundary, never a Runtime id or remote-control target |
| `lastActivityAt` | integer | NOT NULL | Updated only when a turn reserves or finalizes |
| `createdAt` / `updatedAt` | integer | helper defaults | Hard delete; no `deletedAt` |
| `forkedFromSessionId` | text | FK → `agent_session.id` ON DELETE SET NULL | Fork lineage; `NULL` for an ordinary Session and reset to `NULL` when the source is deleted |

Indexes: `agent_session_agent_id_idx`, `agent_session_last_activity_idx` (list ordering is
recency; no `orderKey`).

### `agent_session_message`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | text | PK, UUID v7 | Time-ordered; transcript order is `(createdAt, id)` |
| `sessionId` | text | NOT NULL, FK → `agent_session.id` ON DELETE CASCADE | |
| `turnId` | text | NULL, indexed | Correlation id shared by a submission's user/assistant pair; nullable per protocol |
| `role` | text | NOT NULL, CHECK `user`/`assistant`/`system` | No `root`: transcript is linear |
| `data` | text (json) | NOT NULL | `{ version: 1, parts: AgentMessagePart[] }` |
| `status` | text | NOT NULL, CHECK in 6 protocol statuses | `pending` … `interrupted` |
| `usage` | text (json) | NULL | Assistant messages only |
| `error` | text (json) | NULL | Turn-level `AgentErrorView`, including the versioned failure snapshot when available; projected into `AgentTurnView.error`, not part of the message view |
| `contextCheckpoint` | text (json) | NULL | Versioned opaque Runtime context artifact; successful assistant terminal rows only |
| `modelId` | text | NULL, FK → `user_model.id` ON DELETE SET NULL | Model selected when the assistant placeholder was reserved |
| `messageSnapshot` | text (json) | NULL | Versioned Agent inference snapshot; raw JSON retained for unknown versions |
| `searchableText` | text | NOT NULL DEFAULT `''` | Trigger-populated |
| `ftsRowid` | integer | NULL, UNIQUE | Stable FTS5 `content_rowid`, trigger-assigned |
| `createdAt` / `updatedAt` | integer | helper defaults | Hard delete via session cascade |

Indexes: `(sessionId, createdAt)`, `turnId`, `status` (backs boot reconciliation), unique
`ftsRowid`, and the invariant-1 guard:

```sql
UNIQUE (session_id) WHERE role = 'assistant' AND status IN ('pending', 'streaming')
```

At most one active turn per Session is a database constraint, not service discipline: a
concurrent second submission fails the reservation insert. (Partial indexes serve uniqueness
enforcement here; the plain `status` index exists because Drizzle's bound `status = ?` queries
cannot match a partial index — see `message.ts`.)

`data.parts` is exactly the protocol's `AgentMessagePart` union
([contract](../../../src/shared/contracts/agent.ts)); the version field guards future part-shape
migrations. FTS mirrors the chat `message` architecture (external-content FTS5 table keyed on
`ftsRowid`, idempotent statements in the schema module, executed via `customSql.ts`) with an
agent-specific extraction expression: `text` parts only. `reasoning` is model-internal and
deliberately not searchable; tool payloads are structured data, not prose.

`reserveSubmission` writes the selected `modelId` and `AgentInferenceSnapshotV1` on the assistant
placeholder in the same transaction as the user/assistant pair. The existing nullable columns from
the Agent Session schema are reused, so this contract requires no table rebuild. The column does
not store the Chat `MessageSnapshot` shape. Reads validate known versions with the Agent-specific
schema, return `null` for old rows, and retain unknown raw JSON behind an `unsupported` projection.
Model deletion may null the foreign key but never rewrites the historical snapshot.

## Store port and adapter

The `AgentSessionStore` port reshapes to message-centric operations; the Host owns the Turn
projection:

- *Reserve* inserts the user message and assistant placeholder (shared fresh `turnId`) in one
  `DbService.withWriteTx()` transaction (invariant 2). *Finalize* settles the assistant message —
  status, parts, usage, turn-level error, and an optional validated context checkpoint — in one
  write (invariant 5). Failed, cancelled, and interrupted terminal rows force the checkpoint to
  `NULL`. The error part and turn-level error column receive the same `AgentErrorView`; historical
  rows without a failure snapshot remain valid. `deleteSession` is one cascading delete.
- `forkSession` inserts the new Session and every copied message in one `withWriteTx` transaction.
  It copies `titleIsManual` and `executionTarget` from the source, takes `title` from the caller
  or else from the source, sets
  `forkedFromSessionId`, and stamps `lastActivityAt` to now so the fork sorts to the top of the
  recency list. Copied rows keep `createdAt`, `role`, `data`, `status`, `usage`, `error`,
  `modelId`, and `messageSnapshot` verbatim; `turnId` is reissued through a per-fork map so pairing
  survives without colliding across Sessions; `contextCheckpoint` is forced to `NULL` because a
  checkpoint anchors to a turn that no longer exists. Keeping `createdAt` deliberately breaks the
  "never set timestamps by hand" rule: transcript order is `(createdAt, id)`, the source is already
  ordered, and the reissued UUID v7 ids break ties in the same direction, so copying the value
  preserves order while stamping "now" on every row would be visibly wrong in the UI.
  `searchableText` and `ftsRowid` are left to the insert trigger, which is race-free because the
  whole copy runs inside the serialized write transaction.
- The latest assistant row with a non-null checkpoint is the replay candidate. The Host validates
  schema version, anchor membership, and the 256 KiB payload ceiling. Invalid, incompatible,
  oversized, or orphaned candidates are classified in logs and ignored; execution receives full
  history instead. The store resolves anchor membership and loads rows after the anchor directly;
  it also returns lightweight full-transcript Turn-id and file-reference indexes, so the Host does
  not materialize the complete transcript merely to discard its checkpoint-covered prefix.
- Turn reads and live-status transitions leave the store: the Host holds the active turn's live
  state (`running`/`awaiting-approval`/`cancelling`) in memory and synthesizes `AgentTurnView`
  from it plus the assistant message row. Terminal statuses derive from the message row alone,
  so transcript-history turns need no extra reads.
- The invariant-1 partial unique index turns a concurrent second reservation into a constraint
  violation the Host maps to `SESSION_BUSY`.
- `reconcileInterrupted` is one bulk `UPDATE` over unsettled messages at `PostReady`, same phase
  the in-memory adapter occupies today.
- Approvals stay in Host/adapter memory, cleared on destroy — live-process state by design (see
  Decisions), not a missing table.
- Row ↔ view mapping converts epoch millis to ISO strings and validates `data` against the
  protocol schema on read paths that leave the store.

A shared store conformance suite runs against both adapters, mirroring the Runtime conformance
approach. The Agent Protocol, including `AgentTurnView`, its events, and its invariants, remains
independent of the Host-private storage boundary.
