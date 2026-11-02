# UU Remote Desktop

The sidebar's device menu exposes Remote desktop immediately above Manage devices when a remote
computer is selected. It uses the existing plain menu rows without group separators or a header
icon. `useUuRemoteAction` reuses the installation guidance and association flow: first use lets the
user choose the corresponding Windows/macOS computer in UU Remote, then opens its desktop in
picture in picture. Subsequent presses open PiP directly. Device details retain reassociation when
the user chose the wrong computer or changed UU accounts.

When PiP is unavailable, the existing alert offers an explicit full-screen launch in UU Remote.
The user can cancel and stay in Cherry. If association is still needed, the pending binding retains
the chosen window mode across process restarts, then opens that mode after the binding callback.

`Backend.uuRemote` owns the external protocol, installation and iOS version checks, device-local SecureStore
bindings and a single pending request. It uses this build's native callback scheme, preserves the
originating chat/device target across process restarts, and validates and consumes correlated
callbacks once. Persistent bindings stay in SecureStore and never enter the Cherry desktop protocol.
Observe filters the UU device ID and request correlation parameters before exporting navigation
metrics; removing the callback route after mount is not a telemetry boundary. Remote chat publishes
its effective draft ID into the focused route so the sidebar can preserve unsent input across a
callback and process restart.
Replacing a request makes older callbacks inert; callbacks expire after 30 minutes without imposing
a short UI timeout while UU is waiting for a user decision. Bootstrap drains operations on disposal.

`UuRemoteCallbackScreen` removes callback parameters from navigation and restores the originating
surface. It follows an accepted binding using the saved window mode and translates failures. It does not own
or render a video stream. UU owns the actual PiP window. A full-screen control request has no callback,
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
