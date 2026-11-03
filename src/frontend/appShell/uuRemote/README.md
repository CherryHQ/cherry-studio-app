# UU Remote Desktop

The sidebar's device menu exposes Remote desktop immediately above Manage devices when a remote
computer is selected. It uses the existing plain menu rows without group separators or a header
icon. `useUuRemoteAction` reuses the installation guidance and association flow: first use lets the
user choose the corresponding Windows/macOS computer in UU Remote, then opens its desktop in
picture in picture. Subsequent presses open PiP directly. Device details retain reassociation when
the user chose the wrong computer or changed UU accounts. The association row shows the saved
binding's short fingerprint, or an unlinked state. UU does not return a device name; the fingerprint
only distinguishes saved binding identifiers and does not verify the physical computer. Binding
and invalid-binding callbacks refresh this display through the shared query cache.

When PiP is unavailable, the existing alert offers an explicit full-screen launch in UU Remote.
The user can cancel and stay in Cherry. If association is still needed, the pending binding retains
the chosen window mode across process restarts, then opens that mode after the binding callback.

`Backend.uuRemote` owns the external protocol, installation and iOS version checks, device-local SecureStore
bindings and a single pending request. It uses this build's native callback scheme, preserves the
originating chat/device target across process restarts, and validates and consumes correlated
callbacks once. Persistent bindings stay in SecureStore and never enter the Cherry desktop protocol.
Observe filters the UU device ID and request correlation parameters before exporting navigation
metrics; callback routing is not a telemetry boundary. Remote chat publishes
its effective draft ID into the focused route so the sidebar can preserve unsent input across a
callback and process restart.
Replacing a request makes older callbacks inert; callbacks expire after 30 minutes without imposing
a short UI timeout while UU is waiting for a user decision. Bootstrap drains operations on disposal.

The route adapter `+native-intent.ts` uses the UI-free public sub-entry `uuRemote/nativeIntent` to
stage callbacks before bootstrap and keep raw callback parameters out of navigation. Warm callbacks
return no route: `UuRemoteCallbackBridge` consumes them without changing the mounted page, scroll
position, or draft. Cold callbacks use the empty `UuRemoteCallbackScreen` beneath the existing startup
cover, then replace it once with the validated saved target (or home for an invalid callback).
Binding continuations wait for the startup cover to finish. Callback consumption retains the same
validation promise across effect resubscriptions; it refreshes binding queries and reports failures.

Android menu actions already run after the menu has closed. The sidebar's remote-desktop action then
waits for the drawer's closing transition without navigating away from the current page; permanent
sidebars require no transition. Keyboard dismissal is awaited before launching UU. Reopening the
drawer cancels the handoff, and unmounting the action owner aborts pending preparation. No fixed delay
or short callback timeout is used. Repeated presses during preparation share the existing opening guard.

Cherry does not own or render a video stream. UU owns the actual PiP window and the cross-app switch
still occurs. A full-screen control request has no callback,
retires any older pending request, and leaves navigation with UU; the user switches back to Cherry
manually. Launching UU is not evidence that full-screen remote control connected successfully.
The protocol cannot verify that the user selected the same physical computer as the Cherry device.

The native visibility plugin `scripts/withUuRemote.js` requires a new installation package. Android
queries must declare both the `uuremote` scheme and `external` host to match UU's entry; a scheme-only
query can incorrectly report an installed UU app as missing.

UU Remote 4.42.0+ must be installed on the phone; the target computer needs UU Remote configured.
The module checks whether UU can be opened, but cannot verify its installed app version.
iOS PiP additionally needs iOS 18+ and supported hardware. Older iOS versions can still associate
and use the confirmed full-screen alternative. Android PiP availability is reported by UU and uses
the same alternative when unavailable.

Protocol: <https://github.com/netease-uuyc/uuremote-integration-guide>.
