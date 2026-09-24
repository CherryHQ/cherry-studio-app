# Startup

This App Shell module owns the frontend startup cover and the readiness protocol that hands control
from the native splash screen to rendered application content.

The root layout consumes `StartupCoordinator` and `StartupRouteReadyReporter` through `index.ts`.
Feature screens report content readiness through the exported hook without owning the global
startup lifecycle. A screen that runs its own entrance reads `useStartupCoverVisible` and holds the
entrance until the cover is gone; outside `StartupCoordinator` the hook reports no cover.
