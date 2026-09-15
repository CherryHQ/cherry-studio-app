# Observability

This App Shell module owns the app's EAS Observe and Sentry integrations. The root layout runs
their configuration at module scope, before the first screen mounts.

## EAS Observe

Time to First Render comes from `ObserveRoot.wrap` in `src/app/_layout.tsx`; navigation timings come
from the Expo Router integration `configureObserve` enables. Only TTI needs a caller, and it must
come from inside a screen, so entry routes mount `StartupInteractiveMarker` themselves.

## Sentry

`configureSentry` connects JavaScript error reporting to the app-owned
[native crash reporting module](../../../../modules/crash-reporting/README.md). The root layout
composes `Sentry.wrap` with `ObserveRoot.wrap`. iOS crashes, Android Java/NDK crashes, native hang
detection, and JavaScript uncaught errors remain supported. Performance tracing, session replay,
session tracking, breadcrumbs, screenshots, view hierarchies, and log streaming are disabled.

### Consent

Settings → Error and crash reports owns the disclosure and user choice. New installs and upgrades
without a matching grant default to off. A grant consists of `SENTRY_CONSENT_VERSION` plus a random
local cache identifier; neither value is sent as user identity. The native module stores this
outside SQLite and excludes it from backups, so database startup failures do not prevent reading
an existing grant. This is consent to the displayed diagnostics scope, not acceptance of a complete
legal privacy policy. Bump the version when that scope changes.

Enabling takes effect on the next app launch. Disabling closes the JS gate immediately, revokes the
native gate, stops the SDK, and removes pending native reports. Each new grant gets a new cache
directory. Old requests and caches cannot acquire a later grant in the same process. iOS cancels
its dedicated URL session; Android checks consent before each queued send. Data already transmitted
cannot be recalled, and an Android request already in flight may finish. Persistence/cleanup
failures are shown in settings. Native revocation closes its gate before disk operations; if the
bridge call rejects, JS stays paused and the switch restores the last saved choice for retrying.

JavaScript uses `autoInitializeNativeSdk: false`: only the native module may initialize the native
SDKs. A JS `beforeSend` cannot filter native crashes. Native SDK initialization still happens at the
root layout's module-scope call, as before; failures before JavaScript reaches that call are outside
this capture window. Missing native code or unreadable consent fails closed.

### Payload and error logs

`sentryEvent.ts` constructs JavaScript payloads from allowed fields. Native filters do the same for
structured crash events. Reports retain error type, stack positions and symbols, build information,
and selected OS/device categories. Free-form exception messages are replaced. Request details,
user identity, arbitrary contexts, source snippets, locals, log messages, and raw error properties
are excluded. JS envelopes retain event items only; attachments do not bypass the event filter.

`LoggerService` has a disposable error reporter without a Sentry dependency. Production error logs
with an actual `Error` and stack can be reported. Only fixed `module` and `operation` tags cross
that boundary; cancellation errors are excluded. Startup, service initialization, task recovery,
task finalization, and chat terminal persistence have fixed operation names. Existing service
initialization errors include database migration failures through their call stacks. Ordinary
warnings and context-only logs are not uploaded.

Android NDK minidumps remain necessary for native crash diagnosis and may contain process memory;
structured event filtering cannot scrub that binary content. Do not claim these reports are fully
anonymous or guaranteed free of user content. The settings disclosure explicitly states this
limitation and identifies Sentry as the recipient. EAS Observe is separate and is not controlled by
this error-reporting switch.

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
