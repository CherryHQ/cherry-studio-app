# System Integration

This local Expo module owns Cherry Mobile's native share boundary and platform execution/settings bridge. Frontend code uses
`Backend.systemEntry`; it never imports this module directly. See the
[architecture and behavior contract](../../docs/references/system-integration-design.md).

## Native targets

- Android: `ShareReceiverActivity` receives text, links, images, and files.
- iOS: `CherryShareExtension` supports iOS 17 and stages shares in the app group.

`scripts/withSystemIntegration.js` configures the iOS share extension, its resources, and its
App Group entitlement. The Android activity is registered by the local Expo module. These
native changes require a new custom development client; an OTA update or Expo Go cannot add them.

## Share storage and lifecycle

Staged shares may be kept for 24 hours. Limits are 131,072 UTF-16 text units, 10 attachments,
25 MiB per attachment, and 50 MiB total. Files are copied while source access is valid; links are
not fetched. Native stores keep files in private staging directories, and `entrySchema.ts`
validates every versioned envelope again before the backend accepts it.

Claiming a share imports its attachments into the file library and then releases native staging,
so an attachment belongs to the library exactly as a picked one does. An interrupted import leaves
the share staged for a later claim, which re-imports every attachment. Route parameters contain
only in-memory handoff handles; shared text and file paths never enter URLs or saved navigation
state.

iOS uses `group.<bundle-id>.system-integration`. Shared files use complete file protection and are
excluded from backup. Android uses `noBackupFilesDir`.

## Acceptance

Before release, authorize and perform native builds and device checks for cold and warm share
delivery, attachment limits, expiry cleanup, App Group provisioning, Agent switching with a seeded
draft, and sending. Run the focused system-entry and native-envelope suites when verification is
authorized.

## iOS execution protection

`beginBackgroundExecution` and `endBackgroundExecution` own one finite UIKit background assertion.
Only the backend iOS execution source consumes them. It shares one 60-second idle grace across
released or waiting consumers, cancelled by new work; idle expiry does not cancel pending decisions.
Active model/tool requests never become idle from lack of output. Expiration ends the native assertion
even if JavaScript cannot run, emits its owner ID, and prevents renewal until foreground return.

`beginContinuedProcessingTask` prefers iOS 26+ `BGContinuedProcessingTask` for explicit foreground
user work. A unique concrete registration under the app variant's permitted wildcard identifies
each attempt. iOS 27 uses the asynchronous submission API off the main thread; iOS 26 uses its
original submission API. Submission is not execution proof: native state events confirm launch,
failure, or expiration. A five-second admission deadline cancels a missing launch and enables
fallback; late handlers complete unsuccessfully without taking over a replacement. Updates carry
localized titles and real progress. A stable execution lease may outlive its native request: waiting
ends official processing, while finite/audio protection follows the shared idle grace. An explicit
foreground continuation can request another native task on that same lease. Completion, cancellation,
and module disposal release requests.
Expiration includes system-UI cancellation and must stop the owning task, even in foreground.

Only when continued processing is unavailable, explicit device-local consent permits a silent `AVAudioEngine` loop through
`beginBackgroundAudioExecution` / `endBackgroundAudioExecution`. The iOS app declares the audio
and processing background modes directly; Android's Expo audio service configuration stays unchanged.
Pending/active continued tasks suppress the silent loop. Native execution or audio state can protect
work after the finite window expires. Failure to submit can use audio; revocation of a running
continued task interrupts its owner and fences audio until cancellation settles and the owner releases.
It never switches that task to audio. Audio loss falls back
to remaining UIKit time; exhausted protection interrupts consumers.

Voice declares token-owned speech/capture uses through `beginBackgroundAudioUse` /
`endBackgroundAudioUse`. Capture suspends the silent engine until native voice cleanup settles;
speech keeps the loop beneath it to cover gaps between utterances without changing the speech
profile. The loop cannot overwrite a recording or real speech session. Capture does not count as background
protection. Native interruption, route reconfiguration, media reset, task release and module disposal
own recovery and cleanup. None of these mechanisms promises survival of suspension or process death.
These changes require a rebuilt development client; source checks do not establish native behavior.

Apple references: [long-running tasks](https://developer.apple.com/documentation/backgroundtasks/performing-long-running-tasks-on-ios-and-ipados),
[asynchronous submission](https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler/submittaskrequest(_:completionhandler:)).
