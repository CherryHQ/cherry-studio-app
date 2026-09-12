# Startup

This App Shell module owns the frontend startup cover and the readiness protocol that hands control
from the native splash screen to rendered application content.

The root layout consumes `StartupCoordinator` and `StartupRouteReadyReporter` through `index.ts`.
Feature screens report content readiness through the exported hook without owning the global
startup lifecycle.
