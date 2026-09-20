# Local Network Access

iOS support for desktop pairing, discovered by Expo under `modules/`. Requires a new native
development build; an OTA update cannot add this module to an existing client.

On scanner entry, `request()` attempts to trigger the system permission sheet by connecting UDP
sockets to link-local IPv6 addresses, following
[Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).
It sends no packets, publishes no service, and performs no device discovery. A short presentation
grace period and foreground notification keep an already-presented sheet ahead of the camera
request. Completion does **not** mean permission was granted. Without a suitable network interface,
the trigger is a no-op; it never blocks scanning based on a discovery result or network timeout.

`PairingRequest` owns one actual POST to the scanned desktop. Its ephemeral `URLSession` enables
`waitsForConnectivity`, allowing a pending network permission to settle without immediately
failing or replaying the pairing code. The request retains a four-second idle timeout and a
thirty-second overall limit, including connectivity waiting. It refuses redirects, does not store
cookies, and returns only the HTTP status and body for the existing backend response validation.
Cancellation and shared-object release dispose of the task and session. Native errors omit URLs
and credentials. Android pairing and other requests retain their existing transport.

`DevicePermissions` serializes prompt preparation with other system permission requests. Android
currently targets SDK 36 and uses the existing `INTERNET` grant. Revisit that branch when increasing
the target SDK to 37, which requires local-network permission.

Physical-device acceptance is still required: first allow/deny, an already-denied permission,
return from Settings, a delayed prompt, no Wi-Fi, an unreachable desktop, duplicate scan events,
and leaving during pairing. The iOS simulator does not implement local-network privacy.
