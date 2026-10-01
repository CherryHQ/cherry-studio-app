# Background Activity Presentation

The shared activity manager owns task surfaces and their retirement. Execution demand stays with
`KeepAliveCoordinator`; presentation preferences, notification permission, and app visibility never
release an unfinished conversation's execution lease. “Conversation” here means an admitted round,
including preparation, tool use, awaiting user input/approval, persistence, and final delivery.
Stored history and an idle chat page do not keep execution alive.

## One Destination, One Surface

A local conversation is identified by its session URL; a desktop conversation includes both the
connection and session IDs. Painting keeps its existing task URL. The URL contract lives in
[`taskLink.ts`](../../src/shared/backgroundActivity/taskLink.ts).

Each destination owns one logical slot. A new round takes over its predecessor; approval and
terminal content update that slot. Concurrent destinations may each show one card. Navigation to
an ongoing task does not dismiss its execution notification or cancel its work.

| Presenter requirement | iOS Live Activity | Android notification |
| --- | --- | --- |
| `presentWhile` | `always` | `always` |
| `requiresForegroundStart` | `true` | `false` for the surface; service admission still requires foreground |
| `requiresPredecessorRetirement` | `true`: await deletion of the ended native identity before a new card | Not required: numeric identity is reused |
| `shouldHoldLeaseUntilDelivery` | `true` | `true` |

A Live Activity is created when foreground preparation starts and retained across app visibility
changes. If work is first observed while hidden, its card waits for foreground admission. The
manager checks native identity before updates and retirement: a card removed by the person or the
system stays dismissed for that round. Removal does not cancel execution. ActivityKit remains a
presentation mechanism, not an execution guarantee.

The iOS **Live Activities** preference controls chat and painting cards only. Turning it off
retires presentation without releasing execution. The persisted `chat.background_reply.enabled`
key is retained for compatibility. Android's mandatory service notification remains independent of
that preference. Completion preferences control alerts; they do not turn protection off.

## Execution And Attention

Preparation hands its lease to the round before releasing it. Awaiting a question or approval keeps
that lease. Terminal content appears immediately, while bounded final metadata work and notification
delivery retain protection. The lease releases after delivery settles, including delivery failure.

Android uses persistent numeric notification IDs shared between its existing foreground service
and the SystemIntegration notification bridge. One conversation anchors the service notification;
other conversations have their own cards. The anchor moves without restarting execution. See
[Android Background Generation](./android-background-generation.md).

iOS completion delivery checks permission and current generation, retires its settled Live Activity,
then posts a deterministic completion notice for that destination. This replacement retains a short
delivery lease. A superseded round cannot retire or post over its successor.

## Settled Surfaces

Cancellation retires a card immediately. A completed or failed card remains available until the
person opens its destination or a new round replaces it. A destination already visible when the
round settles retires its result immediately. Merely opening the app does not acknowledge other
conversations. Drawer-covered screens do not acknowledge results.

Settled Live Activities have a 30-minute dismissal date. The shared manager retains their handles
for the same window. Android terminal notices remain dismissable by persistent destination identity
across process restarts. Cold startup clears orphaned ongoing surfaces without replaying paid work.
An ended Live Activity cannot be enumerated after restart; its dismissal date retires it.

## Privacy And Payloads

Reply previews, titles, assistant attribution, and painting prompts use SwiftUI `privacySensitive`.
Android notifications use private lock-screen visibility. Actual redaction follows system settings.

The Live Activity presenter bounds every start, update, and end to 3 KB of measured UTF-8 content,
reserving 1 KB of ActivityKit's 4 KB allowance for native encoding. Text is shortened at Unicode
code-point boundaries. Identifiers and state are not truncated; invalid final metadata still ends
the card. This does not change stored task content.

## Capability And Settings

The frontend consumes the coordinator's public execution status rather than inferring protection
from a visible card. Android reports active only after native foreground-service proof. Denied
admission is limited; revocation is interrupted. iOS's current audio strategy reports limited.
An interrupted iOS player that throws on resume is removed, including its listener, and rebuilt
with the same capped exponential retry used for admission. The last lease release cancels that
retry; callbacks from a removed player cannot resume a replacement. Recovering audio never
resubmits the model request. The audio API exposes no execution-expiration callback, so a held
lease and successful playback still cannot establish an OS guarantee.
System low-power, battery-optimization, Live Activity, and notification settings are separate facts.
Manufacturer-specific autostart/background restrictions require manual confirmation.

iOS 26 continued-processing tasks are not integrated in this change. Their progress, expiration,
and system-owned presentation require native feasibility acceptance before replacing the audio
strategy. Neither current platform mechanism promises survival of force-stop or process death.

## Acceptance

When device verification is authorized, cover foreground admission and continued background/locked
execution; immediate lock after send; questions and approvals; concurrent conversations; one slot
across repeated rounds; completion while hidden versus already visible; notification permission
denial; disabled presentation; user-dismissed cards; process restart; power restrictions; and long
multilingual payloads. Native acceptance must also confirm retirement of an ended Live Activity before its replacement,
including completion-notice handoff. Native delivery and OS behavior require a rebuilt client; lint
and source guards are insufficient.
