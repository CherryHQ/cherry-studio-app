# Experimental Pi Durable Migration

The local entry uses `PiDurableAgentRuntime` behind `MobileAgentHost` and `DurableAgentHost`.
This branch implements Cherry-owned history with disposable Pi execution working copies. Runtime
and device acceptance of this ownership change have not been run.

## Pi 1.2.0 Upgrade

`pi-durable`, `pi-ai`, `pi-codemode`, and `chord` are pinned together at `1.2.0`.
The package-specific [Durable changelog](https://github.com/earendil-works/pi/blob/v1.2.0/packages/durable/CHANGELOG.md)
and [Chord changelog](https://github.com/earendil-works/pi/blob/v1.2.0/packages/chord/CHANGELOG.md)
describe additional breaking changes beyond the coding-agent-focused release notes.

Summaries omit reasoning blocks, and a failed blocking compaction fails the generation rather than
sending an oversized request. The default document retention is ten minutes; on runtimes without
unreferenced timers, expired documents are evicted after commits. Mobile keeps these upstream
defaults until device measurements justify tuning.

Mobile compatibility changes and boundaries:

- Tool implementations return model-visible `output` instead of `content`. This includes built-in
  and MCP results. Success results also expose structured output for script callers. Stored
  `ToolResultMessage.content` and Cherry's full `details` remain unchanged.
- Newly created `ToolTask` inputs carry `kind: 'model'`. Upstream migrates live version-1 `pi.tool`
  tasks to version 2; an unsafe execution intent still becomes an interrupted result after restart.
  The published SQLite schema/migrations are unchanged, and no Cherry database migration is needed.
  Do not assume a downgrade to 1.1 can resume tasks already migrated to version 2.
- Chord replaced its host/service APIs, but Mobile uses the retained JSON, context, and delta APIs.
  The Hermes numeric-key patch remains necessary. Pi AI's native OAuth, Metro import isolation,
  structured provider errors, and streaming-JSON patches also remain necessary and are rebased
  against the published 1.2.0 files.
- MCP discovery uses upstream deferred tools and `tool_search`; the custom discovery/dispatch layer
  is removed. A Unicode tokenization patch preserves Chinese lookup. The patch also exposes a
  managed output writer for Code Mode. `pi-codemode` gains a small native export containing its
  host protocol and prelude without importing the WASM launcher.
- Code Mode runs through that upstream extension and the existing native QuickJS engine. Native
  changes add bidirectional JSON delivery, virtual clocks, deterministic seeding and compute
  budgets. Cherry retains tool approval, artifact admission, shared call budgets, failure-group
  policy and model-backed capability attribution. Completed parents preserve upstream child-call
  summaries; live child results no longer appear interrupted merely because they have no transcript
  entry. A client whose native module predates the bridge offers no JavaScript capability until
  rebuilt; stored `run_js` results remain readable.
- Upstream `models.*` stays disabled. `store/load` remains disposable working data, not a new
  Cherry backup/fork contract. Custom input/display record migration and directory enumeration
  are deferred. Explicit managed image reads reuse the native image normalizer; no Photon loader
  is added to the mobile runtime graph.
- Compaction progress and failure are transient conversation events, shown in chat and restored
  from upstream snapshots. Failure clears when a successful summary is committed.
- A guarded storage failure closes the shared Pi session, releases its work lease, notifies open
  chats and suspends the Host. Retry observation or foreground resume reopens its working copies;
  it does not manufacture terminal Cherry messages or erase unfinished receipts. No automatic
  retry loop runs against failed storage. Subscriber errors are reported through `onReport`.

Device acceptance for this upgrade covers queued-input recovery, tool approval, a Code Mode script
that calls tools, long-context compaction, and storage-failure recovery.

## Ownership

| Data | Owner |
| --- | --- |
| Sessions, names, complete message parts, errors, timing, file references, search | `cherry.db` |
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
4. On native completion, write full parts, status, token counts in `stats`, error, timing and
   checkpoint in one Cherry transaction. Publish terminal message/turn events only after that transaction commits.

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

A working copy is rebuilt only when none exists: the first continuation of a pre-Pi session, after
a fork, retry or turn deletion, and after the Pi file itself has been removed. The rebuild imports
the latest usable Cherry checkpoint and the following transcript tail, normalizing stored parts into
paired model/tool messages. Stored parts carry no provider signature, so historical reasoning is
omitted rather than resent as plain text; the model continues from the visible answers and tool
results. File access is rebuilt from managed-file references in the Cherry transcript. Importing
even oversized history only appends entries: the next actual Pi turn owns compaction.

The new `pi-durable-context-v1` checkpoint stores the public Pi `ContextView`'s retained messages,
excluding system text supplied by current configuration. Its anchor is the completed Cherry turn,
not an upstream entry id. This preserves partial-turn compaction and reset without translating Pi
entry boundaries. Payloads above 256 KiB produce no checkpoint; the complete transcript remains
available. Old `pi-context-compaction` summaries remain importable; a split offset they recorded
against a native replay retains the whole turn instead. Malformed checkpoint payloads are never
silently treated as empty history. Retained messages may include image pixels when the checkpoint
fits the limit; visible transcript file parts retain references only, so reconstruction without
a usable checkpoint requires another `read_file` call when those pixels are needed.

Settlement reads context at the completed answer. Before backup, the Host also captures current
context to include background compaction that completed after the answer. There is no stored model
replay: the Pi working copy itself keeps signed content between launches, and Cherry keeps only the
transcript. The pre-Pi MMKV replay cache is cleared once when the Host dependencies become ready.

## Fork, Retry And Delete

Forks copy Cherry message rows with new message/turn identities. Checkpoints are cleared
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

`retireDoc` detaches application bindings; the unreachable upstream entries stay in the Pi file.
Deletion removes Cherry data immediately, while retired Pi bytes remain inside the app sandbox until
a separate cleanup feature removes orphaned conversations. The file is never part of a backup, and
switching or resetting storage deletes it with `cherry.db`. There is no raw SQL erasure, archive
tombstone, hidden-turn document or descendant-reclamation chain.

## Startup And Background Work

Open both stores, reject unsupported old ownership bindings, discard missing/stale Cherry owners,
reconcile unsettled rows and drain the usage outbox. The Pi file persists across launches, so idle
working copies keep their native context, signatures and compaction state; continuing a conversation
after a restart never rebuilds it. Reconstruct dependencies for unfinished sessions, attach observers
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
The current lineage keeps main’s `0003_align_agent_fields`, appends `0004_agent_message_replay`
for runtime revisions and queued-input reservations, and `0005_drop_agent_message_replay` removes
the interim `replay` column that `0004` added before stored replay was abandoned.
A Pi binding without a valid working-copy revision causes initialization to fail while preserving
the file, rather than deleting potentially unique history. Such experimental data needs a separate
explicit conversion; do not delete its Pi file to bypass the guard. Ordinary pre-experiment Cherry
history gains revision zero through the additive migration.

## Validation Status

Regression sources cover reservation ordering, recovery before reclamation, failed settlement,
independent forks, revision invalidation, normalized history import, queued inputs and backup
format boundaries. For this ownership change, only formatting and static linting are run; tests,
type checks, builds and device verification remain pending explicit user authorization. No runtime
acceptance result from the earlier Pi-authoritative experiment validates this design.
