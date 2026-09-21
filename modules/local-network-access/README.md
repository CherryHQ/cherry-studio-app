# Local Network Access

iOS desktop-pairing support, discovered by Expo under `modules/`. Requires a new native build;
existing clients without the module keep the original pairing transport.

On scanner entry, `request()` connects UDP sockets to link-local IPv6 addresses to trigger the
system permission sheet, following [Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).
It sends no packets and performs no discovery. A short presentation grace period and foreground
notification let an already-presented sheet settle before camera authorization. Completion does
not report a permission grant; preparation is best-effort and does not block scanning on failure.

`PairingRequest` uses a dedicated `URLSession` with `waitsForConnectivity` so the actual POST can
wait for pending authorization without replaying the pairing code. It has a four-second idle
timeout and thirty-second overall limit, rejects redirects, and supports cancellation and release.
Android and other requests retain their existing transport.

Physical iOS verification is still required; the simulator does not implement local-network privacy.
