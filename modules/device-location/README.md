# Device Location

Android foreground location through the platform `LocationManager`, without a Google Play services
dependency. Expo discovers this local module under `modules/`. A new native app build is required;
an OTA update cannot add the native module to an existing binary.

The caller must obtain foreground location permission first. The module rechecks it, requests the
enabled network and GPS providers together, and returns the first fix no older than ten seconds.
Results retain the provider, original timestamp, and reported accuracy. It does not substitute an
old last-known location. Approximate permission remains valid; the OS controls coordinate precision.

Each request has a native 30-second deadline. Success, failure, cancellation, and module destruction
remove its listeners and deadline. `createRequest()` reserves a cancellation handle synchronously,
so `cancelRequest(id)` also prevents a queued `getCurrentPosition(id)` from starting. Every created
handle must be released with `cancelRequest(id)` in the caller's `finally` block.

The app service retains Expo location on iOS and uses Expo's platform geocoder for optional addresses.
An unavailable address does not discard coordinates. Cancelling address lookup stops waiting;
Expo's geocoder does not expose native cancellation.

Device acceptance should cover a phone without Google Play services, GPS-only operation,
approximate permission, services disabled mid-request, timeout, immediate cancellation, and
repeated calls after cancellation.
