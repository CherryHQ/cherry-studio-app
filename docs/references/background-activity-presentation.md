# Background Activity Presentation

This reference owns when a background surface — an iOS Live Activity or an Android notification —
exists, what retires it, and how many a destination may show. Android's execution service,
notification delivery, and permission rules stay in
[Android Background Generation](./android-background-generation.md).

## The Rule

A background surface speaks for work the user cannot currently watch. It exists only inside the
window its presenter declares, one destination shows at most one surface, and a settled surface
disappears as soon as the user has seen its result.

## Presentation Windows

Each [presenter](../../src/backend/services/backgroundActivity/presenter.ts) declares the window in
which its surface may exist. The shared manager owns the resulting transitions; no feature service
branches on the platform.

| Presenter requirement | iOS Live Activity | Android notification |
| --- | --- | --- |
| `presentWhile` | `app-hidden` | `always` |
| `shouldHoldLeaseUntilDelivery` | `false`: preserve immediate audio-lease release | `true`: retain an existing session lease until notification submission settles |

`app-hidden` means:

- Nothing is created while the app is in the foreground, however long the turn runs.
- The surface is created as the app resigns active. ActivityKit refuses to create a Live Activity
  from the background, so this transition is the only moment the request can succeed; a session
  that starts while the app is already hidden waits for the next one.
- Resigning active is also what the system reports for Control Center, the notification shade, a
  call banner, a system alert, and the app switcher. A surface created for one of those appears
  briefly and is retired on return. Creation cannot be deferred past it: a delay only moves the
  request into the background, where it is refused.
- Returning to the foreground ends the surface immediately. The session, its content, and its
  keep-alive lease are untouched — a surface is disposable, a session is not — and leaving again
  recreates it from the latest content, unless the user or system already removed it.
- A refused creation is not retried inside the same window; the next window tries again.

Before updating, ending, or retiring a running Live Activity, the presenter checks whether its
native identifier is still active or stale. A removed surface becomes dismissed for the rest of
that task: returning and leaving cannot recreate it. This does not cancel the task or release its
execution lease. A new task at the same destination can create its own activity.

The iOS **Live Activities** setting gates both chat and painting presentation. Disabling it retires
running cards and dismisses retained results tracked by this process; tasks cannot create cards
while the setting is disabled.
Bootstrap supplies this presentation policy separately from the execution policy. The stored
`chat.background_reply.enabled` key is retained for existing preferences; Android still uses it for
background replies and keeps its mandatory foreground-service notification.

## Privacy And Payloads

Reply previews, conversation titles, assistant attribution, and painting prompts are marked with
SwiftUI's `privacySensitive` modifier. Their content remains available for previews, while the
system redacts those views according to the person's Lock Screen privacy settings. Task status and
elapsed time stay unmarked. This does not force redaction when the person allows sensitive content.

The Live Activity presenter bounds content before every start, update, and end. It measures UTF-8
bytes including the deep link, expo-widgets' nested JSON encoding, and possible slash escaping.
The measured payload is capped at 3 KB, reserving 1 KB of ActivityKit's 4 KB allowance for the native
name and encoding overhead. Long previews, attribution, titles, and labels are shortened at Unicode
code-point boundaries without changing the stored task content. Identifiers and state are never
truncated; invalid fixed metadata is rejected, and an invalid final payload still ends the card.

## Opening A Surface Early Enough

A session that does not exist yet cannot be given a surface, and the only moment a Live Activity can
be requested is the one the user creates by leaving. Chat therefore opens its Session's surface when
submission preparation starts — the same point that already takes a keep-alive lease — rather than
when the turn is reserved. Sending a message and immediately locking the phone would otherwise fall
between the two: the durable writes of preparation are enough to miss the window, and the next one
only comes when the user opens the app and leaves again. The turn inherits the prepared surface and
replaces its placeholder labels; preparation that never reaches a turn takes its surface with it.

`always` represents a task the execution runtime already admitted, whether or not the user can see
the app. Creating a surface still does not authorize starting Android's foreground service from the
background; the execution runtime owns that restriction.

## Settled Surfaces

`finish()` ends a surface under the platform's own retirement rules rather than deleting it: the
result is what the user came back for. The Live Activity presenter ends with a dismissal date
`BACKGROUND_ACTIVITY_LINGER_MS` (30 minutes) out instead of ActivityKit's `default` policy, which
would hold a settled reply on the Lock Screen for up to four hours. The platform therefore retires
every settled surface on its own, including after process death, and a settled Live Activity leaves
the Dynamic Island while remaining a Lock Screen to-do.

The manager keeps a settled surface dismissable for the same window and retires it early when:

- **The user opens its destination.** App Shell reports the focused, foreground task surface; its
  deep link is the identity both layers already share. Returning to the app is not enough — the
  conversation the user actually opens is.
- **A new session takes over the same destination.** A conversation's next turn replaces its
  predecessor's card instead of stacking a second one.
- **The Session is deleted.** Chat dismisses the destination even when no turn record remains.

Both platforms follow these rules. On Android they mostly restate what App Shell's read receipt
already did, with one added effect: a new turn now clears its predecessor's terminal notification
instead of leaving it for the read receipt.

Cancellation leaves nothing behind, and an orphan sweep at cold start ends surfaces a dead process
left active. `expo-widgets` only enumerates active and stale activities, so a settled Live Activity
can no longer be found after a restart — its dismissal date is what retires it.

## Why Not Per-Turn Cards

One Live Activity per turn is what the user sees as notification spam: every reply added a Lock
Screen entry that outlived the conversation. The window rule removes the foreground ones entirely
and makes at most one card per conversation structural — a new turn can only start while the app is
visible, which is exactly when the previous card has already been retired.

## Verification

Device acceptance covers: no Dynamic Island card while chatting in the foreground; a card appearing
on leaving and disappearing on return; sending a message and locking the phone immediately; how
visible a card created for Control Center or the app switcher is; completion while locked; opening
the app without entering the conversation (card stays) versus opening the conversation (card goes);
a multi-turn conversation never stacking cards; expiry after the linger window; cards retired after
the process is killed; concurrent chat and painting each showing one; a dismissed running card
staying dismissed after returning and leaving; disabling Live Activities clearing chat and painting
cards; system privacy redaction covering titles and previews while leaving status readable; and
long multilingual prompts staying within the native payload limit.

Two behaviors cannot be established by source review and must be confirmed on a device or
simulator:

1. Whether ActivityKit accepts `Activity.request` during the resign-active transition. If it does
   not, no Live Activity is created at all; the fallback is to create at turn start with a short
   delay, which reinstates a foreground card for long replies.
2. Whether ending an already-ended activity retires it early. If it does not, a seen result waits
   out its dismissal date.

Painting uses the same presenter contract and therefore the same window: its progress card also
only exists while the app is hidden.
