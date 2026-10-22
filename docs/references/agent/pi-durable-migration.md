# Experimental Pi Durable Migration

The local entry uses `PiDurableAgentRuntime` behind `MobileAgentHost` and `DurableAgentHost`.
This branch implements Cherry-owned history with disposable Pi execution working copies. Runtime
and device acceptance of this ownership change have not been run.

## Pi 1.4.0 Upgrade

`pi-durable`, `pi-ai`, `pi-codemode`, `chord`, and the transitive `pi-telemetry` are pinned together
at `1.4.0`. The four remaining patches are rebased against the published npm packages. Relevant
upstream sources are the [Durable changelog](https://github.com/earendil-works/pi/blob/v1.4.0/packages/durable/CHANGELOG.md)
and [Pi AI changelog](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/CHANGELOG.md).

- Cherry document definitions explicitly set `checkpointWhen: () => false`, retaining the previous
  delta-only policy rather than changing stored document behavior during the upgrade.
- `afterFailedRun: 'continue'` replaces the local generation failure-boundary patch. Missing models,
  final provider errors and failed blocking compactions settle their inputs and advance queued work.
- Sleeping tasks and tasks blocked by the restart limit remain unfinished work for storage and
  recovery, but do not hold native execution protection. The Harness keeps its built-in sleep
  timer; Mobile does not install `onWake` or add a second scheduler. This does not grant background
  execution time when the OS suspends the app.
- A foreground task parked by `restart_limit` is projected as `isPaused` while the turn remains
  running. The chat status explains that the user can stop the reply and retry. Background tasks
  do not pause the reply's presentation; the existing stop/retry flow owns cancellation and replay.
  Mobile does not call `harness.retryTask()`: rerunning a task that crashed its process repeatedly
  would repeat the same crash, while stop/retry settles the turn and starts from Cherry history.
- Compaction uses exact `provider/modelId` overrides from registered model limits. Reply reserve
  is capped at 16,384, the model output limit, and one eighth of the usable context; recent context
  and background headroom are capped at 20,000 and 32,768 respectively, each at most one quarter
  of the usable context. Large-window models retain Pi defaults when their output limits allow it.
  Image scheduling models disable compaction. This does not remove Durable's upstream summary
  output cap of 80% of reserved tokens.
- Model requests, including provider checks, identify Cherry Studio Mobile. `onReport`
  distinguishes session failures, task faults, parked tasks, extension errors and host/listener
  errors in the existing logger. This change does not introduce a new telemetry pipeline.
- Pi AI preserves the 1.4.0 retry text improvements and ChatGPT Business workspace-limit hint
  alongside Mobile's structured diagnostics and terminal subscription-limit classification.

This upgrade uses the existing working-file clearing flow. Before updating an existing installation,
finish or cancel active/queued work, then use **Clear conversation runtime cache**. The flow settles
pending output and usage, captures context, closes the runtime, discards the working file and opens
an empty copy. Cherry history remains authoritative; no Cherry migration or legacy queue transfer
is added. The upgrade does not automatically delete a user's file.

Pi's SQLite schema is now version 2. Upstream migrates a retained version-1 file, including an empty
file reopened by the old clear action, but 1.3.0 cannot open version 2. Before downgrading, discard
the closed working file before the older runtime opens it. Recovery of legacy orphaned inboxes
(queued input with no live run) is outside this clearing/rebuild upgrade scope, so its startup
repair patch is retired; it was not fixed upstream.

The full test suite, type checks, lint and iOS/Android `expo export:embed` bundles pass for this
upgrade, including failed-run queue progression, runnable-work protection, parked-state projection,
small-model compaction policies and the Metro graph guard. iOS simulator acceptance with real
CherryIN calls passed plain replies, queued follow-ups, Code Mode scripts and managed output files,
recovery after killing the app mid-reply, provider checks, and continuing a conversation after
clearing the runtime cache. Android was not run.

## Previous Pi 1.3.0 Upgrade

The previous upgrade moved `pi-durable`, `pi-ai`, `pi-codemode`, and `chord` together to `1.3.0`, including the
transitive `pi-telemetry` dependency. The package-specific
[Durable changelog](https://github.com/earendil-works/pi/blob/v1.3.0/packages/durable/CHANGELOG.md),
[Pi AI changelog](https://github.com/earendil-works/pi/blob/v1.3.0/packages/ai/CHANGELOG.md),
and [Chord changelog](https://github.com/earendil-works/pi/blob/v1.3.0/packages/chord/CHANGELOG.md)
describe additional breaking changes beyond the coding-agent-focused release notes.

The system baseline now leads the model context after compaction or history import even when
retained assistant messages precede it. Completed tool calls require complete JSON objects after
supported string repairs: truncated input carries `argumentsError` and fails validation instead
of executing a partial prefix.
The streaming-JSON performance patch only changes partial previews and preserves this final-call
boundary. Switching models drops the previous model's reasoning rather than converting it to text.

Kimi Code's preset now defaults to OpenAI Chat Completions at `https://api.kimi.com/coding/v1`.
Existing saved Anthropic endpoint settings remain readable: the Pi OAuth model catalog selects
the actual request protocol, official URL, and compatibility options. The normal preset refresh
adds the new endpoint without replacing user settings; no database migration is introduced.

SQLite table prefixes remain unused with the independent `pi-agent.db`; the default table names
and schema version are unchanged. Chord's host/reference API changes are outside Mobile's current
integration. Code Mode uses the native launcher, whose stop still waits for native cleanup, rather
than the Node/Bun worker launcher whose shutdown semantics changed in 1.3.0.

GPT-6's cache-preserving effort changes remain disabled. This upgrade covers conversations that
keep the same thinking level: with the same model and configuration, Cherry's request-parameter
owner emits the same `reasoning.effort`, so rewriting that field does not introduce effort-related
cache invalidation. Mid-conversation effort switching is outside this scope; no configuration
update items or effort-history state are added.

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
  The SQLite schema version remains 1, and no Cherry database migration is needed.
  Do not assume a downgrade to 1.1 can resume tasks already migrated to version 2.
- Chord replaced its host/service APIs, but Mobile uses the retained JSON, context, and delta APIs.
  The Hermes numeric-key patch remains necessary. Pi AI's native OAuth, Metro import isolation,
  structured provider errors, and streaming-JSON patches also remain necessary and are rebased
  against the published 1.3.0 files. None of the four functional patches is superseded upstream.
- MCP discovery uses upstream deferred tools and `tool_search`; the custom discovery/dispatch layer
  is removed. A Unicode tokenization patch preserves Chinese lookup. The patch also exposes a
  managed output writer for Code Mode. `pi-codemode` gains a small native export containing its
  host protocol and prelude without importing the WASM launcher.
- Code Mode runs through that upstream extension and the existing native QuickJS engine. Native
  changes add bidirectional JSON delivery, virtual clocks, deterministic seeding and compute
  budgets. Cherry retains tool approval, artifact admission, failure-group
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

Acceptance for this upgrade covers queued-input recovery, tool approval, a Code Mode script that
calls tools, long-context compaction and restored baselines, rejection of malformed final tool
arguments, Kimi authentication/tool calls, and storage-failure recovery. Regression sources are
updated; tests, type checks, builds, and device acceptance remain pending explicit authorization.

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

The composer observes queued inputs separately from active execution. Waiting reservations stay
out of the transcript, and an explicitly withdrawn input with no native input boundary has its
Cherry reservation removed without changing the runtime revision. Reconciliation repeats that
cleanup if a process stopped after native withdrawal but before the Cherry write.

The Pi 1.3.0 patch advances the next queued input after a terminal model failure. On open, it also
places waiting inputs of an ownerless conversation whose previous run has already ended. This
creates a pending run before scheduling is enabled; capability reconstruction still precedes any
execution. Existing live runs and task-owned conversations retain their normal recovery paths.

## Rebuilding Model Context

The fixed application prompt is the leading `cherry-runtime` system section. The local calendar
date is a separate `current-date` section, rendered when Pi prepares a model request rather than
frozen at input admission. Pi records a system update only when the date changes. Official DeepSeek
Responses and Chat Completions endpoints retain these updates in place, preserving the earlier
request prefix across midnight, queued inputs and process restarts. Other providers retain their
existing compatibility settings, which may fold updates back into the leading system message.
Compaction and history import restore the current date through Pi's normal system baseline;
no separate date state is stored.

Recovery resends an already prepared request with its persisted context cutoff, including the
date at preparation. It does not rebuild that in-flight request across midnight or an upgrade;
the next preparation refreshes the date. Queued inputs have not reached preparation yet and use
the date when their request is prepared.

Configuration v2 removes the automatic date block from released v1 prompts. Before resuming an
unfinished v1 conversation, recovery saves the migrated configuration and clears Pi's former
`instructions` field in one commit, preserving loaded tools and retained Skill/plugin instructions.
The next prompt preparation replaces the old section through Pi's normal system update mechanism.

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

## Branches, Fork, Retry And Delete

A Cherry Session's message tree runs on up to eight Pi conversations (working copies), one per
fixed slot. Slot 0 keeps the bare Session id as its Pi key, so every pre-branching Session is
unchanged; slot n uses `${sessionId}#${n}`. The key is private to the Pi adapter: runtime calls take
a typed `RuntimeLane` (`{ sessionId, slot }`), and execution identities always carry the Cherry
Session id plus the slot, so a working copy cannot be mistaken for a Session. Finding a Session's
copies probes its eight slot bindings once per runtime, and every binding change discards that
reading; no Session operation scans every copy in the engine.

A question below answer P continues the copy whose newest queued, running or settled answer is P,
natively forks the copy that executed P at P's answer boundary otherwise (shared history and
compaction state, no rebuild), and rebuilds from the Cherry branch when no current copy holds P.
Engine tails are read only until that choice is made. Several answers needing a rebuild rebuild one
copy, for the model that keeps the most history, and fork the rest from it; their preparation runs
concurrently and reads each attached image once.
A new copy takes a free slot, or replaces the least recently used idle copy. Copies are disposable:
Pi stores no Cherry identity mapping, and an empty or deleted Pi database only means every branch is
rebuilt from Cherry messages on its next use. A multi-model question gives every further answer its
own copy, runs them in parallel with only automatically approved read tools, and keeps the Session
busy until all of them settle; meanwhile further input is rejected rather than queued (Pi queues
input but not per-input configuration, and Cherry keeps no queue of its own; see
[Agent Protocol](./agent-protocol.md)). Rebuilds
restore the messages and history, not loaded tool instructions or Skill sections.

"Branch to a new chat" copies the selected branch into a new Cherry Session with new message/turn
identities. Checkpoints are cleared because their old turn anchors are not valid in the copy. The
new session creates an independent Pi conversation on its first submission.

Regenerating any settled answer reserves a sibling answer to the same question in the same Session
and submits the original input on its own working copy. Retrying a failed leaf answer retains its message
ids, issues a new turn id, and rebuilds a fresh copy. A recorded completed-tool prefix is imported as
history and a continuation input asks for the remaining answer; historical tools are not executed
by import.

Deleting a session aborts native work, drains settlement/usage, hard-deletes Cherry rows with their
messages, then retires the Pi binding through public APIs. Fork copies survive independently.
Deleting a settled turn removes both Cherry rows, clears checkpoints that may include it, and
increments `runtimeRevision` in the same transaction. Retry increments this revision too. A stale
copy is rejected after a crash even if retirement failed. A missing Cherry session never reappears.
Deletion does not undo tool side effects or erase the independent usage ledger.

`retireDoc` detaches application bindings; the unreachable upstream entries stay in the Pi file.
Deletion removes Cherry data immediately, while retired Pi bytes remain inside the app sandbox. The
file is never part of a backup, and switching or resetting storage deletes it with `cherry.db`.
There is no raw SQL erasure, archive tombstone, hidden-turn document or descendant-reclamation chain.

## Clearing The Working File

Pi Durable has no public conversation deletion. Copying only live conversations into a new file
is not lossless through the public Storage interface either: forks and rewinds read documents at
an entry's commit sequence, and commit history is not exposed. Reclamation therefore removes the
whole file, which Cherry ownership makes safe.

Clearing is manual only: **Settings → Data → Storage → Clear conversation runtime cache**, which
shows the file size including SQLite sidecars. Nothing clears it automatically, and the file stays
outside OS-purgeable cache directories: it also holds running and queued inputs, pending approvals,
undelivered usage receipts and settled answers that Cherry has not projected yet.

The Host runs the normal backup quiescence (idle native work, reconciled rows, drained usage and
captured context checkpoints), closes admission, suspends the runtime, deletes the file and reopens
an empty one. Busy work rejects with `BackupError('busy')` and leaves the file open. A failed
deletion reopens the existing file. Afterwards each Session rebuilds its working copy on its next
continuation, with the rebuild caveats above: historical reasoning is omitted and the provider
session identity is new. Upstream schema upgrades migrate the existing file in place, so a Pi
Durable upgrade needs no separate cleanup.

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

## Maintained Patch Contracts

The four package patches are version-specific to the pinned `1.4.0` family. Patch application and
lockfile hashes prove installation identity, not behavioral compatibility. The Mobile AI runtime
owner maintains this inventory with [#1345](https://github.com/CherryHQ/cherry-studio-app/issues/1345).
The queue fix originated in [#1318](https://github.com/CherryHQ/cherry-studio-app/issues/1318) and
[#1322](https://github.com/CherryHQ/cherry-studio-app/pull/1322); the 1.3.0 upgrade is
[#1320](https://github.com/CherryHQ/cherry-studio-app/pull/1320).

### Scheduler And Recovery Semantics

The generation and startup-repair hunks were removed in the 1.4.0 upgrade:

| Retired hunk | Replacement or scope decision | Retained regression source |
| --- | --- | --- |
| `generation.js`: `failNoModel`, `failModelError`, terminal `classify` | Upstream [`a30c2a81`](https://github.com/earendil-works/pi/commit/a30c2a81df8ee89dfe47ee2855a0c1aa9a7d9533), first released in 1.4.0, with `afterFailedRun: 'continue'`; default `keep` is not equivalent | [PiDurableRuntime.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/PiDurableRuntime.test.ts): admitted-run reopen with missing model and failed blocking compaction; [PiDurableAgentRuntime.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/PiDurableAgentRuntime.test.ts): final failure advances the queue, transient post-tool retry does not repeat the action |
| `harness.js`: `openTasks` orphaned-inbox scan and ownership guards | No upstream replacement. The explicitly chosen clear/rebuild scope does not preserve old orphaned queues; the idle-inbox repair fixture is replaced by normal admitted-run recovery | Same runtime suite retains existing-run and task-owned conversation exclusions. This is a scope retirement, not a claim of backward-compatible orphan repair |

The remaining [Pi Durable patch](../../../patches/@earendil-works__pi-durable@1.4.0.patch) contains
Unicode search, the Code Mode `declarations` import and managed Code Mode output only. Upstream
[conversation reclamation #11026](https://github.com/earendil-works/pi/issues/11026) is a separate
storage-lifetime concern. Mobile's manual whole-file clearing
([#1219](https://github.com/CherryHQ/cherry-studio-app/issues/1219)) remains described in
[Clearing The Working File](#clearing-the-working-file).

### Other Behavioral And Platform Adaptations

| Package/hunk group | Classification and invariant | Existing regression source / retirement evidence |
| --- | --- | --- |
| Pi Durable Unicode search | Product behavior: Chinese names and adjacent Han pairs remain discoverable without exposing deferred tools prematurely | [piToolSearch.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piToolSearch.test.ts); upstream tokenizer must satisfy Chinese and Latin cases |
| Pi Durable `writeOutput` hook | Host boundary: Code Mode output becomes a managed artifact rather than an unmanaged device path | [piDurableTools.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piDurableTools.test.ts), [piCodemodeOutput.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piCodemodeOutput.test.ts); require an upstream host-output API with cancellation/artifact ownership preserved |
| Pi AI structured diagnostics and retry | Product behavior: retain safe provider failure facts; subscription limits remain terminal and transient failures keep retry classification | [piProviderStreamErrors.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piProviderStreamErrors.test.ts), [PiDurableAgentRuntime.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/PiDurableAgentRuntime.test.ts); require candidate parity for those failure categories |
| Pi AI incremental JSON preview | Performance adaptation: avoid quadratic partial parsing while final tool arguments still require a complete valid object | [piStreamingJson.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piStreamingJson.test.ts); require final-argument parity plus measurement before removing the optimization |
| Pi AI native OAuth; Pi Durable declarations import ([upstream #11254](https://github.com/earendil-works/pi/issues/11254)); Pi Code Mode native exports | Platform compatibility: native code does not import Node/WASM launchers or discover credentials from a desktop environment | [piReactNativePatches.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piReactNativePatches.test.ts) and native OAuth adapter sources; require equivalent native exports and platform acceptance |
| Chord numeric array keys | Hermes compatibility: JSON changes to array indexes are interpreted consistently | [piChordPatch.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piChordPatch.test.ts); require the behavior on Hermes, not only Node |

Three platform hunks were retired after checking the pristine 1.4.0 packages:

| Retired hunk | Upstream 1.4.0 evidence | Retained guard |
| --- | --- | --- |
| Pi AI `utils/model-runtime.js` and adapter imports | `models.js` is now the registry, not the catalog; its auth imports are the same native-safe modules, and Mobile already imports `pi-ai/models` directly. The removed copy matched upstream `calculateCost`/`clampThinkingLevel` | Runtime graph guard in [piReactNativePatches.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piReactNativePatches.test.ts) |
| Pi AI `provider-env.js` Bun fallback removal | The `require("node:fs")` is inside `try`; Expo's `allowOptionalDependencies` makes Metro skip it, and it runs only under Bun | The graph guard allows only that try-wrapped require; any other Node import still fails |
| Pi Durable tool-search `Type` import | The `pi-ai` entry adds only `auth/helpers.js`, `auth/types.js` and other import-free modules; its `auth/context.js` uses the native browser-map variant | Same guard's auth module list |

For the remaining adaptation groups, the installed 1.4.0 patch is the recorded workaround; no
independently confirmed replacement is recorded here. A future upgrade must attach exact upstream evidence per
removed group instead of interpreting a clean patch rebase as a fix.

### Upgrade And Retirement Evidence

1. Compare the candidate's public APIs, scheduler semantics and persisted-task migration with each
   inventory row. Keep the package family compatible and inspect the actually consumed entry points.
2. Record the upstream issue/commit and first release containing any replacement. Review normal
   shutdown, explicit abort, queued inputs and unsafe tool intent across restart, including inputs
   created with the previous shipped version. Document downgrade limits.
3. With verification authorization, run the named behavior suites against the candidate with the
   relevant hunk removed, plus patch/hash and Metro graph guards. Add a dedicated failure fixture
   for any branch not covered above. Native export/Hermes changes also require platform acceptance.
4. Remove a superseded hunk or explicitly narrow the supported upgrade scope, record that decision
   with the lockfile, and retain the applicable product regression. Clearing the working file must
   be an explicit upgrade choice through the existing lifecycle, not an unexplained workaround for
   a failing check. Do not read/write private upstream SQL. Storage ownership remains unchanged.

The ownership/recovery regressions added in this architecture change are authored but unrun; they
are not evidence that a candidate dependency or a device has passed. The 1.4.0 dependency upgrade
and patch retirements above have not received runtime acceptance; nothing was published upstream.

## Validation Status

Regression sources cover reservation ordering, recovery before reclamation, failed settlement,
independent forks, revision invalidation, normalized history import, queued inputs and backup
format boundaries. For this ownership change, only formatting and static linting are run; tests,
type checks, builds and device verification remain pending explicit user authorization. No runtime
acceptance result from the earlier Pi-authoritative experiment validates this design.
