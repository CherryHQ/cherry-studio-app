# Android Background Generation

Android continues user-started chat and image generation with
[`react-native-background-actions`](https://github.com/Rapsssito/react-native-background-actions)
and reuses per-destination numeric notification identities through SystemIntegration.
[`expo-notifications`](https://docs.expo.dev/versions/latest/sdk/notifications/) retains permission
and legacy-notification handling.
The app owns task counting, content, cancellation, and route selection. A scoped
[`react-native-background-actions` patch](../../patches/react-native-background-actions@4.1.0.patch)
adds native admission, identity reuse, and protection reporting to the library's existing service. The library still owns Headless
JS and wake locks; the app adds no service or notification receiver. An
[`expo-notifications` patch](../../patches/expo-notifications@57.0.17.patch) exposes Android's
post-presentation event so a focused task screen can dismiss asynchronously delivered notifications.

## Ownership And Behavior

`KeepAliveCoordinator` selects `AndroidBackgroundActivityRuntime`. Local chat and painting acquire
leases through this facade. Conversation protection is unconditional during preparation, execution,
questions/approvals, persistence, and final delivery. Foreground and background work share one
`dataSync` foreground service; the last released lease stops it. Notification preferences and
permission do not govern execution demand.

`react-native-background-actions` owns Headless JS and its partial wake lock. Its native patch
admits a service while visible, retains foreground status across visibility transitions, and
reports actual protection and unexpected destruction with the admitted generation identity.
Content updates run on the existing service's main thread, preserve that identity, and cannot
revive a stopped task or start another Headless JS task. Expected stops and stale generations do
not interrupt successors. `START_NOT_STICKY` prevents replay after process death.

Each destination has a persistent numeric notification ID supplied by SystemIntegration. The
same ID is used for ongoing content, approval, and a terminal result. One active destination
anchors the service's required notification; the remaining destinations retain separate cards.
Finishing an anchor moves service identity to a survivor without restarting execution. Moving a
finished result requires leaving foreground first, which Android 12+ does not allow a hidden app
to re-enter, so while hidden the result keeps anchoring the service until foreground entry or
teardown. With no survivor, terminal teardown detaches the result instead of deleting it.
Preparation without a known destination temporarily uses the service's generic notification. The
service and SystemIntegration name their shared channel with the same localized label, never with
task content.

SystemIntegration builds notifications with the same IDs because Expo's scheduled-notification
identifiers do not expose the service's numeric Android identity. This is a notification bridge,
not another service or execution owner. Progress is silent. Background approval and failure alert
once per phase; completion alerts honor their preference and event-time visibility. Foreground
attention uses the existing toast event when the task is not visible. Metadata changes update
content without repeating an alert. Delivery failure logs once and does not retain the lease.

The focused foreground destination retires terminal results, including those left by a previous
process. It leaves ongoing cards intact. A drawer-covered screen and other conversations do not
acknowledge them. A new round replaces the predecessor's card; delayed old handles cannot dismiss
or overwrite the new card. The shared surface rules live in
[Background Activity Presentation](./background-activity-presentation.md).

Desktop Agent execution uses the same phone-side presentation and protection ports. An unfinished
observation holds desktop connection demand after its screen unmounts and while the app is hidden.
Uncertain commands hand protection to session observation when their existing receipt recovery
confirms admission. Revocation of phone protection retires the phone surface without sending a
cancel or reissuing the desktop's paid request. Desktop checkpoints remain execution authority.
If the desktop stays unreachable for one minute while the app is hidden, the connection manager
ends that background demand and stops reconnecting; the phone releases protection and retires its
surface the same way. Foreground entry reconnects and resumes observation.

Protection is best effort when service admission fails or is attempted while hidden. Work continues
and foreground entry retries protection. A real service revocation interrupts local domain work:
chat retains partial content and persists `INTERRUPTED`; painting persists `JOB_INTERRUPTED` without
an automatic retry. Serial painting jobs retain their dispatcher lease across successor handoff.
Cold startup clears orphaned ongoing cards and reconciles interrupted work without replaying it.

The public execution status distinguishes starting, active (native foreground proof), limited,
interrupted, and idle. It is independent of notification permission and power settings. The
settings screen reports battery-optimization exemption and power-saving status, links to system
settings, and explains manufacturer-specific autostart/background/recent-app-lock requirements.
First-use guidance is remembered; vendor settings are not represented as automatically verified.

## Shared Lifecycle

Both presenters retain an existing execution lease through final delivery. iOS creates its Live
Activity during foreground preparation and retains it across visibility changes; the current audio
strategy is reported as limited. The iOS background-actions module remains excluded from autolinking.
Notification permission and presentation preferences never authorize or cancel model work.

`RemoteAgentRuntime` declares its reply runtime dependency, allowing the lifecycle graph to bring
protection into the startup gate before a desktop route can recover active execution. Reverse
teardown drains remote and local consumers before their protection owners.

## Android Limits

The service uses `dataSync` for active request/response transfer, image transfer, and related local
result processing. This maps the feature to Android's documented fetching/cloud-transfer category;
Google Play review still determines whether a distribution is accepted. See
[foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types#data-sync).

A new service starts only while the application is visible. Native foreground admission occurs
immediately and remains active across AndroidX `ProcessLifecycleOwner` visibility changes. Native
content updates use the existing instance, retain notification IDs, and never restart execution.

There are no timer-triggered background restarts, direct battery-exemption requests, boot restarts,
exact alarms, full-screen intents, or promoted Live Updates. Android's ongoing notifications may be
dismissed or hidden by system policy; the service is not a guarantee against force-stop or vendor
process termination. Settings guidance asks the user to adjust restrictions explicitly.

Android 15+ limits `dataSync` background execution to six hours; bringing the app to the foreground
resets its budget. The adapter interrupts work one minute before that boundary, drains normal
cancellation for at most 30 seconds, and stops the library service. More background jobs are
interrupted until the app returns to the foreground. This timer is an application cutoff. If
native `onTimeout` or the system stops the service first, the patched destruction event interrupts current work while JavaScript
remains alive. A refused foreground promotion does not stop it: the service logs it and stays a
started service, so a short task can still finish; Android stops that service once the application
is idle in the background, and only that destruction interrupts the work. Neither path restarts
paid requests. Whole-process termination still requires reconciliation at the next process start.
See [Android service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout).

The notification permission is requested in context after a task's service admission attempt, even
if admission failed. If the app leaves before the prompt, returning while the service runs requests
it. A native request error permits a later attempt; a user's denial does not cause repeated prompts
within the runtime. Denial does not prevent the foreground service, but Android hides its notification
from the ordinary drawer.
See [notification permission behavior](https://developer.android.com/develop/ui/compose/notifications/notification-permission).

The app declares `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `WAKE_LOCK`, and
`POST_NOTIFICATIONS`. [The Expo config plugin](../../scripts/withAndroidBackgroundGeneration.js)
only declares the existing library service as `dataSync`; Expo Notifications supplies the icon.
The native patch explicitly depends on the same AndroidX lifecycle-process version as Expo
Notifications, rather than relying on that dependency being transitively available.
Unused boot-receiver permission is blocked. Before Play distribution, complete its
[foreground-service declaration](https://support.google.com/googleplay/android-developer/answer/13392821).

## Why This Combination

Assessment date: 2026-10-01. The priority is a small application adapter over maintained open-source
execution and Expo capabilities, with no application-owned Java/Kotlin service lifecycle.
Expo Notifications is pinned to `57.0.17`, within the `~57.0.17` range recommended by Expo 57.0.21's
`bundledNativeModules.json` and matching the version-specific native patch.

| Option | Decision |
| --- | --- |
| `react-native-background-actions` + SystemIntegration + Expo notifications | Selected. Background actions owns the service and wake lock; SystemIntegration shares notification IDs with it; Expo retains permission and legacy response handling. |
| `react-native-notify-kit` alone | Rejected for this integration. Its foreground-service Headless JS path does not hold a task-lifetime wake lock. Our prior approach also required three native corrections and a private timeout event mapping; all are removed. |
| `expo-notifications` alone | Does not provide a long-running foreground execution service. |
| `expo-background-task` / WorkManager | Useful for deferrable persistent work; does not directly preserve the in-progress interactive JS stream. |
| Custom native execution service | Not selected. Notification bridging does not require a second service or app-owned wake-lock lifecycle. |
| `expo-keep-awake` | Prevents screen sleep; it is not a background CPU wake-lock mechanism. |

The app still needs its own domain cancellation and concurrent-task counting. Those are business
rules, not capabilities an execution or notification library can infer. The Android background
cutoff remains explicit; Android destruction uses the patched `stopped` event, separately from the
library's iOS-only `expiration` event.

## Verification And Development Client

These native dependencies, both patches, and config plugins require a rebuilt development client. Metro reloads
and EAS Updates cannot add native modules. Use [Local EAS Builds](../guides/local-builds.md) when a
build is authorized. Compatibility with Cherry's Expo 57 / React Native 0.86 and device behavior
must be verified in that client; source review and lint do not establish runtime compatibility.

`package.json` opts `expo-notifications` into `expo.autolinking.android.buildFromSource`. Expo's
bundled precompiled AAR does not contain our native presentation event; patching its Kotlin sources
alone leaves that event absent from the installed app. Keep this opt-out while the native patch is
required, and inspect the rebuilt APK as well as the installed source guards.

Regression suites describe concurrent leases, foreground-only admission, permission denial,
background-budget reset/cancellation, approval cleanup, single completion delivery, and awaiting
painting notification delivery before task completion. Additional cases cover foreground event
delivery races, post-presentation task cleanup, cold-start navigation, task-versus-draft route
identity, and legacy task URLs. Library lifecycle coverage exercises stopped-event ordering and
stale generation rejection, unprotected continuation after failed or hidden admission,
interruption persistence, and notification submission without retries or presentation waits. Installed-source guards protect both native patches against dependency upgrades; they do not prove
Android runtime behavior. Device acceptance should cover foreground/background service transitions,
notification-shade interaction, rapid return and exit, screen lock, concurrent chat/painting, denied
notification permission, completion/approval taps from a cold app, and system termination without
replaying paid requests. Follow
[Testing And CI](../guides/testing-and-ci.md) and the active task's authorization before running checks.
