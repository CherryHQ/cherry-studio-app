# Observability

This App Shell module owns the app's EAS Observe and Sentry integrations. Sentry starts through
`startup.ts` at the app entry, before Expo Router loads route modules. EAS Observe configuration
remains at module scope in the root layout.

## EAS Observe

Time to First Render comes from `ObserveRoot.wrap` in `src/app/_layout.tsx`; navigation timings come
from the Expo Router integration `configureObserve` enables. Only TTI needs a caller, and it must
come from inside a screen, so entry routes mount `StartupInteractiveMarker` themselves.

## Sentry

`configureSentry` connects JavaScript error reporting to the app-owned
[native crash reporting module](../../../../modules/crash-reporting/README.md). The root layout
composes `Sentry.wrap` with `ObserveRoot.wrap`. iOS crashes, Android Java/NDK crashes, native hang
detection, and JavaScript uncaught errors remain supported. Performance tracing, session replay,
session tracking, automatic breadcrumbs, screenshots, view hierarchies, and log streaming are disabled.

### Consent

Settings places Privacy settings and About us in the same group, with Privacy settings first.
Privacy settings retains the existing Send anonymous error reports switch. First use defaults to
on; a saved `disabled` marker keeps manual opt-outs off across relaunches. The policy
version remains `20260915`, preserving existing settings through this update. Stale grants stay off.
A grant is the stored `SENTRY_CONSENT_VERSION`;
Android also stores when the grant began so older system ANR history is rejected. The native module
stores this outside SQLite and excludes it from backups, so database startup failures do not
prevent reading an existing grant. This is consent to diagnostic reporting, not acceptance of a
complete legal privacy policy. The shared `modules/crash-reporting/reportingPolicy.json` owns the
version and fixed startup codes. This change preserves the existing policy version and adds only
startup-stage diagnostics; future collection-policy changes need an explicit migration decision.

Enabling starts native and JavaScript reporting immediately in production builds; other builds only
record the choice. Disabling closes the JS gate immediately, revokes the native gate, stops the SDK,
replaces the grant with the disabled marker, and removes the pending report cache. Android also
checks consent before each queued send. A request already handed to the network may finish, and
data already transmitted cannot be recalled. Startup without a current grant deletes any cache left
behind, so a report
written after revocation is never replayed under a later grant. Persistence/cleanup failures are
shown in settings. Native revocation closes its gate before disk operations; if the
bridge call rejects, JS stays paused and the switch restores the last saved choice for retrying.

JavaScript uses `autoInitializeNativeSdk: false`: only the native module may initialize the native
SDKs. A JS `beforeSend` cannot filter native crashes, and JavaScript envelopes reach the native
transport on both platforms without passing the native `beforeSend`, so `sentryEvent.ts` is the only
filter for JS events. Native lifecycle hooks configure the owner before React starts, using the
embedded production/DSN configuration and saved setting. At the JS entry, `configureSentry` reads
native status synchronously and installs capture immediately when ready. Async configuration still
reconciles JS reloads and supports older native clients. Missing native code or unreadable settings
fail closed. Errors before the native hook/SDK starts remain outside the capture window.

Native fatal exceptions from React Native remain as a fallback, even when a JS handler exists:
handler installation does not prove delivery. Duplicate JS/native reports are possible. iOS exception
names that embed the JS error message are replaced with `ReactNativeFatal`.

### Payload and error logs

`sentryEvent.ts` constructs JavaScript payloads from allowed fields. Native filters delete the
free-form fields from structured crash events instead. Reports retain error type, stack positions and symbols, build information,
and selected OS/device categories. Free-form exception messages are replaced. Request details,
user identity, arbitrary contexts, source snippets, locals, log messages, and raw error properties
are excluded. JS envelopes retain event items only; attachments do not bypass the event filter.

Reports may retain at most 20 manual breadcrumbs, containing only fixed startup-stage codes and
timestamps. There are no page, route-parameter, foreground/background, or render-retry records.
JS and native filters rebuild these entries from the shared allowlist; RN's scope synchronization
forwards them to native. Revocation clears JS breadcrumbs and native caches. Fixed framework error
categories and Data API error codes supplement stacks without retaining free-form messages.

`LoggerService` has a disposable error reporter without a Sentry dependency. Only production error
logs that pass an actual `Error` with a stack and name a fixed `operation` are reported; every other
error log stays local. Only the fixed `module` and `operation` tags cross that boundary, and
cancellation errors are excluded. Startup, service initialization, task recovery, task
finalization, and chat terminal persistence name their operations today. Existing service
initialization errors include database migration failures through their call stacks. Adding a call
site to the upload set means adding an `operation` to its log context; keep the documented collection
scope accurate when the set grows.

Android NDK minidumps remain necessary for native crash diagnosis and may contain process memory;
structured event filtering cannot scrub that binary content. Do not claim these reports are fully
anonymous or guaranteed free of user content. Reports are sent to Sentry. EAS Observe is separate
and is not controlled by this error-reporting switch.

`app.json` explicitly declares crash, performance, and other diagnostic data for observability in
`ios.privacyManifests`, without identity linkage or tracking. It also declares Sentry's required
UserDefaults, system boot time, and file timestamp API reasons from the
[official privacy manifest guide](https://docs.sentry.io/platforms/react-native/data-management/apple-privacy-manifest/).
These declarations are the app's baseline; React Native aggregates additional API reasons from
native dependencies during CocoaPods installation.

Reporting and native initialization require a current grant, `extra.sentryEnvironment === 'production'`,
a configured `EXPO_PUBLIC_SENTRY_DSN`, and a bundle running outside development mode. `app.config.ts` supplies the
build's `PROFILE` through `extra.sentryEnvironment`. Development and preview packages never enable
reporting, even when a DSN is present.

Changes to `modules/crash-reporting` require a new native installation package. Ship this change
with that package: an OTA update cannot add the module or replace an already running legacy native
SDK. The new JS integration does not initialize Sentry when the native module is absent.

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

Before release, authorized acceptance must verify early JS/native capture, saved opt-outs, and
source-map/debug-symbol matching against the installed build. Native initialization and actual
server ingestion are not established by lint or JS tests alone.
