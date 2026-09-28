# Startup

This App Shell module owns the frontend startup cover and the readiness protocol that hands control
from the native splash screen to rendered application content.

The root layout consumes `StartupCoordinator` and `StartupRouteReadyReporter` through `index.ts`.
Feature screens report content readiness through the exported hook without owning the global
startup lifecycle. A screen that runs its own entrance reads `useStartupCoverVisible` and holds the
entrance until the cover is gone; outside `StartupCoordinator` the hook reports no cover.

`AppUpdateObserver` starts a nonblocking GitCode APK check after the bootstrap gate opens. It keeps
the result in the shared frontend query cache and refreshes stale data when the app returns to the
foreground. It never presents a dialog. Settings only observes that result; opening settings or
tapping its update row does not start a request. Store builds and iOS disable this query through the
backend distribution gate.
