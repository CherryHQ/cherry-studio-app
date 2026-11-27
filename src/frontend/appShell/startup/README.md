# Startup

This App Shell module owns the startup readiness protocol that hides the native `expo-splash-screen`
once bootstrap and initial application content are ready.

The root layout consumes `StartupCoordinator` and `StartupRouteReadyReporter` through `index.ts`.
Feature screens report content readiness through the exported hook without owning the global
startup lifecycle. Screens and providers read `useStartupCoverVisible` to defer post-launch UI
entrances or checks until the native splash has been dismissed; outside `StartupCoordinator` the
hook reports the splash as hidden.

Application update discovery and reminders live in the sibling
[appUpdate](../appUpdate/README.md) module. Startup only provides the splash-visibility signal.
