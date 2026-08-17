# Mobile Job Manager Background Execution Design

> Updated: 2026-08-03
> Desktop source: `CherryHQ/cherry-studio@d498753ecfd0f2572612456281ec222563ce7bf3`
> Mobile baseline: `CherryHQ/cherry-studio-app@c5896682d900298bde11d944bcb4aef4183ae9c1`
> Background-reply experiment: draft PR [#473](https://github.com/CherryHQ/cherry-studio-app/pull/473),
> head `919dda1d229eb3fbd497f1e185909cc4598f9d3f`
> Android reference: `OpenMinis/OpenMinis@9cf3a855fecd27bb5735b84cacbd56852a3ab8dd`

## Decision

**Conditional go: build a durable mobile job coordinator. Do not port the desktop runtime as a
source copy, and do not make any operating-system background API responsible for job correctness.**

Mobile can provide durable enqueue, atomic claim, cancellation, retry, restart recovery, history,
run-now, and best-effort catch-up. The operating systems can sometimes wake the app or let an
already-started operation continue, but neither iOS nor Android promises desktop-style arbitrary
code execution at an exact future time.

The product contract should be:

| Product capability | Contract |
| --- | --- |
| Work survives navigation and is observable from another screen | Supported after ownership moves from route sessions to an app-owned job module |
| Job intent and terminal result survive process death | Supported through SQLite and handler-specific recovery |
| Short maintenance eventually runs in an OS window | Best effort; no exact start or finish time |
| A user-started long operation continues after backgrounding | iOS 26+ through Continued Processing; Android through a policy-valid foreground lease; older iOS has only finite grace |
| Large uploads/downloads survive ordinary process death | Use the platform transfer engine, not a JavaScript handler loop |
| A local task runs exactly at 08:00 | Android-only and conditional through exact-alarm special access; unavailable as a cross-platform contract |
| An unattended Agent runs while the app is unopened for days | Server-owned scheduling and execution |
| Any local job runs after the person force-quits the app | Not supported |

PR #473 is useful as an experiment and as evidence that a user-started iOS stream can be kept alive
under a silent-audio session. It cannot wake a suspended app, survive force-quit, schedule future
work, or provide Android behavior. Silent audio also does not satisfy Apple's production background
audio contract. It must not become the Job Manager's execution foundation.

OpenMinis proves the Android native flow from an exact alarm to a visible foreground service. It
does not prove durable Job Manager semantics: its scheduled Agent still depends on in-memory
coroutines and has no transactional job claim, idempotent recovery, or process-death resume.

## The Four-Layer Model

The implementation must keep four concepts independent:

| Layer | Question | Owner |
| --- | --- | --- |
| Durable state | What work exists, what attempt is current, and what result was committed? | Cherry SQLite ledger |
| Wake trigger | What gives the process an opportunity to run now? | App launch/resume, BGTaskScheduler, WorkManager, AlarmManager, or server push |
| Execution lease | How long may this already-dispatched work keep using CPU/network in the background? | iOS background task/Continued Processing, Android worker/foreground service; system transfer engines own transfer execution |
| Recovery | What happens after suspension, expiration, process death, cancellation, or duplicate delivery? | Job module plus each handler's policy |

One platform primitive may fill two roles. For example, `BGProcessingTask` both wakes iOS and grants
a bounded processing window, while WorkManager both persists its own system work request and runs a
bounded worker. The roles still remain separate in Cherry's design: the OS record is a hint or
delivery vehicle, never the business source of truth.

```text
business intent
      |
      v
SQLite job ledger <-------------------------------+
      |                                            |
      | any wake trigger                           | checkpoint/recovery
      v                                            |
bounded job pump -> atomic claim -> execution lease -> handler -> durable result
```

The resulting invariants are:

1. A wake is not proof that a job ran.
2. A notification or Live Activity is not an execution lease.
3. An execution lease is not durable state and may expire early.
4. A JavaScript promise is not a durable result.
5. Every wake path calls the same bounded pump.
6. Every handler remains correct if wake or lease acquisition is delayed, duplicated, refused, or
   interrupted.
7. Force-quit is a supported interruption boundary, not a scenario to work around.

## iOS And iPadOS

Cherry currently supports iOS 17 and later. iOS 26 Continued Processing can therefore enhance the
newest systems, but it cannot be the only implementation.

### Mechanism Matrix

| Mechanism | Actual role | Timing/runtime contract | Job Manager use |
| --- | --- | --- | --- |
| Foreground runtime | Normal execution | Runs while the app is active; navigation ownership can still abort work | Primary execution path; app-owned runtime rather than route-owned sessions |
| `UIApplication.beginBackgroundTask` | Finite execution lease for work already in progress | No future wake; expiration handler required; time is system-controlled | Finish a small save/checkpoint or stop cleanly, not a long Agent run |
| `BGAppRefreshTask` | Opportunistic wake plus short window | System-selected, based partly on usage; `earliestBeginDate` means not-before, not run-at; roughly 30 seconds | Reconcile state, fetch a small delta, or drain a very small number of jobs |
| `BGProcessingTask` | Deferred wake plus longer bounded window | Can run for minutes while the device is idle; system may interrupt it when conditions change or the person uses the device | Idempotent maintenance, indexing, cleanup, or a bounded job pump |
| `BGContinuedProcessingTask`, iOS 26+ | User-visible execution lease for explicit foreground actions | Begins immediately or shortly after foreground submission; may queue or fail under load; reports system Live Activity progress; user/system may cancel | Best production lease for Send, Generate, Export, or similar user-started work |
| Background `URLSession` | System-owned HTTP upload/download engine | Transfer runs in another process; app can be resumed/relaunched for events; user force-quit cancels it | File-based upload/download only, followed by a short reconciliation job |
| Background APNs notification | Server-originated opportunistic wake | Low priority, throttled/coalesced/dropped, approximately 30 seconds if delivered | Fetch server state or enqueue local reconciliation; never exact scheduling |
| Local notification / Live Activity | User-visible status surface | Presents UI but grants no arbitrary code time | Show progress, completion, or a prompt to reopen; never mark a job complete |
| Background audio | Capability-specific execution for audible media | Intended for apps actually playing audible content | Not a generic lease; a silent keep-alive is an App Review risk |

Apple's current BackgroundTasks headers make the scheduling limits explicit:

- `earliestBeginDate` only prevents an early launch; the system does not guarantee launch on that
  date.
- `BGProcessingTask` can run for minutes, only while the device is idle, and is terminated when the
  person starts using the device.
- A processing request is deferrable. The system attempts it when conditions are favorable rather
  than treating it as a wall-clock timer.
- Every `BGTask` needs an expiration handler and can expire before consuming the expected time.

### iOS 26 Continued Processing

`BGContinuedProcessingTask` is the closest iOS equivalent to Android's user-visible foreground
execution, but its scope is deliberately narrow:

- The request is created on behalf of the currently foregrounded app after a person's action.
- `earliestBeginDate` is ignored in favor of now. It is not a future scheduler.
- The submission strategy may queue or fail when resources are unavailable.
- CPU and network are supported by default; background GPU requires an entitlement and supported
  hardware.
- The task must report progress. iOS owns the Live Activity presentation and can expire stalled work.
- Removing the app from the app switcher cancels queued/continued work. That cancellation may not
  deliver an expiration callback, so correctness cannot depend on cleanup running.

For iOS 17-25, Cherry should run the same `user-continued` job while foregrounded and use
`beginBackgroundTask` only to persist a checkpoint and stop. The product should not promise long
continuation on those versions.

### Why PR #473 Is Not The Job Manager

PR #473 adds a host-owned `BackgroundReplyRuntime`, a feature-agnostic
`BackgroundActivityManager`, and a reference-counted `KeepAliveCoordinator`. The coordinator loops
a bundled silent AAC asset while chat turns or user-continued painting jobs hold a lease; the
manager updates their Live Activities. Simulator tests showed a controlled stream continuing for
more than three minutes and a later run lasting about seven minutes and forty-seven seconds.

That evidence answers one narrow question: the React Native runtime can remain active while iOS
treats the app as an audio app. It does not establish a production contract:

1. Silent audio exists only to retain execution, while Apple's audio mode is for audible content.
   App Review Guideline 2.5.4 requires background modes to serve their intended purpose.
2. The coordinator cannot wake the app for a later schedule and does not survive force-quit.
3. Live Activity reports state but grants no runtime.
4. Host ownership now lets chat turns and painting jobs outlive their initiating routes, but neither
   workflow survives process death without a provider-specific resumable protocol.
5. The background-reply preference gates chat leases; painting generation acquires independently,
   so one feature cannot silently disable the other's continuation.
6. Physical-device lock screen, low-power, interruption, thermal, memory-pressure, and App Review
   gates remain unproven.

Reusable parts are limited to progress-content derivation, Live Activity presentation, cancellation
plumbing, and the concept of a lease adapter. Production iOS 26 code should acquire a native
Continued Processing lease instead of silent audio.

## Android

Cherry targets and compiles Android API 36. Android offers more explicit local wake and continuation
mechanisms than iOS, but every mechanism has user visibility, quota, permission, or policy limits.

### Mechanism Matrix

| Mechanism | Actual role | Timing/runtime contract | Job Manager use |
| --- | --- | --- | --- |
| WorkManager one-time work | Persistent, deferred wake and bounded worker | Runs sometime after constraints are met; retries/backoff and reboot persistence are built in | Default adapter for short, deferrable reconciliation |
| WorkManager periodic work | Inexact recurring wake | Minimum interval is 15 minutes; actual execution depends on constraints and system optimization | Periodic ledger scan only, never cron semantics |
| Expedited WorkManager | Higher-priority deferred work | Quota-limited with an out-of-quota policy | Small time-sensitive work, not an unlimited Agent lease |
| Long-running WorkManager worker | Worker promoted through a foreground service | Requires ongoing notification; Android 16 workers can exhaust JobScheduler quota | Restartable, user-visible work when the quota model and service type fit |
| Foreground service | User-visible execution lease | Persistent notification and valid service type required; Android 12+ restricts background starts; system/user can stop it | User-started work after a durable claim, only with a truthful service type |
| User-initiated data-transfer job, Android 14+ | Long system-scheduled transfer lease | Starts from a visible/user-permitted state, shows progress notification, and can run for an extended transfer | Large user-requested upload/download, not generic AI/tool computation |
| AlarmManager inexact alarm | Approximate clock wake | May be delayed/coalesced, especially under idle/battery restrictions | Best-effort reminder to run the common pump |
| AlarmManager exact alarm | Precise Android-only wake | Reserved for genuinely time-critical user-facing features; special access often required; idle delivery is rate-limited | Optional schedule tier; receiver hands off a durable job and returns |
| BroadcastReceiver | Brief dispatch callback | `onReceive`/`goAsync` must finish quickly, generally under ten seconds | Validate wake, start a worker/eligible service, then finish |
| Partial wake lock | Keeps CPU awake while work already runs | Does not start a process, preserve memory, or recover state; battery-expensive | Usually unnecessary with WorkManager/JobScheduler; never a correctness mechanism |
| High-priority FCM | Server-originated wake opportunity | Delivery priority may be downgraded; short processing window and narrow FGS exemption | Notify/reconcile server-owned work, not local exact scheduling |

### Foreground-Service Limits

An Android foreground service is not an unrestricted equivalent of a desktop process:

- Android 14+ requires a declared service type, the corresponding permission, and any runtime
  prerequisites.
- Android 12+ normally forbids starting a foreground service while the app is in the background.
  Narrow exemptions include a genuinely user-requested exact alarm and a valid high-priority FCM
  delivery.
- Android 15+ limits `dataSync` and `mediaProcessing` to six hours per service type in a rolling
  24-hour period while backgrounded. `shortService` is approximately three minutes.
- Android 16 long-running WorkManager workers can consume JobScheduler quota even though WorkManager
  promotes them to foreground execution.
- The person can stop foreground-service work from system UI. The process can also die under
  pressure; `START_STICKY` does not recreate a coroutine, JavaScript promise, network request, or
  tool state.
- There is no obvious universal foreground-service type for an arbitrary Agent loop.
  `mediaPlayback` is valid only when playing media. `dataSync` or `specialUse` must truthfully match
  the concrete workflow and pass Play policy review.

The notification permission is separate. On Android 13+, an app can start an otherwise valid
foreground service without notification permission, but it must still create the notification; the
system may show it in Task Manager rather than the notification drawer.

### Exact Alarms

AlarmManager can provide an Android-only precision tier, not a completion guarantee:

- `SCHEDULE_EXACT_ALARM` is special access and is not automatically granted to fresh installs
  targeting API 33+. `USE_EXACT_ALARM` is auto-granted only for narrow core use cases and is subject
  to Play policy.
- Cherry must call `canScheduleExactAlarms()`, explain the capability only when a person requests
  precise scheduling, handle grant/revocation, and expose an inexact fallback honestly.
- Alarms are cleared on reboot. Re-arm after boot, app replacement, clock changes, time-zone changes,
  and permission changes.
- Arm only the earliest occurrence from SQLite. On delivery, transactionally evaluate every due
  schedule and then arm the next earliest occurrence.
- A wakeup alarm wakes the CPU and grants only a brief dispatch opportunity. The receiver must not
  run JavaScript networking or wait for an Agent.
- A qualifying exact alarm may allow a background foreground-service start, but the subsequent
  service still needs a valid type, notification, cancellation, and timeout behavior.
- An inexact fallback does not keep the exact-alarm foreground-service start exemption. If special
  access is unavailable, hand off through WorkManager or notify the person instead of blindly
  starting the same service from the receiver.

### What OpenMinis Demonstrates

The inspected OpenMinis flow is:

```text
ScheduledTask JSON in SharedPreferences
  -> AlarmManager setExactAndAllowWhileIdle
  -> ScheduledTaskAlarmReceiver
  -> re-arm next occurrence
  -> AgentForegroundService + PARTIAL_WAKE_LOCK
  -> process-scoped HeadlessChatRunner / ChatViewModel
  -> history row + completion notification
```

Useful ideas:

- Re-arm a recurring schedule as the next one-shot occurrence.
- Start a visible execution owner before a long Agent loop.
- Provide Stop and deep-link actions from the notification.
- Re-register alarms after reboot and expose OEM battery-control guidance.
- Reuse the normal Agent implementation through a headless entry rather than fork business logic.

Do not copy these details:

1. `SharedPreferences` task JSON is the source of truth. Cherry should keep all job and schedule
   state in SQLite.
2. The receiver holds `goAsync()` until an Agent run that can last ten minutes. Cherry must hand off
   and call `finish()` immediately.
3. The service declares `mediaPlayback` to avoid the Android 15 `dataSync` timeout even though Agent
   work is not media playback. That is not a valid Play-distributed design.
4. `START_STICKY` and a no-timeout wake lock improve process survival but do not recover the in-memory
   coroutine.
5. The ten-minute waiter can time out without canceling the underlying stream, so history may report
   timeout while work continues.
6. There is no persisted `pending/running/retry/terminal` state machine, atomic claim, fencing token,
   idempotency key, missed-run catch-up, or process-death recovery.

OpenMinis is architecture evidence for Android wake-to-lease handoff, not reliability evidence for a
Job Manager.

## Termination Boundaries

| Event | iOS/iPadOS | Android | Required behavior |
| --- | --- | --- | --- |
| Ordinary background/suspension | JavaScript receives no CPU by default; a matching task/transfer/push may grant a window | Cached process may receive little or no CPU; workers, alarms, jobs, or FGS provide explicit windows | Persist before suspension; never infer state from an in-memory promise |
| OS process death | Background URLSession can continue separately; other execution is discretionary | WorkManager recreates a worker; FGS can still die; sticky restart does not restore memory | Recover `running` rows and retry only idempotent/checkpointed work |
| App-switcher/recents removal | Continued work, transfers, and pushes are canceled or suppressed until relaunch | Usually not force-stop, but OEM behavior varies | Promise no iOS continuation; treat Android OEM behavior as degraded reliability |
| Android Task Manager Stop | Not applicable | Stops the process/back stack without callback; scheduled jobs and alarms can remain eligible | Reconcile on the next start and record user-requested stop where available |
| Settings force-stop | No separate Settings action; app-switcher termination is the relevant user stop | Package is stopped until user action; Android 15+ also cancels pending intents | Promise no local execution until the person launches/interacts again |
| Device reboot | No exact or exactly-once launch guarantee | WorkManager reschedules; alarms are lost; FGS is gone | Recreate registrations from SQLite, then run recovery |
| App update | Treat as cold process launch | Persisted worker class names can break if renamed/removed | Version payloads, retain aliases/migrations, and reconcile before dispatch |

## Cross-Platform Execution Classes

Classify each enqueued job by the guarantee it actually requires:

```ts
type JobExecutionClass =
  | 'foreground-only'
  | 'bounded-background'
  | 'user-continued'
  | 'system-transfer'
  | 'server-required';
```

| Class | Requirements | iOS adapter | Android adapter | Fallback |
| --- | --- | --- | --- | --- |
| `foreground-only` | Needs UI, tool approval, uncheckpointed stream, or foreground-only SDK | Active app | Active app | Pause and notify |
| `bounded-background` | Short, idempotent, checkpointable, no UI dependency | App Refresh or Processing task | WorkManager | Run on next foreground |
| `user-continued` | Explicit user action, visible progress/cancel, bounded or checkpointable | Continued Processing on iOS 26+; finite grace on older iOS | Valid FGS or long worker | Continue only while foreground; checkpoint on background |
| `system-transfer` | File-based upload/download that the OS can own | Background URLSession | UIDT, DownloadManager, or suitable worker | Resume/retry transfer from durable metadata |
| `server-required` | Exact cross-platform time, unopened-for-days, long autonomous Agent, or strong completion guarantee | Server | Server | Notify/sync result on next client wake |

Execution class and recovery policy are separate. A `user-continued` operation may still be
`abandon` on restart if repeating the provider call could double-charge, while a
`bounded-background` repair can be safely retried.

### Workflow Mapping

| Workflow | Recommended ownership | Important condition |
| --- | --- | --- |
| Chat/Agent turn started with Send | App-owned chat-turn module, optionally coordinated by a `user-continued` job | Persist messages incrementally. Tool approval is chat-domain state and must not continue headlessly |
| Painting generation | Job module with painting receipt as durable destination | Persist provider task ID/idempotency token before polling; otherwise abandon an ambiguous attempt instead of resubmitting |
| Large file/model upload or download | `system-transfer` adapter plus reconciliation job | Use file URLs and a stable transfer/session ID; arbitrary LLM streaming does not qualify |
| Knowledge indexing, cleanup, metadata backfill | `bounded-background` | Chunk work and checkpoint cursor so expiration loses little work |
| Local reminder | Notification, optionally a pending foreground job | A notification is not proof the underlying action ran |
| User-selected Android 08:00 run | Exact alarm wake plus durable pump, only as Android tier | Special access and a valid execution owner are both required |
| Recurring unattended Agent | Server scheduler/executor | Push only synchronizes or announces the result |

Chat deserves special caution. The current `ChatSession` is route-owned and disposal aborts every
active turn. Moving it to app lifetime solves navigation ownership, but an LLM stream still cannot
be reconstructed after process death unless the provider exposes a durable request/task ID. An
Agent turn is also a workflow with messages, tool calls, and approvals, not just one replayable job.
Keep that business state in the chat module and let the Job Manager coordinate execution attempts.
Chat should not be the first MVP handler until its provider-recovery contract is explicit.

## Recommended Module Design

### External Interface

Implement one deep app-owned module. Its small command interface hides database transitions,
handler lookup, retry, cancellation, scheduling evaluation, platform eligibility, and recovery:

```ts
type JobRuntime = {
  enqueue<TType extends JobType>(
    type: TType,
    input: JobInput<TType>,
    options?: EnqueueOptions,
  ): Promise<{ id: string }>;

  cancel(id: string, reason?: string): Promise<JobCancelResult>;

  pump(request: PumpRequest): Promise<PumpResult>;
};
```

`enqueue` returns a durable ID, not a promise whose lifetime defines success. Job/history reads
remain Data API endpoints so UI can reattach after navigation or restart. A foreground-only
`finished` convenience may exist, but it must be implemented by observing the ledger and must not be
the only result path.

The module belongs in the app-lifetime bootstrap composition. `AppBootstrapRuntime` is the natural
owner because it already owns the database and backend composition. React routes, hooks, and
`ChatSessionProvider` must not own the job dispatcher.

### Internal Platform Seams

Only behavior that genuinely differs by platform should sit behind adapters:

```ts
type JobWakeScheduler = {
  reconcile(input: {
    earliestAt: number | null;
    requiresNetwork: boolean;
  }): Promise<WakeRegistrationResult>;
};

type JobExecutionLeaseProvider = {
  acquire(input: {
    jobId: string;
    executionClass: JobExecutionClass;
    title: string;
  }): Promise<JobExecutionLease | null>;
};

type JobExecutionLease = {
  signal: AbortSignal;
  update(progress: JobProgress): void;
  release(outcome: JobLeaseOutcome): Promise<void>;
};
```

These are internal seams, not part of the business interface:

- iOS wake adapter: BackgroundTasks/Expo BackgroundTask.
- Android wake adapter: WorkManager, with an optional exact-alarm native adapter.
- iOS lease adapter: Continued Processing on iOS 26+, limited
  `beginBackgroundTask` checkpoint grace on older versions.
- Android lease adapter: a correctly typed FGS or long-running worker.
- Transfer adapters are separate because the OS, rather than the handler, owns the bytes.
- Test adapters provide deterministic wake refusal, lease expiration, cancellation, and deadlines.

The job module must remain correct when `acquire` returns `null` or its signal aborts immediately.
Lease acquisition can improve continuation; it cannot authorize a background-ineligible handler.

### Runtime Entry Points

Use one global headless task entry, not one native registration per business job or schedule:

```text
foreground initialize / AppState.active ----+
Expo background callback ------------------+
iOS Continued Processing callback ---------+--> create headless-safe dependencies
Android worker callback -------------------+    --> JobRuntime.pump(...)
Android alarm receiver -> worker/FGS ------+
explicit Run Now --------------------------+
```

The headless composition may open the same `cherry.db`, but it must not import React, navigation,
translations, frontend cache state, or route sessions. Cherry uses Expo CNG and has no committed
application-level `ios/` or `android/` directories, so Continued Processing, exact alarms, and FGS
support should be implemented as local Expo modules plus config plugins following the existing
native-module pattern.

Expo `BackgroundTask` is only the opportunistic dispatcher. It maps to BGTaskScheduler and
WorkManager, has a 15-minute Android minimum, is system-delayed, and multiplexes registered
JavaScript tasks through one worker. Register one Cherry pump and keep SQLite authoritative.

### Responsibility Split

| Owner | Responsibilities | Must not own |
| --- | --- | --- |
| Job module | Durable intent, claim/fencing, eligibility, concurrency, retry, cancellation, recovery, schedule occurrence creation | Chat approvals, painting outputs, transfer bytes, platform policy UI |
| Domain handler/module | Business destination, idempotency, provider checkpoint, domain-specific resume/abandon behavior | Native wake registration or global dispatch |
| Platform adapter | Register a wake, expose deadline/cancel signal, show required system progress, report capability/refusal | Job state machine or duplicated business payload storage |
| Server | Strong wall-clock schedule and unattended execution where product supports server credentials | Pretending a push delivery is exactly-once local completion |
| UI | Enqueue, observe durable destination/job state, request cancel, explain reliability tier | Keeping a promise/timer alive as the source of truth |

## Durable Execution Protocol

### Ledger

Reuse the desktop six-state vocabulary unless an actual workflow proves another state is required:

```text
pending -> running -> completed
                   -> failed
                   -> cancelled
running/pending -> delayed -> pending
```

Port the core `job` and `job_schedule` semantics, but add mobile fencing data. At minimum, a durable
job needs:

| Data | Purpose |
| --- | --- |
| ID, type, payload version, input | Stable work intent and handler migration |
| Status, priority, queue, scheduled time | Dispatch ordering |
| Attempt, retry policy, error | Recovery and backoff |
| Execution class and recovery-policy version | Eligibility in the current wake window and stable restart semantics |
| Idempotency key | Prevent duplicate active intent and duplicate schedule occurrences |
| Run token, runtime owner, claim/deadline timestamps | Fence overlapping foreground/headless attempts |
| Checkpoint/provider task ID | Resume/poll without repeating an ambiguous external request |
| Destination ID | Put results in chat, painting, file, or another business record |
| Cancel request and timestamps | Cooperative cancellation and audit |

The existing desktop `metadata` field can carry early checkpoints, but provider task IDs and fencing
fields should become typed columns once correctness depends on them. Do not add a separate attempt
history table until product diagnostics need per-attempt rows.

### Atomic Claim And Fencing

Mobile `DbService` already uses WAL and serializes asynchronous `BEGIN IMMEDIATE` write
transactions. Claiming must keep capacity check, candidate selection, and
`pending -> running` transition in one awaited transaction.

Every claim generates a unique `runToken`. Checkpoint, progress persistence, retry scheduling, and
terminal finalization update with both `jobId` and `runToken`. If recovery has issued a new token,
late callbacks from an expired worker become no-ops instead of completing the newer attempt.

Do not reclaim solely because a JavaScript heartbeat stopped: normal iOS suspension can pause it.
Treat a claim as stale after a new runtime instance cold-starts, an explicit OS expiration/stop is
recorded, or its bounded deadline passes without a live owner. The run token remains the final fence
when an old callback outlives that decision.

This is stronger than relying on an in-memory mutex. Foreground activation can overlap a headless
callback, and an expiration handler does not prove old JavaScript stopped immediately.

Never hold a database transaction across provider, file, network, or tool work.

### Bounded Pump

Each wake invokes the same algorithm with an explicit deadline, permitted execution classes, and a
maximum job count:

1. Initialize only headless-safe dependencies and the handler registry.
2. Reconcile stale `running` claims according to each handler's recovery policy.
3. Transactionally evaluate due schedules and create occurrence jobs with deterministic
   idempotency keys.
4. Select only jobs eligible for the current foreground/background window.
5. Atomically claim one row and persist its `runToken` before acquiring or binding a platform lease.
6. If a required lease is unavailable, conditionally return the claim to delayed/pending using the
   same token; never run a background-ineligible handler without it.
7. Execute with one combined `AbortSignal` for user cancellation, OS expiration, runtime disposal,
   and pump deadline.
8. Checkpoint before the deadline and finalize conditionally on the same `runToken`.
9. Stop before the OS budget is exhausted, then reconcile the next wake hint from durable state.

Use a low global concurrency cap. Mobile runs backend JavaScript on the same Hermes runtime as the
UI while foregrounded, and parallel model/file work can amplify memory pressure. Tune from device
measurements rather than porting the desktop default.

### Recovery Policies

Keep recovery explicit per handler:

| Policy | Use when | Restart behavior |
| --- | --- | --- |
| Abandon | External outcome is ambiguous and replay could duplicate cost/effect | Mark interrupted attempt terminal and require explicit retry |
| Retry | Handler is idempotent or an idempotency key makes replay safe | Move stale running work through backoff to pending |
| Resume from checkpoint | Provider/system owns durable task ID or handler has a committed cursor | Poll/continue from checkpoint without resubmission |
| Singleton | Only the newest outstanding intent is meaningful | Cancel older non-terminal rows, then apply retry/resume to newest |

No cleanup callback is guaranteed. Recovery must work solely from committed rows.

### Scheduling

Schedules are durable definitions, while OS registrations are replaceable hints:

- Persist `trigger`, time zone, next occurrence, last occurrence, enabled state, and catch-up policy.
- Derive a deterministic occurrence key from the `(scheduleId, occurrenceAt)` tuple and enforce
  uniqueness.
- Evaluate all due occurrences on every wake; delivery may be late, coalesced, or duplicated.
- Use foreground timers/Croner only as an active-app latency optimization.
- Reconcile one platform wake from the earliest relevant schedule instead of mirroring all state into
  native storage.
- Keep local-best-effort, Android-exact, and server-reliable schedules distinct in UI and data.
- A wake marks an occurrence dispatched only after the occurrence job is committed. It never marks
  the business job completed.

### Results, Progress, And Cancellation

Terminal business results belong in their domain destination:

- a chat turn persists messages and approval state;
- a painting job writes the painting receipt/output rows;
- a transfer writes its file entry and system transfer ID;
- an indexing job commits its cursor/index changes.

The job row holds orchestration status and a reference to that destination. UI reads both through
Data API and may subscribe to in-process events for low-latency foreground updates. Persisted state
remains authoritative after restart.

Progress should be throttled and persisted only at meaningful checkpoints. Live Activity and Android
notification adapters observe that progress; they do not own it.

Cancellation first persists `cancelRequested`, then aborts an active matching `runToken`. Platform
Stop/Cancel actions call the same path. A handler that ignores the signal may lose its claim after
the deadline, but its stale callback cannot finalize because of fencing.

## Desktop Port Scope

The desktop subsystem is mature: its main responsibilities include a six-state SQLite ledger, typed
handlers, concurrency, cancellation, retries, schedules, startup recovery, catch-up, garbage
collection, and backup pause/drain. Port semantics selectively:

| Desktop area | Mobile decision |
| --- | --- |
| DTO/Zod status, trigger, retry, and catch-up schemas | Reuse and extend with execution class/payload version |
| `job` / `job_schedule` tables and indexes | Port through a mobile migration; add run fencing |
| Handler registry, backoff, idempotency, recovery vocabulary | Reuse semantics with mobile dependencies |
| Synchronous `better-sqlite3` repositories | Rewrite for async `DbService.withWriteTx()` |
| `JobManager` lifecycle/service-locator wiring | Reimplement in explicit bootstrap composition |
| `SchedulerService` timers/Croner | Foreground optimization only |
| Shared-window cache progress | Replace with SQLite/Data API plus optional active-runtime events |
| `JobHandle.finished` | Foreground convenience only; durable ID/destination is authoritative |
| Desktop concurrency default and broad handler set | Start low with one proven mobile handler |
| Backup pause/drain, GC, parent jobs, fine progress | Defer until a real mobile consumer requires them |

The mobile module becomes worthwhile when at least two workflows need shared persistence,
cancellation, retry, recovery, or history. If the only requirement is painting surviving navigation,
an app-owned painting operation is smaller and should come first.

## Delivery Plan

### Phase 0: Capability And Correctness Spike

Create a disposable proof handler that writes `pending -> running -> completed` through real Expo
SQLite. Validate on a physical iPhone and representative API-36 Android device:

1. Active app, navigation, background/resume, and cold start.
2. Foreground and headless callbacks racing to claim the same row.
3. OS expiration during provider work and a late callback after a new run token is issued.
4. Expo background task delivery and denied/disabled background refresh.
5. iOS 26 Continued Processing submission, queue/fail, progress, cancellation, app-switcher removal,
   lock screen, Low Power Mode, thermal pressure, and network loss.
6. Older-iOS `beginBackgroundTask` expiration without silent audio.
7. Android FGS start while visible, valid type/notification behavior, Task Manager Stop, process
   kill, quota timeout, Doze, and OEM battery controls.
8. Exact-alarm denied/granted/revoked states, reboot, force-stop, clock/time-zone changes, receiver
   timeout, and handoff to the same database pump.
9. Provider duplicate-request/idempotency behavior for the proposed first real handler.

This is a go/no-go spike. In particular, it must prove that two runtime entry points cannot both
commit the same attempt.

### Phase 1: Foreground Durable MVP

- Add schema/migration, async repository, registry, atomic claim/fencing, cancellation, retry, and
  cold-start/AppState recovery.
- Add `enqueue`/`cancel` commands and read-only Data API job/history endpoints.
- Own the module from `AppBootstrapRuntime`.
- Use one handler with an explicit destination and proven recovery policy.
- Omit schedules and native background adapters.

Painting is a candidate only if provider resubmission is idempotent or a durable provider task ID is
available. A short internal repair/indexing handler is safer for the first proof.

### Phase 2: Opportunistic Background Pump

- Register one Expo background task.
- Add bounded pump budgets, execution-class filtering, checkpoint deadlines, and physical-device
  tests.
- Support short `bounded-background` handlers only.
- Keep foreground resume as the guaranteed catch-up path.

### Phase 3: User-Continued And Transfer Adapters

- Add native iOS 26 Continued Processing and Android policy-valid foreground leases.
- Add Live Activity/notification progress and system Stop/Cancel plumbing.
- Use supported system-transfer adapters for large files.
- On older iOS, retain foreground execution plus finite checkpoint grace; do not ship silent audio as
  the fallback.

### Phase 4: Schedules

- Add schedule CRUD, due-occurrence evaluation, catch-up policy, and foreground timer optimization.
- Make server-backed scheduling the reliable cross-platform tier.
- Add Android exact alarms only if product accepts special-access UX, Play policy review, device
  validation, and explicitly Android-only semantics.

Rough one-engineer sizing, excluding server work and full product UI:

- capability/correctness spike: 4-7 engineering days;
- foreground durable MVP plus one handler: 2-3 weeks;
- opportunistic pump and device hardening: 1-2 weeks;
- user-visible native leases/transfers: 1-2 weeks;
- local schedule UX/catch-up and optional Android exact alarms: 1-2 weeks.

## Go/No-Go Gates

Proceed with a generic mobile Job Manager only when:

- at least two concrete workflows need its shared durable semantics, or job history/scheduling is a
  committed product requirement;
- every first-wave handler has a destination, payload version, execution class, idempotency rule,
  checkpoint format, cancellation behavior, and recovery policy;
- product wording accepts that local background schedules are best effort;
- physical devices prove fencing, expiration recovery, force-quit boundaries, and acceptable power
  behavior;
- the Android workflow has a truthful FGS type or uses WorkManager/UIDT without policy abuse;
- iOS 17-25 behavior is acceptable without silent-audio continuation;
- iOS 26 Continued Processing is treated as a capability enhancement, not the baseline;
- reliable unattended Agent automation has a server-side owner.

## Evidence Notes

This assessment uses repository source and first-party Apple, Android, Google Play, and Expo
documentation. It does not claim physical-device validation.

The desktop production surface previously measured 4,459 lines across the manager, scheduler,
persistence, schemas, contracts, and runtime helpers, plus 4,435 lines of focused tests. A targeted
desktop verification attempted 12 core/scheduler/repository/hook test files: five files and 40 tests
passed; seven database-backed files could not run because the installed `better-sqlite3` binary
targeted a different Node ABI than the available Node runtime. No native rebuild was attempted.

### Repository And Experiment Sources

- [Desktop Job Manager overview](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/docs/references/job-and-scheduler/overview.md)
- [Desktop Job Manager implementation](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/src/main/core/job/JobManager.ts)
- [Desktop job schema](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/src/main/data/db/schemas/job.ts)
- [Mobile architecture overview](./architecture-overview.md)
- [Mobile runtime ownership](./runtime-ownership.md)
- [Mobile `DbService`](../../src/backend/data/db/DbService.ts)
- [PR #473](https://github.com/CherryHQ/cherry-studio-app/pull/473)
- [OpenMinis scheduled-task manager](https://github.com/OpenMinis/OpenMinis/blob/9cf3a855fecd27bb5735b84cacbd56852a3ab8dd/src/android/app/src/main/java/com/openminis/app/scheduled/ScheduledTaskManager.kt)
- [OpenMinis scheduled-agent runner](https://github.com/OpenMinis/OpenMinis/blob/9cf3a855fecd27bb5735b84cacbd56852a3ab8dd/src/android/app/src/main/java/com/openminis/app/scheduled/ScheduledAgentRunner.kt)
- [OpenMinis foreground service](https://github.com/OpenMinis/OpenMinis/blob/9cf3a855fecd27bb5735b84cacbd56852a3ab8dd/src/android/app/src/main/java/com/openminis/app/service/AgentForegroundService.kt)

### Apple Primary Sources

- [Choosing background strategies](https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app)
- [Extending background execution time](https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time)
- [`BGTaskRequest.earliestBeginDate`](https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate)
- [`BGProcessingTaskRequest`](https://developer.apple.com/documentation/backgroundtasks/bgprocessingtaskrequest)
- [Performing long-running tasks](https://developer.apple.com/documentation/backgroundtasks/performing-long-running-tasks-on-ios-and-ipados)
- [`BGContinuedProcessingTaskRequest`](https://developer.apple.com/documentation/backgroundtasks/bgcontinuedprocessingtaskrequest)
- [Background URLSession downloads](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background)
- [Background push updates](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)
- [Configuring background execution modes](https://developer.apple.com/documentation/xcode/configuring-background-execution-modes)
- [App Review Guidelines 2.5.4](https://developer.apple.com/app-store/review/guidelines/#multitasking)
- [WWDC25: Finish tasks in the background](https://developer.apple.com/videos/play/wwdc2025/227/)

### Android And Expo Primary Sources

- [Android persistent work](https://developer.android.com/develop/background-work/background-tasks/persistent)
- [Defining WorkManager requests](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)
- [Long-running WorkManager workers](https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running)
- [AlarmManager guidance](https://developer.android.com/develop/background-work/services/alarms)
- [Foreground services](https://developer.android.com/develop/background-work/services/fgs)
- [Foreground-service background-start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [Foreground-service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout)
- [Foreground-service types](https://developer.android.com/develop/background-work/services/fgs/service-types)
- [User-initiated data-transfer jobs](https://developer.android.com/develop/background-work/background-tasks/uidt)
- [Wake locks](https://developer.android.com/develop/background-work/background-tasks/awake/wakelock/set)
- [Broadcast receiver guidance](https://developer.android.com/develop/background-work/background-tasks/broadcasts)
- [Handling user-stopped foreground services](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping)
- [Android 15 stopped-state behavior](https://developer.android.com/about/versions/15/behavior-changes-all#enhanced-stop-states)
- [Google Play foreground-service requirements](https://support.google.com/googleplay/android-developer/answer/13392821)
- [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Expo TaskManager](https://docs.expo.dev/versions/latest/sdk/task-manager/)
