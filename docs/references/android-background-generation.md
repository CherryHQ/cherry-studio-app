# Android Background Generation

Android continues user-started chat and image generation with
[`react-native-background-actions`](https://github.com/Rapsssito/react-native-background-actions)
and delivers local completion/approval notifications with
[`expo-notifications`](https://docs.expo.dev/versions/latest/sdk/notifications/).
The app owns task counting, content, cancellation, and route selection. A scoped
[`react-native-background-actions` patch](../../patches/react-native-background-actions@4.1.0.patch)
adds native visibility handling to the library's existing service. The library still owns Headless
JS and wake locks; the app adds no service or notification receiver.

## Ownership And Behavior

- `KeepAliveCoordinator` selects `AndroidBackgroundActivityRuntime` as its lease source on Android.
  Chat and painting keep acquiring leases through the coordinator and never branch on platform.
  Concurrent chat and painting work share one execution service. It becomes a `dataSync` foreground
  service only while the application is not visible. The last lease stops it.
- `react-native-background-actions` uses React Native's `HeadlessJsTaskService`, which owns the
  Headless JS task and a partial wake lock. The lock supports CPU execution with the screen off;
  it does not bypass Android Doze, vendor power management, process death, or user force-stop.
- The library's ongoing notification is silent and shows task progress only outside the app. A
  single task opens its task surface via `linkingURI`; an aggregate restores the app rather than
  selecting an arbitrary task. Stopping a task uses its existing in-app control; Android also exposes its system
  foreground-service stop control. There is no custom notification stop receiver.
- Chat and painting share the existing presenter contract. Completion, failure, and pending tool
  approval produce Expo local notifications in the background. Approval requires opening the app;
  there is no notification action that approves a tool.
- Foreground completion stays silent. Failure and approval use an injected presentation event;
  App Shell shows a toast only when the corresponding task is not already visible. Neither path
  schedules a foreground system notification. Delivery rechecks app state and preserves the state
  at the event boundary, so queued foreground completion cannot become a background alert.
- A focused foreground chat or painting surface dismisses that task's presented notifications,
  including deliveries racing foreground entry. Chat behind the drawer, unloaded surfaces, other
  tasks, and unrelated notifications remain unacknowledged. In-flight reads are invalidated on blur.
- `BackgroundActivitySession.finish()` resolves after queued platform delivery. Painting awaits
  it before returning to `JobRuntime`, so execution protection includes the final notification.
- Job execution retains its lease while the dispatcher claims queued successors, including after
  forced cancellation. Serial painting requests therefore hand execution protection to the next
  task without stopping and trying to restart the service in the background.
- Platform interruption aborts domain work before asynchronous cancellation writes. Chat waits for
  its current turn's persistence to finish; completed old updates and budget cancellation cannot
  release execution protection owned by newer work.
- Each chat turn sends at most one terminal notification. Late title projection does not repost a
  notice the user has dismissed. Foreground completion stays silent even if the app backgrounds
  while its title is still being generated.
- Expo retains cold notification responses. App Shell uses `useLastNotificationResponse`, waits for
  navigation to mount, consumes each response, and navigates only when its task is not already
  visible. Opened notifications are dismissed. The task URL contract
  lives in [`taskLink.ts`](../../src/shared/backgroundActivity/taskLink.ts): the backend builds
  every task URL with it and App Shell maps its parsed links to routes. Chat links use session
  identity; painting links open the composer/task page, which can show generating, failed, and
  completed results without a selected image. Old chat links with `agentId` and old painting paths
  remain readable. The image viewer redirects old task links lacking `fileEntryId` to the task page.
  The painting task route uses `paintingId` as its navigation identity, so opening another task
  cannot reuse an unrelated composer's mounted draft or generation state.
  No backend navigation callback or custom pending-link registry is needed.
- iOS keeps its existing audio/Live Activity implementation. Shared session completion and job
  handoff changes apply to both platforms. The background-actions native module is
  excluded from iOS autolinking. Expo Notifications is installed through its standard Expo plugin;
  this integration only sends Android local notifications and does not register for push tokens.

## Shared iOS And Android Lifecycle

Business services use the same session and execution-lease contracts on both platforms. Each
[presenter](../../src/backend/services/backgroundActivity/presenter.ts) declares two requirements;
the shared manager orders updates, completion, and lease release without platform-specific
decisions in those paths.

| Presenter requirement | iOS Live Activity | Android notification |
| --- | --- | --- |
| `canStartInBackground` | `false`: defer creation until foreground | `true`: represent a task already admitted by the execution runtime |
| `shouldHoldLeaseUntilDelivery` | `false`: preserve immediate audio-lease release | `true`: retain an existing session lease until its latest update or end settles |

Creating an Android surface does not authorize starting a foreground service from the background;
the Android execution runtime still owns that restriction. A session never acquires an extra lease
solely for presentation. Callers that own execution, such as painting jobs, await `finish()` before
releasing their own lease on both platforms. `finish()` waits for the queued delivery attempt;
presenter failures are logged and cannot retain the lease indefinitely. Manager shutdown releases
all leases and ends its remaining surfaces.

The manager's lifecycle suite covers both iOS and Android environments using presenter requirements
independently of the OS. It describes foreground admission, approval and cancellation delivery,
stale updates, repeated completion, and caller-owned execution. This shared contract coverage does
not replace native device acceptance or change the existing iOS audio strategy.

## Android Limits

The service uses `dataSync` for active request/response transfer, image transfer, and related local
result processing. This maps the feature to Android's documented fetching/cloud-transfer category;
Google Play review still determines whether a distribution is accepted. See
[foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types#data-sync).

A new service starts only while the application is visible, using `startService` without a
notification. The native service observes AndroidX `ProcessLifecycleOwner`: `ON_STOP` promotes the
existing service using Android's visible-to-background exemption; `ON_START` removes foreground
status and its notification. Both transitions retain the same Headless JS task and business
requests. Process visibility also avoids treating notification-shade focus changes or activity
recreation as a request to restart execution.

Content updates go through the service's visibility gate; a delayed JavaScript update cannot repost
the ongoing notification over a foreground screen. Update intents never start another Headless JS
task, and a late update to a stopped service ends without reviving work. The service returns
`START_NOT_STICKY` to prevent replay after process death. The patch also scopes ongoing notification
intents to this package and reuses the existing Activity when tapped.

There are no timer-triggered background restarts, battery exemptions, silent media
playback, boot restarts, exact alarms, full-screen intents, or promoted Live Updates.

Android 15+ limits `dataSync` background execution to six hours; bringing the app to the foreground
resets its budget. The adapter interrupts work one minute before that boundary, drains normal
cancellation, and stops the library service. More background jobs are interrupted until the app
returns to the foreground. This timer is an application cutoff, not an observation of native service
state: background-actions does not expose Android's `onTimeout` as a JavaScript event. Its native
`onTimeout` stops the service if the system reaches its limit first. No library API promises recovery
from arbitrary earlier system termination; interrupted work is reconciled at the next process start.
See [Android service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout).

The notification permission is requested in context after a task's service starts. Denial does not
prevent the foreground service, but Android hides its notification from the ordinary drawer.
See [notification permission behavior](https://developer.android.com/develop/ui/compose/notifications/notification-permission).

The app declares `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `WAKE_LOCK`, and
`POST_NOTIFICATIONS`. [The Expo config plugin](../../scripts/withAndroidBackgroundGeneration.js)
only declares the existing library service as `dataSync`; Expo Notifications supplies the icon.
The native patch explicitly depends on the same AndroidX lifecycle-process version as Expo
Notifications, rather than relying on that dependency being transitively available.
Unused boot-receiver permission is blocked. Before Play distribution, complete its
[foreground-service declaration](https://support.google.com/googleplay/android-developer/answer/13392821).

## Why This Combination

Assessment date: 2026-09-10. The priority is a small application adapter over maintained open-source
execution and Expo capabilities, with no application-owned Java/Kotlin service lifecycle.
Expo Notifications is pinned to `57.0.5`, the version range recommended by the current Expo SDK's
`bundledNativeModules.json`, keeping existing Expo module resolutions unchanged.

| Option | Decision |
| --- | --- |
| `react-native-background-actions` + `expo-notifications` | Selected. Standard RN background execution owns the wake lock; Expo owns local alerts, permission requests, and notification responses. A scoped native patch separates service execution from foreground-notification visibility. |
| `react-native-notify-kit` alone | Rejected for this integration. Its foreground-service Headless JS path does not hold a task-lifetime wake lock. Our prior approach also required three native corrections and a private timeout event mapping; all are removed. |
| `expo-notifications` alone | Does not provide a long-running foreground execution service. |
| `expo-background-task` / WorkManager | Useful for deferrable persistent work; does not directly preserve the in-progress interactive JS stream. |
| Custom native service / Expo module | Would make the app own native lifecycle, wake locks, bridge compatibility, and notification delivery. Not needed for the selected scope. |
| `expo-keep-awake` | Prevents screen sleep; it is not a background CPU wake-lock mechanism. |

The app still needs its own domain cancellation and concurrent-task counting. Those are business
rules, not capabilities an execution or notification library can infer. The Android background
cutoff is deliberately explicit rather than pretending the library's iOS-only `expiration` event
also observes Android service termination.

## Verification And Development Client

These native dependencies, the visibility patch, and config plugins require a rebuilt development client. Metro reloads
and EAS Updates cannot add native modules. Use [Local EAS Builds](../guides/local-builds.md) when a
build is authorized. Compatibility with Cherry's Expo 57 / React Native 0.86 and device behavior
must be verified in that client; source review and lint do not establish runtime compatibility.

Regression suites describe concurrent leases, foreground-only admission, permission denial,
background-budget reset/cancellation, approval cleanup, single completion delivery, and awaiting
painting notification delivery before task completion. Additional cases cover foreground event
delivery races, task-scoped notification cleanup, cold-start navigation, and legacy task URLs. An
installed-source guard protects the native patch against dependency upgrades; it does not prove
Android runtime behavior. Device acceptance should cover foreground/background service transitions,
notification-shade interaction, rapid return and exit, screen lock, concurrent chat/painting, denied
notification permission, completion/approval taps from a cold app, and system termination without
replaying paid requests. Follow
[Testing And CI](../guides/testing-and-ci.md) and the active task's authorization before running checks.
