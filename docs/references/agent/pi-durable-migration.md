# Experimental Pi Durable Migration

The local entry uses `PiDurableAgentRuntime` behind `MobileAgentHost` and `DurableAgentHost`.
This branch implements Cherry-owned history with disposable Pi execution working copies. Runtime
and device acceptance of this ownership change have not been run.

## Ownership

| Data | Owner |
| --- | --- |
| Sessions, titles, complete message parts, errors, timing, file references, search | `cherry.db` |
| Successful assistant/tool model replay, including signed content | Cherry message `replay` |
| Saved compacted/reset model context at a Cherry turn boundary | Cherry message `contextCheckpoint` |
| Admitted inputs, tasks, progress, execution recovery and active model context | `pi-agent.db` |
| Accounts, permissions, managed resources and usage ledger | Cherry application services |

One application generation owns one Pi Harness and one independent `pi-agent.db`. Upstream
`SqliteStorage` owns its schema and migrations. `AgentSqlDatabase` supplies a queued Expo SQLite
connection; the data layer imports no Pi types. A failed rollback poisons the connection. The
application does not edit upstream tables or depend on their deletion order.

Pi is a durable execution working copy, not the long-term transcript owner. A running copy must be
preserved until its tasks settle and their results reach Cherry. Display, search, selection and
export read the complete Cherry rows directly, including before the Host is ready or while it is
suspended. Live Pi events overlay the currently executing answer.

## Admission And Settlement

1. Prepare current model/tools, managed-file authorization and input. If no current Pi copy exists,
   rebuild it from Cherry without running a model or historical tools.
2. Atomically reserve the Cherry session (for an initial input) and its user/assistant pair. The
   assistant is `pending`; its fresh `turnId` is also the native request identity.
3. Admit the input to Pi. Execution checks that the Cherry owner and history revision still match.
4. On native completion, write full parts, status, usage, error, timing, replay and checkpoint in one
   Cherry transaction. Publish terminal message/turn events only after that transaction commits.

Each `pending`/`streaming` assistant row is its own durable settlement receipt. No single
`projectedThroughRequestId` cursor can skip a failed write. Before another submission, on startup,
and before backup, reconcile these rows against Pi: copy a matching terminal result, preserve a
matching queued/running task, or mark an unadmitted reservation interrupted. A failed Cherry write
leaves its row unsettled and the Pi result intact for retry. Late results cannot finalize a
replacement execution because finalization checks `turnId`.

This intentionally reserves Cherry identities **before** Pi admission: a crash may leave an
interrupted placeholder, but never requires recreating a deleted session from Pi metadata. There
is no creation-seed replay or cross-database text-index repair. SQLite triggers maintain FTS from
settled message rows. Pi serializes execution and accepts queued follow-ups, so multiple pending
assistant reservations are allowed; one active execution is enforced by Pi's scheduler.

## Rebuilding Model Context

A new working copy imports the latest usable Cherry checkpoint and the following transcript tail.
A successful turn uses its stored model replay; old rows without a supported replay normalize their
parts into paired model/tool messages. File access is rebuilt from managed-file references in the
Cherry transcript. Importing even oversized history only appends entries: the next actual Pi turn
owns compaction.

The new `pi-durable-context-v1` checkpoint stores the public Pi `ContextView`'s retained messages,
excluding system text supplied by current configuration. Its anchor is the completed Cherry turn,
not an upstream entry id. This preserves partial-turn compaction and reset without translating Pi
entry boundaries. Payloads above 256 KiB produce no checkpoint; the complete transcript remains
available. Old `pi-context-compaction` summaries remain importable. Missing or invalid replay falls
back to normalized parts; malformed checkpoint payloads are never silently treated as empty history.

Settlement reads context at the completed answer. Before idle file reclamation or backup, the Host
also captures current context to include background compaction that completed after the answer.
Stored replay preserves model content/signatures while excluding transport diagnostics and billing;
it is durable data, copied by forks and included in backups, rather than an MMKV cache.

## Fork, Retry And Delete

Forks copy Cherry message rows and replay with new message/turn identities. Checkpoints are cleared
because their old turn anchors are not valid in the copy. The new session creates an independent Pi
conversation on its first submission; it never uses Pi's shared-history fork tree.

Regenerating a successful or older answer copies the prefix before its question into a new Cherry
session and submits the original input. Retrying the latest failed answer retains its message ids,
issues a new turn id, and rebuilds a fresh copy. A recorded completed-tool prefix is imported as
history and a continuation input asks for the remaining answer; historical tools are not executed
by import.

Deleting a session aborts native work, drains settlement/usage, hard-deletes Cherry rows with their
messages, then retires the Pi binding through public APIs. Fork copies survive independently.
Deleting a settled turn removes both Cherry rows, clears checkpoints that may include it, and
increments `runtimeRevision` in the same transaction. Retry increments this revision too. A stale
copy is rejected after a crash even if retirement failed. A missing Cherry session never reappears.
Deletion does not undo tool side effects or erase the independent usage ledger.

`retireDoc` detaches application bindings; upstream entries are physically reclaimed with the
whole Pi file at the next initialization that has no unfinished native work. Thus deletion removes
Cherry data immediately, while retired Pi bytes can remain until that idle initialization. There
is no raw SQL erasure, archive tombstone, hidden-turn document or descendant-reclamation chain.
A continuously busy process can retain its working file until a later idle initialization.

## Startup And Background Work

Open both stores, reject unsupported old ownership bindings, discard missing/stale Cherry owners,
reconcile unsettled rows and drain the usage outbox. If no tasks or pending inputs remain (including
background compaction), save current checkpoints, close Pi, delete its database file and reopen an
empty one. Otherwise preserve it, reconstruct dependencies for unfinished sessions, attach observers
and only then resume scheduling.

Ordinary shutdown and OS execution expiry close invocations without abort marks. Foreground startup
reopens retained tasks. Explicit user stop invokes Pi abort. Unsafe tools do not automatically
re-execute after interruption. Current accounts, tool implementations and approval policy are
reconstructed; credentials are resolved at request time and never serialized. Native task demand,
including background compaction, holds the KeepAlive lease. Usage has a durable idempotent outbox;
compaction usage belongs to the session rather than an invented assistant turn.

## Backup And Compatibility

Backup format v1 contains `cherry.db` and managed resources. Capture blocks new mutations, requires
native work to be idle, repairs unsettled rows, drains usage and captures the final context before
copying Cherry. Restoring starts with an empty Pi file and rebuilds working copies on demand.
`pi-agent.db` is never a backup entry; experimental paired format v2 is rejected.

The earlier experimental Pi-authoritative branch is not a supported migration input: some of its
Cherry rows contain text indexes rather than complete messages, and its `0003` migration differs.
A Pi binding without a valid working-copy revision causes initialization to fail while preserving
the file, rather than deleting potentially unique history. Such experimental data needs a separate
explicit conversion; do not delete its Pi file to bypass the guard. Ordinary pre-experiment Cherry
history gains nullable replay and revision zero through the additive migration.

## Validation Status

Regression sources cover reservation ordering, recovery before reclamation, failed settlement,
independent forks, revision invalidation, replay persistence and import, queued inputs and backup
format boundaries. For this ownership change, only formatting and static linting are run; tests,
type checks, builds and device verification remain pending explicit user authorization. No runtime
acceptance result from the earlier Pi-authoritative experiment validates this design.
