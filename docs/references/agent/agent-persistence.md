# Agent Persistence

Status: **schema, durable store, Agent CRUD, Session reads, managed attachment references, Runtime
context checkpoint storage, and frontend integration active in production**. Version 1 is
local-only.

This document defines the durable SQLite schema behind the Host-owned
[`AgentSessionStore`](../../../src/backend/ai/agentHost/AgentSessionStore.ts) port and the rollout
plan for replacing the in-memory reference adapter. It implements the storage side of the
[Agent Protocol](./agent-protocol.md) and follows the authority model direction of
[#568](https://github.com/CherryHQ/cherry-studio-app/issues/568): mobile SQLite is the complete
record for mobile-originated Agent Sessions only.

## Scope

- Three new tables: `agent`, `agent_session`, `agent_session_message`, plus an FTS index for
  message search.
- A message-centric reshape of the `AgentSessionStore` port: the protocol's Turn becomes a Host
  projection over the assistant message plus Host-held live state. The Agent Protocol itself does
  not change.
- A `SqliteAgentSessionStore` adapter that is the production `AgentSessionStore` binding;
  `InMemoryAgentSessionStore` remains as the conformance-suite reference adapter.
- Agent CRUD plus cursor-paginated Session and transcript reads through the Data API, and an
  Agent-table-backed `AgentDefinitionSource` used by the production Host. Session renames and
  deletes delegate to the Host so an active turn is cancelled and drained before rows disappear.
  The `agent` table intentionally starts empty; retired Assistant data is discarded rather than
  migrated.

Out of scope: branching columns, background turns, tool configuration storage, Mobile Skill
configuration/loading, and broader Pi provider coverage. The retired `assistant`/`topic`/`message`
tables were removed separately after Agent surfaces became authoritative. The current three-table
schema must still be described as tool-less.

## Current limitations

The Agent Data API, `Backend.agent`, and frontend surfaces share these current constraints:

- Session observation currently resolves the live Agent definition first. Soft-deleting an Agent
  or clearing its model can therefore make its existing Sessions unavailable through the public
  Host API even though their rows remain durable. The Data API's static Session and transcript
  reads remain available without resolving an executable Agent definition.
- Concurrent partial updates to one Agent's settings are last-writer-wins and can lose independently
  updated fields because the read/merge happens before the serialized write transaction.
- Batch reorder callers must provide unique Agent ids. Duplicate ids can currently be reported as
  `NOT_FOUND`, despite the underlying ordering helper otherwise using the last move for an id.

## Decisions

**Agent tables were parallel first, then the old schema was dropped.** The retired `message` table
was a parent-linked tree while an Agent Session transcript is linear
([Branching](./agent-protocol.md#branching) forks into a new Session instead). Old data was
deliberately discarded rather than converted between incompatible models.

**No persisted Runtime identity.** There is no `runtime_binding` column. Runtime ids never appear in
protocol values or application data ([Agent Runtime](./agent-runtime.md), protocol invariant 10).
Version 1 has one execution target and one local engine: `local → Pi`. Application composition
injects Pi directly into the Host, so there is no local implementation choice to persist.
`contextCheckpoint` does not change this decision: it is a versioned, Runtime-produced content
artifact anchored to a durable turn, not an engine id, resumable Runtime instance, provider cursor,
or routing choice. The Host treats its payload as opaque and a process restart still interrupts an
active turn.

**No workspace; controlled resources come from managed references.** A desktop workspace encodes a
working directory and filesystem/shell execution environment; mobile has neither, so Sessions carry
no workspace reference. `execution_target` carries application intent (`{"kind":"local"}` in V1).
For Version 1, every file is imported into `file_entry` before submission or tool use. The Host
initializes a turn resource ledger from managed file ids in the current input and Session transcript,
then may add only validated entries created by application capabilities during that turn. Those
durable references already live on messages, while the monotonic same-turn ledger is process-local,
so no generic `resource_scope` column is added. A future broad Agent-to-library grant requires an
explicit relation rather than a directory path or opaque JSON scope.

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
protocol keeps Turn as a UI-facing concept unchanged. An earlier draft kept an `agent_turn`
table to avoid reshaping the already-implemented store port; with zero consumers of
`Backend.agent`, fitting the schema to the code rather than the requirement was the wrong
trade and the port is reshaped instead. If background or parallel turns ever become product
requirements, a turn (or execution) entity earns its table then.

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
user-visible library content with independent lifecycle; an avatar is replace-in-place and dies
with the Agent.

**Delete semantics.** `agent` soft-deletes (`deletedAt`), so Sessions never orphan; hard cleanup of
an Agent is refused while Sessions exist (`RESTRICT`). `agent_session` hard-deletes and cascades
messages — matching the store port's `deleteSession` contract. Before deleting rows, the Host
installs a per-Session barrier, waits any already-admitted submission to install its turn state,
then cancels and drains that turn. New submissions fail closed until deletion finishes. Messages
are never deleted individually in V1.

**Tool and Skill configuration has not migrated.** The current foundation schema has neither and
must not be described as tool-capable persistence. Tool ownership and the logical binding direction
are settled in
[Agent Tools And Controlled Resources](./agent-tools-and-resources.md#tool-catalog-and-bindings).
For Skills, only the ownership boundary is settled: the current Agent configuration selects the
mobile-supported Skills available to its Sessions. The physical schema and loading behavior remain
deferred. Desktop `agent_global_skill` / `agent_skill` metadata and relations must be retained for
data parity without treating desktop Skill content as mobile-executable. Pi reads neither tool nor
Skill persistence directly.

**Naming and types.** DB columns use the protocol vocabulary (`title`, `titleIsManual`), not a
second synonym set. Timestamps are integer epoch millis via `createUpdateDeleteTimestamps`; the
store maps to the protocol's ISO strings at the boundary. `agent` uses UUID v4 (like `assistant`);
`agent_session` and `agent_session_message` use time-ordered UUID v7 (`uuidPrimaryKeyOrdered`).
Agent updates advance `updatedAt` with `max(previous + 1, wall clock)` inside the serialized write
transaction. The composer can therefore use it as a strict row version when reconciling optimistic
model selection with settings edits and inactive query caches.

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
| `settings` | text (json) | NOT NULL | Inference params (temperature, reasoning, max tokens) |
| `orderKey` | text | NOT NULL | `orderKeyColumns` fractional index |
| `createdAt` / `updatedAt` / `deletedAt` | integer | helper defaults | Soft delete via `deletedAt` |

Indexes: `orderKeyIndex('agent')`, `agent_created_at_idx`.

### `agent_session`

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | text | PK, UUID v7 | |
| `agentId` | text | NOT NULL, FK → `agent.id` ON DELETE RESTRICT | Agent soft-deletes first |
| `title` | text | NOT NULL DEFAULT `''` | |
| `titleIsManual` | integer (bool) | NOT NULL DEFAULT `false` | |
| `executionTarget` | text (json) | NOT NULL DEFAULT `{"kind":"local"}` | Application intent, never a Runtime id |
| `lastActivityAt` | integer | NOT NULL | Updated only when a turn reserves or finalizes |
| `createdAt` / `updatedAt` | integer | helper defaults | Hard delete; no `deletedAt` |

Indexes: `agent_session_agent_id_idx`, `agent_session_last_activity_idx` (list ordering is
recency; no `orderKey`).

Future additive columns (not created now): `forkedFromSessionId`, `forkedFromMessageId`
([Branching](./agent-protocol.md#branching)).

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
| `error` | text (json) | NULL | Turn-level `AgentErrorView`; projected into `AgentTurnView.error`, not part of the message view |
| `contextCheckpoint` | text (json) | NULL | Versioned opaque Runtime context artifact; successful assistant terminal rows only |
| `modelId` | text | NULL, FK → `user_model.id` ON DELETE SET NULL | Model actually used |
| `messageSnapshot` | text (json) | NULL | Model/provider/params at call time |
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

## Store port and adapter

The `AgentSessionStore` port reshapes to message-centric operations; the Host owns the Turn
projection:

- *Reserve* inserts the user message and assistant placeholder (shared fresh `turnId`) in one
  `DbService.withWriteTx()` transaction (invariant 2). *Finalize* settles the assistant message —
  status, parts, usage, turn-level error, and an optional validated context checkpoint — in one
  write (invariant 5). Failed, cancelled, and interrupted terminal rows force the checkpoint to
  `NULL`. `deleteSession` is one cascading delete.
- The latest assistant row with a non-null checkpoint is the replay candidate. The Host validates
  schema version, anchor membership, and the 256 KiB payload ceiling. Invalid, incompatible,
  oversized, or orphaned candidates are classified in logs and ignored; execution receives full
  history instead.
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

The existing `InMemoryAgentSessionStore` behavior tests generalize into a store conformance suite
run against both adapters, mirroring the Runtime conformance approach. The Agent Protocol —
including `AgentTurnView`, its events, and its invariants — does not change; only the Host-private
storage boundary moves.

## Rollout

1. **Port reshape.** Move Turn projection and live state into the Host, slim `AgentSessionStore`
   to message-centric operations, and update the in-memory adapter and conformance tests. This
   lands first so the schema implements the settled port.
2. **Schema + migration.** Add the three schema modules, run `pnpm db:generate`, register the SQL
   in `migrations.ts`, add the agent FTS statements to `customSql.ts`.
3. **`SqliteAgentSessionStore`.** Implement against the port, pass the shared conformance suite,
   and bind it as the production `AgentSessionStore` in `serviceRegistry` (done — the in-memory
   adapter remains the conformance reference).
4. **Agent rows.** Expose Agent CRUD through the Data API and use the `agent`-table-backed
   `AgentDefinitionSource` in the production Host (done). The table starts empty and retired
   Assistant data is not copied.
5. **Session reads.** Expose recency-ordered Session lists and cursor-paginated linear transcript
   history through the Data API. Keep these historical reads independent of executable Agent
   lookup, and route Session rename/delete through the Host lifecycle boundary (done).
6. **Frontend and retirement.** Agent UI consumes `Backend.agent`; the incompatible legacy Chat
   tables/runtime are removed without data conversion (done).
7. **Follow-ups (separate implementation slices).** Avatar workflow (generalizing
   `userAvatarStorage`), tool/Skill binding persistence, managed attachment and artifact
   projection, fork columns, and broader Pi provider coverage.

## Rejected alternatives

- `runtime_binding` column — Version 1 has one local engine and no local implementation choice.
- Generic `resource_scope` column — Version 1 file authority derives from explicit managed file refs
  already persisted in input and transcript parts plus the process-local monotonic turn ledger. A
  later broad library grant needs a normalized Agent-to-file relation, not an opaque scope blob.
- `agent_turn` table — kept in an earlier draft to avoid reshaping the already-implemented store
  port, i.e. fitting the schema to the code. By requirement, every durable turn fact lives on the
  assistant message and every live turn state is process-local; with zero consumers of
  `Backend.agent`, the port reshape is cheaper now than a redundant entity forever.
- `agent_approval` table — every row is dead after restart because a turn is never resumed.
- `emoji` column / `file_entry` avatar — avatars are managed derived files, not library content.
- Session soft delete — the store contract is hard delete; soft delete would leak into every
  query and the partial unique index.
- Session `orderKey` — session lists order by recency (`lastActivityAt`).
