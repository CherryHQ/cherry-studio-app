# Experimental Pi Durable Migration

Source integration is active on the experimental branch tracked by
[issue #1186](https://github.com/CherryHQ/cherry-studio-app/issues/1186). `PiRuntimeService` constructs
`PiDurableAgentRuntime`; `MobileAgentHost` owns its application lifetime and delegates business
intents to `DurableAgentHost`. Device compatibility and runtime acceptance remain unverified.

## Ownership

One application generation owns one Pi Harness and one independent `pi-agent.db` in the selected
storage generation's database directory. Upstream `SqliteStorage` owns its schema and migrations.
The data layer supplies a queued Expo SQLite connection without importing Pi. Unrelated reads,
writes, and close wait for active transactions. A failed rollback poisons the connection and is
distinguishable from a successfully rolled-back callback failure.

Pi owns model-visible history, summaries, tool results, pending inputs, tasks, progress, and
recovery. Cherry owns Agent definitions, business session identities, titles, archive state,
accounts, permissions, managed resources, analytics, and presentation. Normal submissions do not
rebuild history or restore a Cherry-owned context checkpoint. New conversations do not require a
second full transcript in Cherry SQLite; display messages are read projections of Pi state.

Business-row repair inserts the stable session identity and creation timestamp from Pi's immutable
creation seed after the first native input is admitted. This is an explicit exception to default
insert-time row timestamps, like history forks: reopening after a cross-database crash must not
change when the conversation began. Repeated repair preserves current titles and existing rows.
Activity updates are monotonic and contain no model messages.

The `DurableAgentRuntime` port carries application-owned SQL, conversation, and normalized history
values. Pi and Chord types stay inside `backend/ai/agent/runtime/pi`. Frontend and shared contracts receive
application-owned values. Shutdown closes the Harness without cancelling pending tasks; explicit
user stop calls Pi abort. Unsafe tools do not replay on restart. Current tools, accounts, and
approval policy must be rebuilt before pending work can run. Native task demand, including background
compaction, holds the existing KeepAlive execution lease. OS expiry closes the invocation without
abort marks; foreground reopens the same database and reconstructs dependencies before resume.
Cold startup reconstructs only unfinished conversations; historical configurations are loaded on demand.

The model bridge uses the invocation's cancellation signal and provider affinity to identify its
owning submission. Compaction is session-owned usage, without an invented turn. A durable usage
outbox makes analytical delivery retryable and idempotent. Credentials are resolved at request time
and are never serialized. Model health checks use an isolated `MemoryStorage` Harness.

## Existing Conversations

Existing conversations remain readable and continue with the same business session identity.
Their first new submission prepares a Pi conversation before admitting new work:

1. Read an immutable legacy boundary. Prefer a validated existing summary and its retained tail,
   using available native replay artifacts. The disposable replay cache cannot be required for
   migration or backup import.
2. Convert reconstructible history to Pi entries. Use Pi compaction when summarization is needed,
   retaining recent original turns and paired tool calls/results. Very long history must be
   admitted in bounded prefixes instead of one unbounded summarization request.
3. Commit the source identity, boundary, and migration version with the imported context. Link
   the business session after that commit. Reconcile interrupted linking without duplicate
   conversations or repeated inputs.
4. Display legacy records followed by new Pi records, excluding imported context from the visible
   tail. Subsequent submissions use Pi directly.

Migration never reruns historical tools or recreates unfinished legacy tasks. Those stay
interrupted. Failed preparation leaves original history intact and permits retry. Summaries are
lossy; a summary-only prefix cannot support exact forks at arbitrary earlier messages. Attachments
remain managed resources, and unavailable content is not invented. Direct image sessions import
legacy originals without language-model summarization; their execution is one unsafe image tool.

## History And Search

`AgentTranscriptReader` combines an immutable legacy prefix with the native Pi tail, excluding
imported context from display. Native entry boundaries and stable display aliases preserve reads
through fork ancestry. Older/newer/around pagination and selected-message export share this reader.
Assistant statistics combine native token totals with the existing analytical ledger on read.

Search uses the existing `agent_session_message` FTS index for both engines. When a native turn
settles, the Host upserts one row per visible message containing only its text parts and settled
run timing; tool bodies, files, and reasoning stay in Pi, and these rows never feed model history.
Rows are keyed by message ID, so a fork indexes only its own turns and inherited history is found
under its original session. Deleting a turn removes its rows; archived sessions are filtered at
query time. A crash between the Pi commit and the index write leaves that turn unsearchable.

Run timing comes from Pi: the run spans its responses, and each tool span uses the result's
monotonic duration. Approval waits are observed by the Host and settled into the index row, which
the reader prefers over the timing derived from Pi.

## Operations And Backup

Submissions use Pi 1.1.0 admission with `whenBusy: 'followUp'` and one-at-a-time delivery. Busy
submissions must keep the current model/options/instructions/tool configuration; changes return
`SESSION_BUSY`. The local text composer can send a drafted follow-up while showing a separate stop
action; client admission preserves the currently streaming answer. Retries and forks require idle.
Queued withdrawal and active stop are distinct runtime operations. Stop aborts active work. Forks use
Pi history; regenerating a completed answer forks before the original input and resubmits it,
keeping the old answer. Retrying a failed, cancelled, or interrupted answer stays in the session: it
hides that turn and resubmits the question. Completed tool results stay in model context so the retry
continues from them; without them, only the old question is omitted.

Deleting a settled native turn hides it and appends a Pi context edit that omits its messages from
later model context. Content already folded into a compaction summary stays in that summary. Hides
live in a rewindable conversation document; a fork re-applies hides of the turns it inherits, even
those committed after its fork point. Legacy turns before a handoff cannot be deleted individually.
Physical single-conversation erasure is unavailable; archiving changes Cherry metadata after stop and
idle. The runtime exposes reset, which keeps history while starting a new context; this change does
not add a dedicated reset/steering/queue-management screen.

Each run has a tool budget of 64 calls and 20 tool steps. When it is exhausted, the next request
adds a final-answer instruction and disables tool selection on the provider payload; a tool step
after that request ends the turn. A streaming tool call with an input preview shows a bounded preview
instead of its growing input.

Backup format v2 captures both authoritative databases and referenced resources from the same
quiescent storage generation. Capture rejects unfinished work, including native compaction.
Candidate validation checks upstream schema version and migration fingerprint (the package version is
recorded but not required to match), integrity, submission
metadata, business ownership, legacy boundaries, and managed file grants. Candidates with unfinished
Pi work are rejected and never resumed. Generation activation and rollback cover the pair.
Format v1 remains readable and starts an empty Pi store; imported legacy sessions use lazy handoff.

## Implementation Gates

Exact package pins are `1.1.0`, which satisfies the repository release-age policy.
Compatibility patches are rebased on published packages, including the supported OAuth flows and
the Node-only dynamic import that Metro rejects. Preboot supplies `Promise.withResolvers()` when
Hermes lacks it. Node storage, process, filesystem, and callback-listener entries stay out of the
mobile graph. The replaced per-turn Host/runtime/compaction implementation and `pi-agent-core` are
removed.

Regression tests cover SQL ordering/rollback, creation repair, durable execution, unsafe
interruption, forks, turn hiding, projection, timing, tool budget, legacy handoff, model/tool
bridges, search indexing, and paired backup format. Both platforms bundle with Metro and the Android
bundle compiles with Hermes. Device acceptance has not run; source integration must not be reported
as verified production readiness.
