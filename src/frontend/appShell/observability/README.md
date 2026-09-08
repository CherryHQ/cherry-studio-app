# Observability

This App Shell module owns the app's EAS Observe integration: the one-time SDK configuration the
root layout runs at module scope, and the entry-screen marker that closes the Time to Interactive
span.

Time to First Render comes from `ObserveRoot.wrap` in `src/app/_layout.tsx`; navigation timings come
from the Expo Router integration `configureObserve` enables. Only TTI needs a caller, and it must
come from inside a screen, so entry routes mount `StartupInteractiveMarker` themselves.
