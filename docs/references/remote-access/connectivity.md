# Desktop location and stable pairing

Pairing stores desktop identity, phone device ID and domain grants. Network locations do not
participate in the binding fingerprint or Agent scope. The location implementation is owned by
`DesktopConnectionManager`; Agent runtimes and configuration export continue using domain leases.

## Finding a desktop

- `DesktopEndpointResolver` combines explicit `ws://` / `wss://` addresses, automatically synced
  desktop addresses, and in-memory QR/DNS-SD hints. Explicit and synced addresses are persisted
  separately. Hostnames are retained for system DNS resolution, including over an existing VPN.
- `_cherry-remote._tcp` records carry `v=1` and the public desktop `identity` in TXT. SRV supplies
  the actual shared Gateway port. Matching TXT is a filter, never proof: Noise pins the desktop.
- Each desktop has at most eight configured routes, sixteen synced routes, and sixteen QR/discovery routes. The host
  accepts at most 128 service records. QR hints expire after five minutes; discoveries are locally
  revalidated after sixty seconds at most. Network changes discard automatic hints and successful
  route preferences, without deleting configuration or authorization.
- The phone skips scoped/link-local IPv6 discoveries because RN WebSocket cannot portably use the
  interface scope. Configured WSS uses normal system certificate validation. All routes use the
  fixed `/v1/remote/connect` path; credentials, arbitrary paths, queries and fragments are rejected.

## Connection lifetime

Recovery is serial: one socket attempt per desktop, four seconds to open and six more for
Noise/hello/authentication, within a fifteen-second round. New hints wake a waiting round; they do
not preempt an ongoing handshake. Failed candidates rotate behind untried addresses across retries,
so the round budget cannot permanently starve a later route. A network change cancels an unfinished round and waits for its
cleanup before starting another. A healthy socket survives the notification.

Foreground path monitoring is shared by the manager. Active recovery rounds share one native
browser. Successful recovery or the final release stops browsing. Releasing the final lease
cancels an unfinished attempt immediately; an established channel keeps the existing three-second
idle grace. Backgrounding cancels browsing and connection work. All pending tasks drain on stop.

`DesktopSession` receives one opened stream and owns Noise, hello, JSON-RPC, heartbeat and refresh.
Only an `UNAUTHENTICATED` reply to authentication from the pinned desktop retires the binding for
repair. Wrong peers, unavailable addresses and discovery failures leave grants and Agent state intact.
The current channel and lease scope are independent of candidate expiry.

## Settings and migration

Device details keep editable connection addresses, single-address verification, and **Update location
from QR code** under collapsed **Advanced settings**. A location scan must match the stored desktop identity and updates memory only. It does not
claim an invitation, request grants or re-pair; an expired invitation can still supply a location hint.
Initial pairing seeds QR hints under the saved connection ID, authenticates the approved device on
the pairing channel, and syncs desktop addresses before returning. No additional connection is
opened for this handoff.

Migration `0001_hot_cammi` replaces the legacy HTTP connection table with the final Noise pairing
schema, including `configured_endpoints` with an empty-array default. Legacy HTTP connections require
re-pairing; automatic discovery addresses are never persisted as user configuration.
Migration `0002_orange_thunderbolt_ross` adds `learned_endpoints` with an empty-array default while
preserving existing pairing, grants, and manual addresses. Existing paired devices populate this
field on their next successful authenticated connection; no new pairing is needed.

## Native module and release boundary

`modules/remote-discovery` wraps Apple NetService/Bonjour with NWPathMonitor and Android NsdManager
with ConnectivityManager. Android 34+ tracks service-info updates and unregisters callbacks; older
versions use serial one-shot resolution during each bounded browse. Older Android cannot cancel a
system resolution already in progress; generation checks discard its late result. The multicast
lock, browser, callback subscriptions and local queues are released when browsing stops. Apple
re-resolves while browsing and stops its service monitors on cancellation.

The existing zeroconf library was considered. Its [iOS implementation](https://github.com/balthazar/react-native-zeroconf/blob/master/ios/RNZeroconf/RNZeroconf.m)
indexes outstanding work by service name and drops the delegate after one resolution. It does not
provide the update and cancellation ownership needed here. The new module uses the system APIs,
not a second mDNS implementation. See [Android NSD](https://developer.android.com/reference/android/net/nsd/NsdManager)
and [Apple NetService](https://developer.apple.com/documentation/foundation/netservice).

A new native development/release client is required. An old client reports discovery unavailable;
explicit addresses and a fresh location QR remain usable. Discovery, migration, settings and
connection management must ship together. Native compilation and unit tests do not establish
real-device permission, VPN, Wi-Fi-change or suspend/resume acceptance. Keychain authorization on
the desktop is independent; this change never regenerates identities to avoid a prompt.

## Automatic address handoff

`connection.hello.connectionEndpointsVersion: 1` advertises the capability-scoped
`connection.endpoints` method. Pairing completion and each subsequent authenticated connection
query addresses automatically. The latter runs after the connection becomes ready, so address
sync does not delay Agent or configuration work. Pairing sync is bounded to four seconds and is
best effort. Older desktops skip this query and retain existing connection behavior.

Only addresses returned by the pinned, authenticated desktop are persisted. A response must match
the stored desktop identity and an existing domain grant. The data service checks that pairing and
grants still match inside the write transaction, respects cancellation, and replaces the bounded
synced list rather than accumulating stale routes. Manual addresses remain untouched. Re-pairing
clears synced routes before learning from the newly approved desktop.

Synced addresses are candidates, not a claim that every route works on the current network. They
survive network changes and app restarts; each future connection still authenticates the desktop.
A failed address query leaves previously saved routes and an otherwise healthy connection intact.
When the channel closes or its owner stops, pending sync is cancelled with the connection work.
QR and DNS-SD hints remain temporary and are never promoted directly into durable routes.

Advanced settings retain manual entry and **Save and verify** for diagnostics. That operation
opens a manager-owned channel against exactly the selected endpoint, authenticates the existing
pairing, and saves the manual route only after a successful capability-scoped query. It does not
fall back to a different address or claim that other networks have been tested.

Mobile consumes the published `@cherrystudio/remote-protocol@0.3.0` and
`@cherrystudio/remote-transport@0.1.2` packages. Physical-device, light/dark UI, and real VPN
switching acceptance of this Mobile build remain pending.
