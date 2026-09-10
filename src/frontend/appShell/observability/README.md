# Observability

This App Shell module owns the app's EAS Observe and Sentry integrations. The root layout runs
their configuration at module scope, before the first screen mounts.

## EAS Observe

Time to First Render comes from `ObserveRoot.wrap` in `src/app/_layout.tsx`; navigation timings come
from the Expo Router integration `configureObserve` enables. Only TTI needs a caller, and it must
come from inside a screen, so entry routes mount `StartupInteractiveMarker` themselves.

## Sentry

`configureSentry` configures JavaScript error and native crash reporting. The root layout composes
`Sentry.wrap` with the existing `ObserveRoot.wrap`. Performance tracing, session replay, and log
streaming are not enabled. Default PII collection is disabled, as are JavaScript console and HTTP
breadcrumbs, which can contain conversation data or provider credentials.

Reporting and native initialization are disabled in development mode or when
`EXPO_PUBLIC_SENTRY_DSN` is absent. `app.config.ts` supplies the build's `PROFILE` through
`extra.sentryEnvironment` to distinguish report environments.

The GitHub release workflows trigger EAS cloud builds using the `production` environment. Configure
`EXPO_PUBLIC_SENTRY_DSN` as a plain-text variable and `SENTRY_AUTH_TOKEN` as a sensitive variable in
that EAS environment. The DSN is embedded in the app; the token is used only by native build hooks
to upload source maps and debug symbols to `cherryai/cherry-studio-a0`. GitHub keeps `EXPO_TOKEN`
for EAS authentication. The Sentry Expo and Metro plugins handle uploads and source map identifiers.
