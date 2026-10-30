# UU Remote Desktop

The remote chat and device detail headers expose a computer action through `useUuRemoteAction`.
First use explains association, lets the user choose the corresponding Windows/macOS computer in
UU Remote, then opens its desktop in picture in picture. Subsequent presses open PiP directly.
Device details also expose reassociation when the user chose the wrong computer or changed UU accounts.

`Backend.uuRemote` owns the external protocol, installation and iOS version checks, device-local SecureStore
bindings and a single pending request. It uses this build's native callback scheme, preserves the
originating chat/device target across process restarts, and validates and consumes correlated
callbacks once. Encrypted UU device IDs never enter frontend state or the Cherry desktop protocol.
Replacing a request makes older callbacks inert; callbacks expire after 30 minutes without imposing
a short UI timeout while UU is waiting for a user decision. Bootstrap drains operations on disposal.

`UuRemoteCallbackScreen` removes callback parameters from navigation and restores the originating
surface. It follows an accepted binding with a PiP request and translates failures. It does not own
or render a video stream. UU owns the actual PiP window; there is no silent full-screen fallback.
The protocol cannot verify that the user selected the same physical computer as the Cherry device.

The native visibility plugin `scripts/withUuRemote.js` requires a new installation package. UU
Remote 4.42.0+ must be installed on the phone; the target computer needs UU Remote configured.
The module checks whether UU can be opened, but cannot verify its installed app version.
iOS PiP additionally needs iOS 18+ and supported hardware. Android PiP availability is reported by UU.

Protocol: <https://github.com/netease-uuyc/uuremote-integration-guide>.
