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
- Returning to the foreground ends the surface immediately. The session, its content, and its
  keep-alive lease are untouched — a surface is disposable, a session is not — and leaving again
  recreates it from the latest content.
- A refused creation is not retried inside the same window; the next window tries again.

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
on leaving and disappearing on return; rapid switch-away-and-back; completion while locked; opening
the app without entering the conversation (card stays) versus opening the conversation (card goes);
a multi-turn conversation never stacking cards; expiry after the linger window; cards retired after
the process is killed; concurrent chat and painting each showing one.

Two behaviors cannot be established by source review and must be confirmed on a device or
simulator:

1. Whether ActivityKit accepts `Activity.request` during the resign-active transition. If it does
   not, no Live Activity is created at all; the fallback is to create at turn start with a short
   delay, which reinstates a foreground card for long replies.
2. Whether ending an already-ended activity retires it early. If it does not, a seen result waits
   out its dismissal date.

Painting uses the same presenter contract and therefore the same window: its progress card also
only exists while the app is hidden.
