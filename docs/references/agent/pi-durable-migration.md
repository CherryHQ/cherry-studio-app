# Experimental Pi Durable Migration

The local entry uses `PiDurableAgentRuntime` behind `MobileAgentHost` and `DurableAgentHost`.
Cherry owns history and Pi owns disposable execution working copies. See
[Validation Status](#validation-status) for local checks and pending device acceptance.

## Pi 1.7.0 Upgrade

The four direct packages (`chord`, `pi-ai`, `pi-codemode`, `pi-durable`) and transitive
`pi-schema` and `pi-telemetry` move from `1.6.1` to `1.7.0`. `@google/genai` stays at `3.6.1` and
`@anthropic-ai/vertex-sdk` stays at `0.22.0`. Because `1.7.0` was published within the 24-hour
`minimumReleaseAge` window (`2026-11-27T16:59:43.623Z`), `pnpm-workspace.yaml` temporarily lists the
six `@earendil-works/*@1.7.0` entries under `minimumReleaseAgeExclude`. See the
[Durable](https://github.com/earendil-works/pi/blob/v1.7.0/packages/durable/CHANGELOG.md),
[Pi AI](https://github.com/earendil-works/pi/blob/v1.7.0/packages/ai/CHANGELOG.md) and
[Chord](https://github.com/earendil-works/pi/blob/v1.7.0/packages/chord/CHANGELOG.md) changelogs.

- **Storage, tasks, and Code Mode replay unchanged.** SQLite stays at schema version 2 (`pi.live`
  v3, `pi.tool` v4, `pi.generation` v3), and `pi-codemode` has no code or `PRELUDE_SOURCE` /
  `PRELUDE_HASH` changes. Upgrading from `1.6.1` requires no migration or working-file clearing.
- **Pi Durable.** Adds only `usage.imageOutput` accumulation in `dist/harness/usage.js`.
- **Pi AI.** Extracts `dist/api/openai-completions-reasoning.js` and adds GitHub Copilot
  `reasoning_opaque` capture and replay ([#12418](https://github.com/earendil-works/pi/issues/12418));
  updates Copilot model metadata (`supportsMidConvoEffort`, `supportsMidConvoToolChanges`,
  `supportsMidConvoSystemMessages`, and `promptCache`); adds `Usage.imageOutput`, `cost.imageOutput`,
  `ImagesOptions.{aspectRatio,size}`, the `pi-image` API, Radius image model support, and
  `openrouter-images` usage/pricing/error fixes; adds Bedrock `compat.supportsReasoningReplay` and
  non-Claude/non-GPT `reasoning_effort` mapping ([#12462](https://github.com/earendil-works/pi/issues/12462));
  migrates Ant Ling to `thinkingFormat: "deepseek"` (keeping `"ant-ling"` as a deprecated alias);
  and refreshes static provider catalogs.
- **Chord and transitive packages.** Mobile/Durable subpaths only gain aborted-context cleanup in
  `awaitWithContext` (`ERNDL-1191`, adding `dist/context/abort-origin.js`) and an `O(k)` shifted
  array-window diff fast path in `dist/delta/diff.js`. Remote contract variant removal
  (`grantable`/`flags`, `PROTOCOL_VERSION` 2), store commit indexing, and shared live-query updates
  do not affect Mobile. `pi-codemode`, `pi-schema`, and `pi-telemetry` have no runtime code changes.

## Pi 1.6.1 Upgrade

The four direct packages (`chord`, `pi-ai`, `pi-codemode`, `pi-durable`) and the transitive
`pi-schema` and `pi-telemetry` move from 1.5.0 to 1.6.1. Pi AI now pins `@google/genai` 3.6.1
directly, replacing Mobile's 2.23.0 override. The Anthropic Vertex SDK stays at 0.22.0 and shares
`@anthropic-ai/sdk` 0.129.0 with Pi AI. The upgrade audit covers the published packages and the
1.5.1, 1.5.2, 1.6.0 and 1.6.1 changes. See the
[Durable](https://github.com/earendil-works/pi/blob/v1.6.1/packages/durable/CHANGELOG.md),
[Pi AI](https://github.com/earendil-works/pi/blob/v1.6.1/packages/ai/CHANGELOG.md),
[Code Mode](https://github.com/earendil-works/pi/blob/v1.6.1/packages/codemode/CHANGELOG.md),
[Chord](https://github.com/earendil-works/pi/blob/v1.6.1/packages/chord/CHANGELOG.md) and
[Google GenAI](https://github.com/googleapis/js-genai/blob/v3.6.1/CHANGELOG.md) changelogs.

- Cherry still reserves the user and assistant rows before Pi admission. For a normal submission,
  the runtime commits its display metadata before calling `conversation.submit(draft, context)`.
  Turning a queued follow-up into a steer uses `conversation.admit(tx, draft)` in the commit that
  reorders the inbox, updates the display metadata and settles the superseded submission.
- An already-started Code Mode script on the same runtime version uses its persisted discovery
  data on replay. An unsettled script started on `1.5.0` (such as `v0.6.3`) settles as a
  sandbox-fingerprint error on resume under `1.6.1`
  because upstream `pi-codemode@1.5.1` ([#11901](https://github.com/earendil-works/pi/issues/11901))
  updated `PRELUDE_SOURCE` (`NaN`/`Infinity` formatting), changing the native driver fingerprint
  (`30ea2e35` -> `befb5789`), matching upstream `pi-codemode`'s `PRELUDE_HASH` deterministic replay
  guard. Completed child tool calls are not undone, and the model inspects their receipts before
  retrying.
- Compaction consumes tagged `decline` and `summary` decisions and Mobile's tagged `failure`
  extension. A failed bounded summary settles the compaction task without placing a new head.
  Code Mode's host output writer returns tagged `saved` or `failed` results and the script commits
  its pending cache writes within the existing merged-store budget.
- The Code Mode wrapper distinguishes tool parks from settled results. A signal-only sleep has
  no timed wake, and a join with policy `any` becomes runnable when its first child settles.
  Parked nested tool rows display as pending. Pi's recorded tool duration covers the whole task
  through result settlement, including parks and restart time for records with a start timestamp.
  Cherry projects start time from the stored completion timestamp and duration. Older results
  keep their recorded duration. Pi's storage adapters own the tagged `Storage.commit()` result.
- Chord moved the JSON, context and watch APIs out of its root entry. Mobile imports the owning
  subpaths, and Jest resolves their published ESM files, including Pi AI's new
  `session-resources` entry used by the Harness.
- Mobile continues to resolve Gemini's explicit `v1beta` endpoint, preserving access to preview
  model IDs across the GenAI 3.x SDK default change. Vertex still uses the host's complete
  project/location URL. Pi maps `xhigh` to `XHIGH` for supported models and disables SDK automatic
  continuation, so a `CONTINUATION` finish is projected as `length` after one request. The Vertex
  fixture covers this and the new HTTP error response callback. OpenAI 7.59.0 normalizes an
  omitted streaming `finish_reason` to `null`. The Codex adapter sends translation instructions
  in a leading developer input so later turns can reuse the prompt prefix.
  [Pi #12273](https://github.com/earendil-works/pi/issues/12273)
- Pi 1.5.1 omits empty `tools` arrays when tools are off even if the history contains calls. Gateways that
  require an empty array in this situation need Pi's `requiresToolsWithToolHistory` compatibility flag.

SQLite's schema stays at version 2. Pi migrates retained `pi.tool` v3 inputs and checkpoints to v4
and `pi.generation` v2 to v3 on recovery. The reopen regressions seed the old task versions and
exercise unsettled work, including queued input after a missing model, an unoffered tool, a
pre-intent tool and an already-persisted unsafe tool intent. Unsettled Code Mode scripts started on
`1.5.0` fail replay with a sandbox fingerprint mismatch (`30ea2e35` -> `befb5789`) without undoing
already-settled child tool calls, so the model can inspect receipts and rerun. The 1.5.0 Harness
can block newer tasks
as `task_too_old` and misinterpret signal-only sleeps. For a planned downgrade, finish or explicitly stop unfinished work,
settle the Cherry receipts, and use the existing cache-clearing flow while the newer runtime still
owns the file. Rebuild from Cherry history after the downgrade. Preserve unsettled working files for
recovery. The upgrade does not delete them automatically.

See [Validation Status](#validation-status) for the gates run on this upgrade.

### Integrated Pi Durable APIs

1. **Durable approval gates.** The `beforeTool` hook checks current Cherry policy and the specific
   call's arguments before Pi records unsafe execution intent. When approval is required, Cherry
   records the pending task and Pi parks it on `ToolApprovalSignal`. Every MCP tool binds its
   `executionSettingsKey` (derived from the server's secret-free connection key or endpoint) into
   the offered blueprint and persisted approval signal, so changing an MCP endpoint or credentials
   across recovery blocks the stale approval. On reopen, the hook fails closed whenever a parked
   call is disabled or changes its `approval` policy (including relaxing `ask` to `auto`) or its
   `executionSettingsKey` (when defined on the offered template), clearing stale pending entries;
   when recovery hits a transient `RuntimeToolDiscoveryError`, parked approvals stay intact and the
   tool retries with bounded backoff. An already persisted denial on `ToolApprovalSignal`, or a
   denial or cancellation while waiting, clears any stale pending entry and settles the call
   without executing the capability.
   The same gate applies to nested Code Mode tool calls: the parent Code Mode task
   waits until active non-sleeping siblings finish so `Promise.race` / `Promise.all` proceed without
   blocking, parks on `ToolPark` (`wait`) once only sleeping children remain, and enforces the
   script's original `timeout_ms` deadline across child sleep gates so expired approvals cannot run
   post-deadline writes.
2. **Durable `ask_user_question`.** The tool rechecks capability availability and policy before
   parking, stores the question, and parks on `UserQuestionAnswerSignal` using `ToolPark`. The Host
   restores the prompt from Pi's pending record and validates the answer against the stored
   question before signaling the task. After wake, the same call returns the answer to the model.
   Its idempotent `cancel()` clears the pending question when a user stops a parked call. An
   ordinary shutdown preserves unanswered questions for the next launch.
3. **Model-facing tool images.** The Host supplies `createNativeModelImageProcessor` to
   `@earendil-works/pi-durable/images/fit`. Mobile inspects image headers before native decode,
   omits unsupported, multi-image, or non-upright containers that native decoding would misread or
   drop frames from (such as HEIC/AVIF/APNG and animated GIF/WebP), decodes supported still images
   with Expo ImageManipulator, keeps supported upright images byte-for-byte within Pi's pixel and
   base64 limits, and resizes or converts images that exceed the limits, carry non-upright JPEG
   EXIF orientation, or need a model-supported format (single-frame GIFs and BMPs can be converted
   within the model limits). Pi adds a diagnostic for resized, converted, or omitted images.
   The fitting hook runs after Cherry's tool hooks and before Pi commits model-visible output.
   Nested tool results and managed output files retain their original bytes.
4. **Per-server MCP namespaces.** Turn preparation snapshots one `Extension.namespace` per
   enabled plugin connection or bound remote server. The executable catalog's server IDs decide
   tool membership. Code Mode lists the short description even when discovery fails and the
   namespace is empty. While `## Plugin Guides` keeps each bundled plugin's short always-included
   overview per `builtInMcp`, `describeNamespace()` exposes the connection-specific `load_workflow`
   workflow-ID instruction on demand without duplicating that overview. The existing workflow loader
   and authorization hooks still govern tool use.
   Recovery reinstalls extensions from the stored snapshot before work resumes and retains loaded
   tools and instructions. Older snapshots without per-server metadata keep the shared
   `cherry.mcp` extension.
5. **Conversation compaction policy.** `configure({ compaction })` persists the override in
   `pi.agent`, where Pi applies it during automatic compaction decisions and inherits it at
   forks. Image-generation working copies force `enabled: false` because their scheduler does
   not send language-model history. An explicit conversation disable takes precedence over the
   harness model override. Language conversations use the model policy by default.
6. **Transactional submission reads.** `Tx.submission(id)` resolves the queued successors and
   the latest placed input inside the same Pi commit that withdraws a queued input or promotes
   it to a steer. Pi's transaction reads and writes the parent chain with the inbox and
   submission updates, so a concurrent boundary or promotion cannot make the Host repair the
   chain from a stale UI snapshot.

### Deferred Pi Durable APIs

- **`SubmissionDraft.notify` and `executeTool(..., { wait: false })`.** A submission can notify a
  waiting task in its settlement commit, and a nonblocking tool call returns a child task
  handle the parent can park on. These are foundations for subagents. Mobile needs a product
  contract for child ownership, cancellation, transcript and usage attribution, and permission
  inheritance before admitting independently scheduled child work. Code Mode keeps its
  existing nested-call lifecycle.
- **`afterTools` and `onYield` `HookTask`.** These hooks can schedule work at tool-round or
  generation boundaries. Mobile already projects Pi's durable tool and turn results to Cherry.
  A boundary task would need a defined user-visible purpose and ownership for failure, replay,
  and cancellation when a turn yields, stops, or finishes.
- **`SubmissionDraft.onAbort: "keep"`.** Pi can retain an input queued by a sender that cannot
  withdraw it, such as another agent. Mobile's queue holds user follow-ups. Conversation Stop
  withdraws that queue so a later message cannot revive stopped inputs.

## Pi 1.5.0 Upgrade

The direct dependencies `pi-durable`, `pi-ai`, `pi-codemode`, and `chord` were pinned to `1.5.0`,
with transitive `pi-schema` and `pi-telemetry` on the same version. The four package patches and
lockfile hashes target the published npm files. Sources:
[Durable changelog](https://github.com/earendil-works/pi/blob/v1.5.0/packages/durable/CHANGELOG.md)
and [Pi AI changelog](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/CHANGELOG.md).

- `PiDurableObserver` projects immutable `Conversation.watch()` values from `pi.live` and
  `pi.inbox`. The view starts with 50 entries and contracts after 100; the observer fills gaps
  with the existing `turnEntries()` reader. It reads a terminal turn's complete slice separately
  so a later turn already present in the window cannot enter its settlement. Cherry remains the
  owner of complete display history; model context and reply edits still use `Conversation.context()`.
- A separate `observeCommits()` observer buffers durable submission changes. Session reads and
  Cherry events run on the presentation queue, outside the synchronous commit callback. This
  catches whole runs between view frames and queued withdrawals with no run or entry. Terminal
  IDs suppress duplicate settlement during a mount; entry caches are released after settlement,
  and detach drains outstanding reads without publishing late results.
- `AgentSqlDatabase` and its transaction executor implement `runCounted()` using SQLite's actual
  changed-row count. Existing transaction isolation, escaped-handle invalidation, rollback-failure
  protection and upstream `SqliteStorage` remain the storage boundary. Mobile adds no custom
  commit engine or Cherry database migration.
- `onReport` and session/watch closure use the new `kind` discriminants. `restart_limit` now ends
  an input as failed; `interrupted` ends it as interrupted. Neither is projected as an indefinitely
  paused reply. Sleeping/blocked work still follows the existing execution-protection policy.
- `afterFailedRun: 'continue'`, model-specific compaction policy and Cherry client identity remain.
  `progress.persistWithinMs` uses Pi's 1000 ms default to coalesce streaming progress writes.
  A successful normal close flushes held progress. Explicit stop saves the partial answer recorded
  in `pi.live` as an aborted transcript entry. An abrupt process kill can lose progress still held
  in memory during the coalescing window.
- Cherry's current-only documents generally checkpoint each change. The growing managed-file grant
  and Code Mode artifact lists write a new base on the next change after 32 deltas. SQLite replaces
  prior revisions when it writes a new base, bounding `document_revisions` per document.
- Tool parameters remain ordinary JSON Schema objects, preserving additional-property semantics.
  Error `afterTool` results retain their diagnostics and failure details; confirmed Code Mode
  artifacts still come from their durable transcript receipts. Unoffered calls must never execute.
  No continue UI, max-turn setting or new after-run workflow is added.

The Code Mode `declarations` import hunk is superseded by the published 1.5.0 source
([#11254](https://github.com/earendil-works/pi/issues/11254)); the native dependency-graph guard remains.
The native Code Mode export and managed `writeOutput` hook remain necessary. Search retains exact
multiple-name admission, Han whole/adjacent terms and a fallback when `Intl.Segmenter` is absent.
Pi AI's legacy `parseStreamingJson` fast-path hunk is retired: the published 1.5.0 providers use
`ToolCallArgumentsStream`, and no production caller of the legacy function was found in Mobile or
the six Pi packages. Final arguments still use the unchanged `parseToolCallArguments` path.
Regression sources now target the incremental stream, including large input, immutable previews,
string repair and truncated-final-input rejection; runtime and performance checks remain unrun.
Native OAuth, provider diagnostics, Vertex injection and Chord's Hermes array-key adaptation remain.

SQLite schema stays at version 2. Upstream migrates `pi.live` to document version 3, `pi.tool` to
task version 3 and `pi.generation` to task version 2. Do not reopen those migrated working copies
with 1.4.0. Before a planned upgrade or rollback, finish or stop active/queued work and save the
Cherry context through the existing lifecycle. For rollback after settlement, clear the closed
working copy while the newer runtime can still read it, then rebuild from Cherry history after
changing versions. Preserve unsettled or failed working files for recovery; this change performs
no automatic deletion. Cherry backups preserve history and resources, not live `pi-agent.db` state.

Regression sources were migrated or added for state observation, submission settlement, SQLite
counts, tool failures/coercion, search fallback and incremental JSON. The reopen regression also
seeds the published 1.4.0 live-document and generation-task versions before using 1.5.0.
Tests, type checks, builds, performance measurements and device acceptance have **not** been run for 1.5.0. Previous acceptance
results below apply only to their stated versions. Reopening actual 1.4.0 working copies—including
queued input, sleeping retry, unsafe tool intent, nested calls, compaction and incomplete Cherry
settlement—remains required before shipping; normal close and process death need separate cases.
Dependency scripts were disabled during installation to honor the build restriction.

## Previous Pi 1.4.0 Upgrade

`pi-durable`, `pi-ai`, `pi-codemode`, `chord`, and the transitive `pi-telemetry` were pinned together
at `1.4.0`. The four remaining patches are rebased against the published npm packages. Relevant
upstream sources are the [Durable changelog](https://github.com/earendil-works/pi/blob/v1.4.0/packages/durable/CHANGELOG.md)
and [Pi AI changelog](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/CHANGELOG.md).

- The 1.4.0 upgrade retained delta-only writes for Cherry documents. The current checkpoint policy
  is described in the 1.5.0 section above.
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

Pi 1.4.0 with `afterFailedRun: 'continue'` advances the next queued input after a terminal model
failure. Waiting inputs of an ownerless conversation whose previous run already ended are not
repaired on open; see [Scheduler And Recovery Semantics](#scheduler-and-recovery-semantics).
Existing live runs and task-owned conversations retain their normal recovery paths.

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

For language conversations with automatic compaction enabled, Mobile starts background compaction
at 80% of the default input budget, following ordinary Desktop chat. The budget takes the lower
of the model's independent input limit and its context window after
the default reply reservation and safety margin. Pi runs blocking compaction above that budget
when it finds older context to summarize.
The compaction hook uses AI Core's bounded summarizer with the conversation's Pi model and
credentials. Pi still owns range selection, scheduling, and the committed context head. An
unsuccessful summary leaves the original head and settles the native task as failed.

The context-usage panel can request a native manual compaction of the selected answer's working
copy. It waits for both the task and the summary write. For a completed answer, the Host also saves
the resulting checkpoint when it fits the existing checkpoint size limit.

The composer reads current context usage separately from persisted request and billing statistics.
At each committed transcript boundary, the observer reads Pi's public `Conversation.context()` and
passes its effective messages to pi-ai's `estimateContextTokens`. This includes measured input,
cache and output plus estimates for the following messages; after compaction, reset or reply edits,
the same read uses the newly retained context. Background compaction updates usage even when no
answer is running. Reattachment restores the current count. For rebuilt normalized replies, the
display estimate ignores synthetic input-only usage and counts retained content instead. A reply
can merge several provider responses, so adding its full text to the final request's input would
count earlier response text twice. Execution history keeps its existing input measurement;
composer estimation does not rewrite usage or change execution's compaction thresholds.

Each usage value names the answer of its newest placed input. The Host exposes current copies in
`contextUsages` and replaces that list with `context.usage.updated`; the composer selects only the
current branch's newest answer and still requires the selected model to match. No value is inferred
from cumulative billed usage. Streaming-only progress does not reread the committed context on
every text delta. Content-only and trailing-message estimates carry `estimated: true`, displayed
with `≈` instead of implying a fresh provider measurement.

If the selected branch has no working copy, observation estimates from the same validated Cherry
checkpoint and normalized tail used by rebuild. This is an in-memory read: it opens no Pi copy,
resolves no credentials or tools, and makes no model call. A measured prefix already includes its
system prompt; content-only recovery adds the current base Agent instructions. Future tool
configuration and reloaded attachment content can change the next request, so this fallback is
explicitly approximate. A new native context supersedes it. Clearing the working file refreshes
existing observers too; switching or editing a branch refreshes its stored estimate.

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
The Host remembers newly created forks in memory and triggers the existing title policy on their
first admitted user message. This does not override a manual rename or persist workflow state.

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
For a question with alternative answers, the message-scoped delete removes only the chosen answer
subtree and selects a surviving continuation. The shared question and sibling answers remain.

`retireDoc` detaches application bindings; the unreachable upstream entries stay in the Pi file.
Deletion removes Cherry data immediately, while retired Pi bytes remain inside the app sandbox. The
file is never part of a backup, and switching or resetting storage deletes it with `cherry.db`.
There is no raw SQL erasure, archive tombstone, hidden-turn document or descendant-reclamation chain.

## Editing A Completed Reply

`editMessage` edits text parts of any successful answer while the Session is idle: prose between
tool calls and the final result. Reasoning, attachments, completed tool receipts, message identities
and billed usage remain intact. Later turns are kept and not regenerated. Each part carries its
original text for optimistic concurrency. The store checks the answer, absence of unfinished
messages, every original text and the history revision again inside its write transaction.
Translation caches are cleared, and so is every context checkpoint whose anchor is not strictly
before the edited turn, because it may retain the old answer verbatim; the same rule protects
deleted turns.

Each native copy whose current context still contains the answer's text blocks stops background
compaction and appends one public Pi `ContextEdit` replacement per changed entry at its tail; every
part replaces only its own text block. The original entries remain immutable, and provider session
identity, earlier signed content and tools are preserved.
The copy's newest answer records the edit as its answer boundary, so forks after that answer keep
the edit natively. A fork through an earlier answer cannot inherit an edit appended later, so that
answer reports no native boundary and the new copy is rebuilt from the edited Cherry transcript.
Changed text blocks no longer carry the original provider text signatures, except OpenAI Responses
signatures, which identify the output item and phase rather than its content. Native web replay,
imported parts, copies that do not hold the answer and compacted-away targets fall back to
rebuilding. Context replacements clear the edited answer's obsolete measured usage; Pi measures
context from the newest remaining usage, so editing an earlier answer is reflected only after the
next request. Transcript projection and Cherry's invocation ledger retain the original billed usage.

Following Pi semantics, an answer already summarized by compaction keeps its old meaning inside that
summary in a native copy; only its displayed text changes. When an edited copy's context begins at a
compaction or reset, its refreshed context is saved as the checkpoint of that copy's newest answer.
Any other rebuild falls back to an earlier checkpoint and replays the edited Cherry transcript.

The native replacements and binding revisions advance before the Cherry transaction commits the same
revision with the edited text and refreshed checkpoints. A crash between those commits leaves
mismatched working copies that recovery discards. Every copy that was not edited becomes stale;
failed retirement cannot make it current. `message.edited` is published only after Cherry commits.

Provider prompt caches can reuse an unchanged prefix before the edited answer; the edited portion and
the following context need a new matching cache. Preserving native copies avoids an additional
provider-session change. The fallback rebuild retains the reconstruction limitations described
above.

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

Ordinary shutdown closes invocations without abort marks. Finite UIKit window expiry does the same
only when no continued-processing or audio protection remains. Foreground startup reopens retained
tasks. Expiry of an iOS continued-processing task also suspends the Host and preserves unfinished
work for foreground recovery: the native signal cannot distinguish system revocation from
system-UI cancellation. See
[Background Activity Presentation](../background-activity-presentation.md). Explicit user stop invokes
Pi abort. Unsafe tools do not automatically re-execute after interruption. Current accounts, tool
implementations and approval policy are reconstructed; credentials are resolved at request time and
never serialized. Native task demand, including background compaction, holds the KeepAlive lease.
Usage has a durable idempotent outbox; compaction usage belongs to the session rather than an
invented assistant turn.

A guarded storage failure closes the shared Pi session, releases its work lease, and suspends the
Host. In the Android foreground the Host tries one automatic reopen before notifying open chats of
failure. On success it publishes `runtime.recovered` so open chats reread their Session snapshots,
preserving unfinished receipts and reconciling existing work. When that automatic reopen fails or
repeats before new input is admitted or `resumeSuspended()` succeeds, the Host publishes
`runtime.failed` with `retryable: false`; retry observation and foreground resume still share the
same reopen path.

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

The five rebased patches target the four pinned `1.7.0` Pi packages and GenAI `3.6.1`. Anthropic
Vertex retains its `0.22.0` patch. The Mobile AI runtime
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

The remaining [Pi Durable patch](../../../patches/@earendil-works__pi-durable@1.7.0.patch) contains
Segmenter fallback and Han search terms, exact-name tool search, and the host Code Mode output
hook with its final store-commit budget guard. The compaction hook can also fail the native task
when the bounded summarizer fails, preventing a fallback to one unbounded request. The hook uses
`{ kind: "failure", failure }` alongside the upstream `decline` and `summary` tags.
`Tx.waitForEntryPublication()` uses Pi's conversation creation and append gates without loading a
transcript entry. Cold history reads only load bodies for the selected turns. `SqliteStorage` accepts
`maxPayloadReadBytes` (set to 8 MiB on Android by `AgentSqlDatabase` and unset on iOS) and uses
a single-query byte-budgeted window CTE (`octet_length()`) for transcript entry scans and
transactional document revision replay—executing zero extra queries when a page fits in budget
while avoiding row-by-row bridge overhead and keeping Android JVM allocations bounded. Metadata
queries and iOS use single bulk reads.
The `declarations` import is upstream in 1.5.0. Upstream
[conversation reclamation #11026](https://github.com/earendil-works/pi/issues/11026) is a separate
storage-lifetime concern. Mobile's manual whole-file clearing
([#1219](https://github.com/CherryHQ/cherry-studio-app/issues/1219)) remains described in
[Clearing The Working File](#clearing-the-working-file).

### Private Working Materials

Intermediate scripts, research data and confirmed file receipts use upstream Code Mode `store/load`
(`CodemodeStoreDoc`), with its existing conversation history and fork semantics. They stay in the
disposable runtime cache, never the file library or backups. A requested deliverable continues to
use managed artifacts; original conversation records retain their normal history policy.

Store writes commit only when the entire script succeeds. Preparation therefore uses separate,
short successful calls: save the first source/data chunk, append or locally replace the next chunk,
then execute using `load(key)` without printing or re-emitting the source. After creation, store its
returned `value.fileEntryId` and finish that call successfully before inspecting or editing the
existing file in a separate call. A later inspection failure cannot roll back an earlier successful
call's cache writes. Interrupted model text and failed preparation calls are not checkpoints.
Missing cache values after rebuild/clearing must be recreated; missing receipts do not establish an
uncertain side effect's outcome. This is an instructed workflow using existing tools, not a new
cache-file API or automatic scheduler.

Text console overflow also goes into `CodemodeStoreDoc` through the existing host output callback,
under a task-specific key. The returned `store:<key>` is read with `load(key)`; output exceeding the
native 256 Ki-character JSON value limit or the host's 768 Ki-character total cache budget is not
saved, reserving 256 Ki characters for scripts and receipts. Admission counts both current values
and the successful script's pending writes. The final script transaction checks the merged store
against the native 1 Mi-character total limit, including writes another task committed in between.
If that budget is exhausted, none of the script's cache writes apply and its stored outcome reports
the failure; completed tool calls are not undone and their receipts must be checked before retrying.
Existing keys are retained; the model receives an error rather than a dangling reference.
Values stay as raw JSON values in the document; the sandbox serializes them before `load()` reads
them. Saving overflow commits
independently of the parent script's outcome. Explicit image outputs keep the existing managed-artifact
path. Execution inputs are not automatically duplicated and historical tool arguments are not
rewritten for model requests.
New calls reuse short references; historical context compaction remains upstream-owned.

The supported `afterTool` hook bounds invalid-argument diagnostics before settlement: at most five
issues / 2,000 characters, without the full `Received arguments` echo. Nested tool progress retains
the existing 1,000-character argument preview for detail readers. Upstream validation and Code Mode
may still serialize arguments internally; this change does not patch those paths or claim to
eliminate their allocation cost.

[piCodemodeSandbox.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piCodemodeSandbox.test.ts)
covers staged source reuse and the separate creation/checking bridge contract;
[piDurableTools.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piDurableTools.test.ts)
covers native-store overflow persistence, pending writes and final-commit quota races, unchanged
inputs and bounded direct/nested validation.
See [Validation Status](#validation-status) for the runtime regressions. The earlier 46-second
inspection delay remains unattributed, and device performance checks remain pending.

### Other Behavioral And Platform Adaptations

| Package/hunk group | Classification and invariant | Existing regression source / retirement evidence |
| --- | --- | --- |
| Pi Durable Unicode search and exact names | Product behavior: Chinese names and adjacent Han pairs remain discoverable without exposing deferred tools prematurely; exact deferred names in a `tool_search` query load before ranked matches, even when their count exceeds `limit` | [piToolSearch.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piToolSearch.test.ts); upstream must satisfy Chinese and Latin cases and select exact names regardless of BM25 rank |
| Pi Durable `writeOutput` and store-commit budget | Host boundary: textual console overflow stays in the private working cache, with pending writes counted at admission and the merged store bounded atomically at script settlement; explicit image outputs use managed artifacts. Neither path exposes an unmanaged device path | [piDurableTools.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piDurableTools.test.ts); require an upstream host-output API with atomic store quotas and cancellation/artifact ownership preserved |
| Pi AI structured diagnostics and retry | Product behavior: retain safe provider failure facts; subscription limits remain terminal and transient failures keep retry classification | [piProviderStreamErrors.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piProviderStreamErrors.test.ts), [PiDurableAgentRuntime.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/PiDurableAgentRuntime.test.ts); require candidate parity for those failure categories |
| Pi AI Google signatures over Chat Completions | Protocol compatibility: capture streamed `extra_content.google.thought_signature` in the existing durable tool-call field and replay it only for the same provider, model and API; legacy encrypted reasoning remains in `reasoning_details` | [piApiAdapters.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piApiAdapters.test.ts); retire when upstream preserves Google tool signatures through streamed response parsing and replay, with cross-model isolation unchanged |
| Pi AI Mistral thinking chunks over Chat Completions | Protocol compatibility: parse nested thinking/text chunk lists without coercion, retain optional reasoning signatures and closure metadata in Pi's existing signature field, and replay structured thinking only for the same provider, model and API; scalar reasoning and OpenRouter details keep their existing formats | [piMistralReasoning.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piMistralReasoning.test.ts); retire when upstream preserves streamed Mistral content and persisted reasoning through follow-up requests and tool continuations, with cross-model isolation unchanged |
| Pi AI legacy JSON preview fast path (retired) | No production caller found in Mobile or the six published 1.5.0 Pi packages; providers use upstream `ToolCallArgumentsStream`. Final arguments still use unchanged `parseToolCallArguments` | [piStreamingJson.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piStreamingJson.test.ts) now covers the consumed incremental path, string repair and final validation |
| Pi AI native OAuth; Pi Code Mode native exports | Platform compatibility: native code does not import Node/WASM launchers or discover credentials from a desktop environment | [piReactNativePatches.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piReactNativePatches.test.ts) and native OAuth adapter sources; require equivalent native exports and platform acceptance |
| Pi AI Google transport and Vertex bearer authentication | Gemini and all Vertex client branches use instance-scoped `httpOptions.fetch`. Vertex resolves the service-account bearer token in Mobile for each invocation and uses the Web SDK. Google message, image, tool and thought-signature conversion stays upstream | [piProviderStreamErrors.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piProviderStreamErrors.test.ts), [piVertexNative.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piVertexNative.test.ts) and [piModelResolver.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piModelResolver.test.ts). The [GenAI Web patch](../../../patches/@google__genai@3.6.1.patch) supplies host authentication; retire it once the Web client accepts that authentication upstream |
| Anthropic Vertex native Google auth browser map | Platform compatibility: the official SDK receives host-owned `authClient` credentials; Metro redirects its `google-auth-library` import to a guard that requires injection. Node retains its ordinary auth path. Pi's public `stream()` client injection and the SDK's Vertex request shaping are unchanged | [piVertexAnthropic.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piVertexAnthropic.test.ts), [piVertexNative.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piVertexNative.test.ts) and local [metroResolution.test.ts](../../../scripts/__tests__/metroResolution.test.ts); the [0.22.0 patch](../../../patches/@anthropic-ai__vertex-sdk@0.22.0.patch) can retire when the official SDK offers a native-safe injected-auth entry, followed by native acceptance. This SDK version shares Pi's pinned Anthropic SDK 0.129.0 |
| Chord numeric array keys | Hermes compatibility: JSON changes to array indexes are interpreted consistently | [piChordPatch.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piChordPatch.test.ts); require the behavior on Hermes, not only Node |

Three platform hunks were retired after checking the pristine 1.4.0 packages:

| Retired hunk | Upstream 1.4.0 evidence | Retained guard |
| --- | --- | --- |
| Pi AI `utils/model-runtime.js` and adapter imports | `models.js` is now the registry, not the catalog; its auth imports are the same native-safe modules, and Mobile already imports `pi-ai/models` directly. The removed copy matched upstream `calculateCost`/`clampThinkingLevel` | Runtime graph guard in [piReactNativePatches.test.ts](../../../src/backend/ai/agent/runtime/pi/__tests__/piReactNativePatches.test.ts) |
| Pi AI `provider-env.js` Bun fallback removal | The `require("node:fs")` is inside `try`; Expo's `allowOptionalDependencies` makes Metro skip it, and it runs only under Bun | The graph guard allows only that try-wrapped require; any other Node import still fails |
| Pi Durable tool-search `Type` import | The `pi-ai` entry adds only `auth/helpers.js`, `auth/types.js` and other import-free modules; its `auth/context.js` uses the native browser-map variant | Same guard's auth module list |

### Pi 1.7.0 Hunk Audit

All maintained patch hunks remain necessary in `1.7.0`:

- `pi-durable`, `pi-codemode`, and `chord` patches carry forward unchanged from `1.6.1` with zero
  conflicting upstream changes in their patched files.
- `pi-ai` rebased `dist/api/openai-completions.js` onto upstream's extracted
  `dist/api/openai-completions-reasoning.js`: `parseMistralThinkingSignature` remains local in
  `openai-completions.js` (returning `undefined` from `decodeThinkingSignature` so `resolveReasoningReplay`
  never emits `reasoning_details` or `reasoning_opaque` for Mistral blocks), and Google tool-call
  replay calls `decodeLegacyToolCallReasoningDetail(tc.thoughtSignature)` instead of the removed
  inline `parseLegacyEncryptedReasoningDetail`. All other `pi-ai` files carry forward unchanged.

### Pi 1.6.1 Hunk Audit

| Published file or patch group | 1.6.1 disposition and evidence |
| --- | --- |
| Pi AI `google-generative-ai.js` custom-fetch guard, client call and `createClient` setup | Retired. Pi 1.6.0 forwards `options.fetch` to `createClient`, which sets `httpOptions.fetch` with a global fallback. The diagnostic import and catch hunk remain. [#12103](https://github.com/earendil-works/pi/pull/12103), [#12108](https://github.com/earendil-works/pi/pull/12108) |
| Pi AI `google-vertex.js` custom-fetch restriction and client selection | Retired the `!options?.accessToken && options?.fetch` guard. Pi 1.6.0 passes fetch to `createClientWithApiKey` and `createClient`, and `buildHttpOptions` handles it for all three paths. ADC token retrieval still uses Google's auth library. [#12103](https://github.com/earendil-works/pi/pull/12103), [#12108](https://github.com/earendil-works/pi/pull/12108) |
| Pi AI `google-vertex.js` bearer branch, `streamSimple` forwarding and diagnostic hunks, plus `google-vertex.d.ts` option and simple-stream signature | Retained. Pristine Vertex constructs API-key or ADC clients, so the access-token branch still opens `@google/genai/web` with host authentication. The 1.6.1 HTTP error callback observes the response but does not emit Mobile's `provider_response_failure`. [#12376](https://github.com/earendil-works/pi/issues/12376) |
| Pi AI `anthropic-messages.js` imports, SSE error parse and catch | Rebased on the shared SSE decoder and upstream `withCauseDetail`. The upstream SSE error still throws text. Mobile preserves the parsed body, code/type and retry metadata while keeping upstream cause formatting. [#12224](https://github.com/earendil-works/pi/issues/12224), [#11783](https://github.com/earendil-works/pi/pull/11783) |
| Pi AI `azure-openai-responses.js` and `openai-responses.js` imports and catch hunks; `openai-responses-shared.js` error and `response.failed` hunks | Retained. Upstream response callbacks and input-transformation diagnostics are additive. Mobile retains status/body/retry metadata and keeps the structured error code for both streamed terminal event forms. |
| Pi AI `openai-codex-responses.js` HTTP error, catch and `parseErrorResponse` hunks | Retained. The final HTTP error carries status and code. Only explicit subscription-limit codes get the terminal hint; a transient 429 can still retry. |
| Pi AI `openai-completions.js` diagnostics, Mistral signature parser, string/array delta parsing and replay, Google signature capture and replay | Retained. Upstream changes to strict tools, finish reasons and provider error text do not capture Google `extra_content` signatures or preserve Mistral's structured chunks across a same-model replay. |
| Pi AI `auth/context.native.js`, `auth/oauth/callback-server.native.js`, `env-api-keys.js`, `native-oauth.{js,d.ts}` and both `package.json` hunks | Retained. The new upstream lazy OAuth entry still reaches the desktop auth dependencies when loaded. The native export and browser map select host credentials and manual callbacks. The computed import in `env-api-keys.js` remains unsuitable for Metro. |
| Pi AI `auth/oauth/platform.{js,d.ts}`, `pkce.js` import and binding, `github-copilot.js`, `openrouter.js`, `xai.js` imports, `kimi-coding.js` import and refresh guard, `openai-codex.js` import, state generation and refresh cause | Retained. These files keep provider-scoped native fetch and PKCE, propagate terminal Kimi refresh failures and preserve Codex refresh causes. Codex's pristine OAuth state generator still reaches `node:crypto`. Upstream Copilot model discovery changes are preserved. |
| Pi AI `utils/diagnostics.js`, `utils/error-body.js` and `utils/retry.js` | Retained. The structured code/type/cause, explicit retryability and status precedence cover failures that have localized or absent text. Upstream connection-cause formatting and retry patterns remain in use. [#11783](https://github.com/earendil-works/pi/pull/11783), [#12227](https://github.com/earendil-works/pi/issues/12227), [#12206](https://github.com/earendil-works/pi/issues/12206) |
| Pi Durable `search.js` Segmenter and Han token hunks and `tool-search/tool-search.js` exact names | Retained. The pristine tokenizer assumes Segmenter and uses dictionary segmentation. Search now follows schema references upstream, while exact deferred names still require admission before ranked matches. [#11803](https://github.com/earendil-works/pi/issues/11803) |
| Pi Durable `codemode/codemode.{js,d.ts}` and `harness/compaction.js`, `harness/types.d.ts` | Adapted. The host output hook uses upstream `OutputFile`'s tagged result, forwards pending writes during formatting and checks the merged cache atomically at settlement. Compaction preserves the tagged failure path. |
| Pi Durable `session/session.js`, `session/transaction.{js,d.ts}`, `types.d.ts`, and `storage/sqlite/storage.{js,d.ts}` | Rebased from #1917. Neither `Tx.waitForEntryPublication()` nor `SqliteStorage` `maxPayloadReadBytes` / `octet_length()` byte-budgeted CTE reads is upstream in 1.6.1; `storage.d.ts` tracks 1.6.1's split `@earendil-works/chord/{context,json}` imports. |
| Pi Code Mode `native.{js,d.ts}` and `package.json` | Retained. The published `portable` entry lacks `PRELUDE_SOURCE` and exports `InlineCodemodeSandbox`, which reaches the WASM engine. The native entry provides the protocol and prelude for the host's QuickJS engine. |
| Chord `json.js` | Retained. The pristine `copyJson` still passes a numeric array index to `Object.getOwnPropertyDescriptor`. The Hermes fix supplies a string key. |
| Google GenAI `dist/web/index.mjs` API-key check and auth construction, plus `dist/web/web.d.ts` | Rebased. The pristine 3.6.1 Web constructor still requires a key and constructs `WebAuth`; the Web options lack `auth`. The two JS changes and one declaration hunk preserve native bearer injection. |
| Anthropic Vertex `package.json` browser map and `google-auth.native.js` | Both unchanged. The published 0.22.0 client accepts injected `authClient` but imports `google-auth-library` unconditionally. Pi AI 1.6.1 retains client injection and pins the same Anthropic SDK. |

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

## Validation Status

For the `1.7.0` upgrade, `pnpm check:changed` (running `oxlint`, `expo lint`, `oxfmt --check`,
`check-app-theme`, `pnpm docs:check-links` across 355 Markdown files, and full `pnpm typecheck`), a
read-only patch non-reapplicability check across the four `@earendil-works/*@1.7.0.patch` files
(`4 / 4`), and the targeted `--runInBand` Jest sweep across `src/backend/ai/agent/runtime/pi/__tests__`
(43 suites, including the new GitHub Copilot `reasoning_opaque` regression),
`AgentSqlDatabase.test.ts`, `metroResolution.test.ts`, and `architectureBoundaries.test.ts` passed
**46 / 46 suites (1,583 / 1,583 tests)** after restoring the shared `zod@4.4.3` lockfile resolution
(keeping single `@cherrystudio/ai-sdk-provider`, `@openrouter/ai-sdk-provider`, and `expo`
instances). Dependency installation used pnpm 12.2.1 with lifecycle scripts disabled
(`--ignore-scripts`). Native Hermes/device acceptance, production provider calls, and reopening an
actual on-device working file remain `device-pending`.

Following the final runtime and test simplifications, `pnpm typecheck`, `pnpm lint` (0 warnings,
0 errors across `oxlint`, `expo lint`, and workspace `eslint`), `pnpm format:check` (4,076 files),
`pnpm docs:check-links` (355 Markdown files), and the targeted Jest run across
`src/backend/ai/agent/runtime/pi`, `DurableAgentHost.test.ts`, and `McpRuntimeService.test.ts`
passed **45 / 45 suites (1,641 / 1,641 tests)**. Immediately prior to that final 9-line
denial-precedence adjustment in `piDurableTools.ts` and test cleanup in those 3 suites,
`pnpm test:packages` (`@cherrystudio/ai-runtime`) passed **63 / 63 files (589 / 589 tests)** and
the broad `--runInBand` Jest sweep across Agent, MCP, `services/file`, `data/profile`,
`services/chat`, `features/agent`, `architectureBoundaries.test.ts`, and `metroResolution.test.ts`
passed **133 / 136 suites (3,056 / 3,063 tests)** (the 3 failing suites were fixed and re-verified
to passing in the 45-suite run above; the remaining 91 suites and `packages/` were not separately
re-run after that final `piDurableTools.ts` tweak). Native image tests use mocked Expo resources;
real-device verification of the native iOS/Android Expo `ImageManipulator` codecs remains
`device-pending`.

The preceding dependency upgrade passed `pnpm typecheck`, `pnpm lint` (0 warnings, 0 errors across
`oxlint`, `expo lint`, and workspace `eslint`), `pnpm format:check`, `pnpm docs:check-links`, and
46 Jest suites (1,527 tests: 43 suites under `src/backend/ai/agent/runtime/pi/__tests__/`, plus
`src/backend/data/db/__tests__/AgentSqlDatabase.test.ts`,
`scripts/__tests__/metroResolution.test.ts`, and `scripts/__tests__/architectureBoundaries.test.ts`).
A read-only non-reapplicability check matching `scripts/__tests__/patchReapplication.test.ts` also
passed 5/5 for the upgraded patches (`chord`, `pi-ai`, `pi-codemode`, `pi-durable`, `@google/genai`)
against their active `node_modules` installs; `scripts/__tests__/patchReapplication.test.ts`
itself was left unchanged (pre-existing `virtualStoreDirMaxLength: 40` store lookup and unrelated
`react-native-enriched-markdown@1.1.1.patch` `EventEmitters.cpp` findings remain out of scope).
Dependency installation and deduplication used pnpm 12.2.1 with lifecycle scripts disabled. Native
Hermes/device tests, production provider calls, and reopening a released app's actual working file
remain pending. The Jest reopen fixtures exercise published task versions using in-memory storage.
