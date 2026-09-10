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
streaming are not enabled. Default PII collection is disabled. `maxBreadcrumbs: 0` disables all
breadcrumbs in both JavaScript and the native SDKs, including native HTTP breadcrumbs whose URLs
can contain conversation data or provider credentials. JavaScript console and HTTP breadcrumb
instrumentation is also disabled. Error stacks and native crash reporting remain enabled.

`app.json` explicitly declares crash, performance, and other diagnostic data for observability in
`ios.privacyManifests`, without identity linkage or tracking. It also declares Sentry's required
UserDefaults, system boot time, and file timestamp API reasons from the
[official privacy manifest guide](https://docs.sentry.io/platforms/react-native/data-management/apple-privacy-manifest/).
These declarations are the app's baseline; React Native aggregates additional API reasons from
native dependencies during CocoaPods installation.

Reporting and native initialization require `extra.sentryEnvironment === 'production'`, a configured
`EXPO_PUBLIC_SENTRY_DSN`, and a bundle running outside development mode. `app.config.ts` supplies the
build's `PROFILE` through `extra.sentryEnvironment`. Development and preview packages never enable
reporting, even when a DSN is present.

`app.config.ts` includes the Sentry Expo plugin only for `PROFILE=production`, so generated
development and preview native projects have no Sentry source-map or debug-symbol upload hooks.
The Sentry dependency remains installed across profiles; disabling reporting and uploads does not
remove its native code from the app.

The GitHub release workflows trigger EAS cloud builds using the `production` environment. Configure
`EXPO_PUBLIC_SENTRY_DSN` as a plain-text variable and `SENTRY_AUTH_TOKEN` as a sensitive variable in
that EAS environment. The DSN is embedded in the app; the token is used only by native build hooks
to upload source maps and debug symbols to `cherryai/cherry-studio-app`. GitHub keeps `EXPO_TOKEN`
for EAS authentication. The Sentry Expo and Metro plugins handle uploads and source map identifiers.

Sentry also works with local EAS builds; cloud workers are not required. Use `pnpm build:local` to
load `.env` and `.env.local` into the build process before EAS creates its source archive. See
[Local EAS Builds](../../../../docs/guides/local-builds.md) for production credentials, profile-specific
Sentry behavior, and native regeneration when switching profiles.
