# Job Manager Mobile Portability Assessment

> Assessment date: 2026-08-02
> Desktop source: `CherryHQ/cherry-studio@d498753ecfd0f2572612456281ec222563ce7bf3`
> Mobile baseline: `CherryHQ/cherry-studio-app@c5896682d900298bde11d944bcb4aef4183ae9c1`
> Background-reply experiment: draft PR [#473](https://github.com/CherryHQ/cherry-studio-app/pull/473),
> head `919dda1d229eb3fbd497f1e185909cc4598f9d3f`

## Decision

**Conditional go: port the durable job semantics, not the desktop runtime implementation.**

Mobile can support a persistent job ledger, typed handlers, queue concurrency, cancellation, retry,
restart recovery, run-now, job history, and catch-up when the app next gets an execution window. It
cannot provide desktop-equivalent guarantees that a cron callback fires on time, that JavaScript
keeps running after suspension, or that work continues after a person force-quits the app.

PR #473 improves one important case: an iOS job that a person starts while the app is active may
continue after the app moves to the background. It does not wake a suspended app for a future job,
does not survive force-quit, and has no Android implementation. Treat it as an optional execution
lease below a mobile-owned job runner, not as the scheduler or Job Manager itself.

The recommended product contract is therefore:

- **Supported locally:** durable jobs while the app is active, plus recovery on the next app start
  or resume.
- **Supported opportunistically:** short, idempotent background-eligible jobs when the operating
  system grants a background window.
- **Supported for already-running iOS work, after platform validation:** continuation through a
  user-visible background execution lease derived from PR #473.
- **Not promised locally:** exact cron timing, sub-15-minute background cadence, execution after
  force-quit, or unattended long-running AI work. These require a server-side scheduler/executor.

If the only near-term requirement is to let painting generation survive navigation, a dedicated
app-owned painting operation is smaller than porting the whole Job Manager. The generic runtime
becomes worthwhile when at least two durable workflows need shared retry, cancellation, recovery,
history, or scheduling.

## Evidence Baseline

### Desktop Job Manager

The desktop subsystem is mature and larger than one class. The assessed production surface is
4,459 lines across `JobManager`, `SchedulerService`, persistence services, schemas, contracts, and
runtime helpers. Its core and scheduler tests add another 4,435 lines. The main responsibilities are
documented in the desktop [job quick reference](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/src/main/core/job/README.md#L1-L31)
and [architecture overview](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/docs/references/job-and-scheduler/overview.md#L1-L52):

- a six-state SQLite job ledger;
- typed handler registration and payload binding;
- per-queue and global concurrency;
- cancellation, timeouts, retry backoff, progress, and terminal events;
- persistent cron, interval, and one-shot schedule definitions;
- startup recovery and missed-schedule catch-up;
- garbage collection and backup-restore pause/drain behavior.

The current business consumers include scheduled agent prompts, asynchronous image generation,
file processing, knowledge indexing, and file metadata backfill. Most of those domains do not yet
exist on mobile.

### Mobile Baseline

Mobile deliberately uses one React Native/Hermes runtime and an in-process frontend/backend
boundary, not Electron processes, IPC, the desktop lifecycle graph, or a service locator
([architecture overview](./architecture-overview.md#scope)). Its runtime rules explicitly state that
the desktop lifecycle framework is not ported and that backgrounding is not a reliable execution
window for chat or painting generation ([runtime ownership](./runtime-ownership.md#principles)).

The data layer is a viable foundation:

- `DbService` already owns Expo SQLite, WAL, and serialized `BEGIN IMMEDIATE` write transactions.
- Mobile timestamp and UUID helpers align with desktop schema conventions.
- Typed Data API handlers and React Query provide the correct read boundary for job history.
- The bootstrap composition root already owns app-lifetime backend services.

However, jobs are explicitly listed among the desktop data domains that have not been migrated
([shared data scope](../../src/shared/data/README.md#scope)), and the current dependency/configuration
set contains no `expo-background-task`, `expo-task-manager`, `croner`, or Android foreground-service
adapter.

### PR #473

PR #473 adds an iOS `BackgroundReplyService` that:

- starts looping a bundled silent audio asset with `shouldPlayInBackground: true` while a chat turn
  is generating;
- creates and updates a Live Activity after the app backgrounds;
- stops audio and settles the activity when the turn becomes terminal or awaits approval;
- is created per `ChatSession` and disposed with that session.

The PR comments record a 190-second controlled stream and continuous one-second JavaScript timers
while an iOS simulator remained backgrounded. A later simulator run remained backgrounded for about
7 minutes 47 seconds. This is useful integration evidence, but the PR itself still lists a signed
physical-device run, lock-screen behavior, audio interruption, low-power mode, and Live Activity UI
as open gates.

Two implementation facts matter before reusing it:

1. The current code has no `__DEV__` guard. It enables the service on iOS whenever the preference is
   not false, despite the PR description calling runtime playback Debug-only.
2. `ChatSession.dispose()` aborts every active turn and disposes the background-reply service, while
   `ChatSessionProvider` disposes the session on unmount. The current ownership therefore preserves
   an in-flight stream across app backgrounding, but not necessarily across navigation that unmounts
   the provider.

## Capability Matrix

| Capability | Direct source reuse | Mobile result | Decision |
| --- | --- | --- | --- |
| Job/trigger/retry DTOs and Zod schemas | High | Platform-neutral and mobile already uses Zod 4 | Port and keep vocabulary aligned |
| `job` / `job_schedule` tables and indexes | High | Expo SQLite supports the same data model | Port with a bundled mobile migration |
| `JobRegistry`, handler contract, backoff and catch-up rules | High | Mostly TypeScript-only | Port with mobile logger/import changes |
| `JobService` and `JobScheduleService` | Low code, high semantics | Desktop queries are synchronous; Expo Drizzle queries are asynchronous | Rewrite against injected `DbService` |
| `JobManager` dispatch and recovery | Low code, high semantics | Tied to desktop lifecycle, service locator, cache, power, and synchronous transaction ordering | Reimplement as a mobile runtime owner |
| `SchedulerService` timers and Croner | Foreground only | JavaScript timers stop being authoritative when iOS/Android suspends the runtime | Use only to optimize active-app execution |
| Job state/progress observation | Medium | Desktop shared-window cache has no mobile/headless equivalent | Keep state in SQLite; use queries plus live events while active |
| PR #473 audio keep-alive | Low as-is, useful pattern | Can extend an already-started iOS execution window | Extract behind a lease interface after gates pass |
| PR #473 Live Activity | Medium | Good user-visible progress surface; does not grant execution time itself | Keep as an optional observer |
| Exact unattended schedules | None | OS scheduling is inexact and force-quit stops local work | Use a server scheduler |
| Android long-running continuation | None in PR #473 | Requires WorkManager/foreground-service behavior and a persistent notification | Build a separate Android adapter |
| Backup pause/drain | Low current value | No matching mobile restore orchestrator exists today | Defer until a real consumer appears |

## Why A File Copy Is Unsafe

### Database execution is asynchronous

Desktop `JobService` relies on synchronous `better-sqlite3` calls and synchronous transaction
callbacks. Mobile `DbService.withWriteTx()` serializes an asynchronous callback on a long-lived Expo
SQLite connection. The count, capacity check, candidate read, and `pending -> running` claim must
remain in one awaited `BEGIN IMMEDIATE` transaction.

This cannot be converted safely by adding `await` mechanically. Post-commit effects such as state
publication, delayed-job arming, and queue kicks must run only after `withWriteTx()` resolves. A
headless worker and the foreground runtime may also create separate `DbService` instances, so the
spike must prove cross-connection locking and decide whether a SQLite busy timeout or a process-wide
runtime singleton is required.

### Runtime ownership differs

Desktop handler registration is coordinated by lifecycle phases and a global `application.get()`
container. Mobile must construct the handler registry explicitly in bootstrap and reuse the same
registry factory from a headless background entry point. Job execution must not import React,
navigation, translations, or frontend cache objects.

The mobile runtime also cannot depend on graceful disposal. The OS may suspend or terminate it
without running cleanup. A persisted `running` row and restart recovery must remain the correctness
path; disposal only clears timers and requests cooperative abort.

### Desktop timers are not mobile wakeups

Desktop `SchedulerService` uses Croner and chained `setTimeout` calls. These work while Hermes is
active and remain useful for immediate foreground behavior, but they do not wake a suspended app.
Persisted schedules must instead be evaluated whenever any wake source runs:

- app cold start;
- transition back to `AppState.active`;
- an operating-system background task;
- a user pressing Run Now;
- an optional server push or server-owned schedule.

### In-process promises are not durable results

Desktop `JobHandle.finished` is convenient for a caller in the same long-lived main process. That
promise disappears when mobile is suspended or terminated. A durable mobile workflow should return
a job ID and persist its result into a business destination. UI observes the job and destination via
Data API queries. `finished` may remain a foreground convenience, but it cannot be the only result
path.

The current painting flow already creates a painting receipt before calling the provider. That
painting ID is a suitable durable destination for a future `painting.generate` handler. Retrying a
provider submission is safe only if a provider task ID or idempotency token is durably checkpointed;
otherwise recovery should abandon the attempt to avoid duplicate charges.

The desktop observation contract also needs an explicit correction before reuse. Its
[`useJob`](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/src/renderer/hooks/useJob.ts#L5-L14)
comment says every state transition, including `running`, is published through the shared cache, but
the inspected `publishState` call sites cover initial enqueue and terminal finalization; the
transactional
[`claimNextPendingTx`](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/src/main/data/services/JobService.ts#L243-L268)
changes a row to `running` without a corresponding publication. Mobile must define and test its own
authoritative transition-observation contract rather than inherit this source/documentation drift.

## Role Of PR #473

PR #473 should become a narrow `BackgroundExecutionLease` adapter:

```ts
type BackgroundExecutionLease = {
  dispose(): void;
  update(progress: { detail?: string; percent?: number }): void;
};

type BackgroundExecutionService = {
  acquire(input: { jobId: string; title: string }): Promise<BackgroundExecutionLease>;
};
```

The runner acquires a lease only for a user-initiated, platform-eligible job and releases it in a
`finally` block. The job core must remain correct when lease acquisition fails.

This changes PR #473 in three ways:

- move ownership from a route-owned `ChatSession` to the app-owned job runtime;
- make Live Activity/audio behavior a platform adapter rather than chat business logic;
- model interruption and expiration as `AbortSignal` cancellation with a persisted recovery outcome.

The adapter still cannot start a future schedule. Keeping silent audio active continuously just to
make cron timers fire would create battery, user-experience, and App Review problems. Apple's App
Review Guideline [2.5.4](https://developer.apple.com/app-store/review/guidelines/#multitasking)
requires background services to be used for their intended purposes. Silent audio whose purpose is
only process keep-alive is therefore a material review risk and must not be the sole production
foundation.

For iOS 26 and later, prefer a small native adapter around
[`BGContinuedProcessingTask`](https://developer.apple.com/documentation/backgroundtasks/bgcontinuedprocessingtask).
Apple defines it for a task that begins in the foreground after a person's action and continues for
minutes or longer in the background, with system-owned Live Activity progress, cancellation, and an
expiration handler. It is a closer match for user-started chat, painting, and file-processing jobs
than silent audio. It still does not solve scheduled unattended work, is available only on iOS 26+,
and can be terminated under resource pressure.

## Recommended Architecture

```text
                         +-------------------------+
UI / business workflow ->| MobileJobCoordinator    |-> return job id
                         +------------+------------+
                                      |
                                      v
                         +-------------------------+
                         | SQLite job ledger       |
                         | job + job_schedule      |
                         +------------+------------+
                                      ^
                                      |
       +------------------------------+------------------------------+
       |                              |                              |
 cold start / AppState.active   OS opportunistic wake         explicit Run Now
       |                              |                              |
       +------------------------------+------------------------------+
                                      |
                                      v
                         +-------------------------+
                         | MobileJobRunner         |
                         | recover -> claim -> run |
                         +------------+------------+
                                      |
                     +----------------+----------------+
                     |                                 |
          background-eligible handler       foreground-only handler
                     |                                 |
          bounded OS execution window       optional execution lease
                                                       |
                                      iOS 26 continued task / PR #473
                                      Android foreground adapter
```

Recommended module ownership:

- `src/shared/data/api/schemas/jobs.ts`: snapshots, trigger/retry/catch-up schemas, read endpoints.
- `src/backend/data/db/schemas/job.ts`: mobile table definitions and indexes.
- `src/backend/data/services/JobService.ts` and `JobScheduleService.ts`: async persistence only.
- `src/backend/services/jobs/`: handler registry, runner, recovery, scheduling evaluation, and
  execution-policy rules.
- `src/bootstrap/composition`: explicit construction and handler registration.
- `src/bootstrap/runtime`: foreground start/resume/disposal ownership.
- a global TaskManager entry module: minimal headless initialization and a bounded due-job pump.

Do not create a second lifecycle framework or expose the concrete runner through React context.
Business workflows enqueue through narrow backend interfaces; job reads use Data API endpoints.

## Mobile-Specific Handler Policy

Add an execution policy that desktop does not need:

```ts
type JobExecutionPolicy = 'foreground-only' | 'background-eligible' | 'server-required';
```

A background-eligible handler must be short or checkpointable, idempotent, independent of mounted
UI, cooperative with `AbortSignal`, and able to persist progress before expiration. CPU-heavy work
must use a native implementation or server because mobile runs the backend on the same Hermes thread
as UI when foregrounded. Mobile should also choose a much lower global concurrency limit than the
desktop default of 50 and tune it from real memory/network measurements.

## Operating-System Wake Contract

Expo's [`BackgroundTask`](https://docs.expo.dev/versions/latest/sdk/background-task/) API is useful as
one wake source, not as the job database:

- Android's minimum interval is 15 minutes and execution remains inexact.
- iOS chooses when to run the task and may delay it substantially.
- battery and network conditions gate execution.
- tasks stop after a person kills the app and resume only after the app is started again.
- Expo multiplexes all registered JavaScript tasks through one native worker; the last registration
  determines the minimum interval.
- iOS background-task validation requires a physical device.

Register one `cherry.jobs.pump` task. On each wake, initialize only the headless-safe dependencies,
recover stale work, enqueue due schedule occurrences, run a bounded number of eligible jobs, persist
checkpoints, and return before expiration. Do not register one native task per job or schedule.

For Android long-running user-visible work, use the platform's documented long-running WorkManager
or foreground-service path with a persistent notification. This is separate from PR #473 and needs
Android-specific product and permission design. Android's
[`PeriodicWorkRequest`](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work#schedule_periodic_work)
also has a 15-minute minimum and does not promise an exact execution time.

## Product Reliability Contract

| User expectation | Local mobile support |
| --- | --- |
| Work continues after leaving a screen while the app runtime remains active | Yes, after moving ownership to the app job runtime |
| Work survives app/process restart and resumes or abandons by policy | Yes, from the SQLite ledger |
| A user-started iOS task continues after backgrounding | Conditional: PR #473 pattern, preferably iOS 26 continued processing |
| A short task eventually runs in an OS-granted background window | Best effort only |
| A task runs exactly at 08:00 or every 5 minutes | No |
| A task runs after the person force-quits the app | No |
| A 30-minute paid AI request always finishes in the background | No; use a server or provider-side durable task |
| Scheduled agent automation runs while the app is unopened for days | Server required |

## Delivery Plan

### Phase 0: capability spike

Use a physical iPhone and a representative Android device. Add a disposable proof job that writes
`pending -> running -> completed` through the real Expo SQLite connection and exercise it from:

1. active app execution;
2. app background/resume;
3. Expo's test-triggered background worker;
4. PR #473-style iOS continuation;
5. iOS 26 `BGContinuedProcessingTask`, if a native adapter is acceptable;
6. expiration/cancellation, network loss, lock screen, low-power mode, audio interruption, reboot,
   and force-quit.

This phase is a go/no-go gate, not production code. In particular, verify that a foreground runtime
and headless runtime cannot double-claim one row.

### Phase 1: foreground durable MVP

Port the schema, DTOs, registry, async repository, transactional claim, cancellation, `abandon` and
`retry` recovery, a low concurrency cap, and read-only job endpoints. Trigger recovery on cold start
and `AppState.active`. Omit cron, catch-up, pause/drain, GC, parent jobs, and fine-grained progress
until a real consumer requires them.

Use one real handler. A painting handler is viable only after its receipt ID becomes the durable
destination and provider resubmission semantics are explicit. Otherwise choose a short internal
repair task for the first proof.

### Phase 2: continuation and opportunistic wake

Add the execution-lease abstraction, physical-device behavior, one global OS job pump, expiration
handling, throttled persisted progress, and Live Activity/Android notification adapters. Keep every
path correct when the platform refuses or expires background execution.

### Phase 3: schedules

Add schedule CRUD, foreground Croner optimization, due-schedule evaluation on every wake, and an
explicit product distinction between local best-effort schedules and server-backed reliable
schedules. Do not present the former as exact automation.

Rough one-engineer sizing, excluding server work and full product UI:

- capability spike: 3-5 engineering days;
- foreground durable MVP plus one handler: 2-3 weeks;
- continuation/background adapters and physical-device hardening: another 1-2 weeks;
- local schedule UX and catch-up semantics: another 1-2 weeks.

A source-for-source desktop parity port would take longer and still fail to deliver parity at the
operating-system boundary.

## Go/No-Go Gates

Proceed with the generic runtime only when all of these are true:

- at least two concrete mobile workflows need the shared job semantics, or job history/scheduling is
  itself a committed product requirement;
- the product accepts best-effort local scheduling and labels it accurately;
- every first-wave handler has an explicit destination, idempotency/recovery policy, and execution
  policy;
- a physical iPhone and Android device prove no double claims, correct expiration recovery, and
  acceptable power behavior;
- PR #473's Debug-vs-production mismatch is resolved;
- silent-audio use receives an App Review/policy decision, or production uses a sanctioned continued
  processing mechanism instead;
- reliable unattended agent automation has a server-side owner.

## Source Notes

This assessment uses repository source code and first-party platform documentation. It does not
claim physical-device validation. The desktop and PR line counts were measured from the revisions
listed at the top of this document; generated lockfiles and business handler implementations were
excluded from the desktop core count.

A targeted desktop verification run executed 12 core/scheduler/repository/hook test files. Five
files and 40 tests passed. Seven database-backed files failed during setup and 131 tests did not run
because the installed `better-sqlite3` binary targeted a different Node ABI than the available Node
25.9 runtime; the desktop repository requires Node `>=24.11.1 <24.16.0`. No native rebuild was
attempted, so this assessment does not claim a fresh green run for the DB-backed desktop suites.

- [Desktop Job Manager overview](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/docs/references/job-and-scheduler/overview.md)
- [Desktop Job Manager implementation](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/src/main/core/job/JobManager.ts)
- [Desktop job schema](https://github.com/CherryHQ/cherry-studio/blob/d498753ecfd0f2572612456281ec222563ce7bf3/src/main/data/db/schemas/job.ts)
- [Mobile architecture overview](./architecture-overview.md)
- [Mobile runtime ownership](./runtime-ownership.md)
- [Mobile `DbService`](../../src/backend/data/db/DbService.ts)
- [PR #473](https://github.com/CherryHQ/cherry-studio-app/pull/473)
- [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Expo TaskManager](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [Apple BGContinuedProcessingTask](https://developer.apple.com/documentation/backgroundtasks/bgcontinuedprocessingtask)
- [Apple long-running task guidance](https://developer.apple.com/documentation/backgroundtasks/performing-long-running-tasks-on-ios-and-ipados)
- [Apple Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#multitasking)
- [Android WorkManager periodic work](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work#schedule_periodic_work)
- [Android long-running workers](https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running)
