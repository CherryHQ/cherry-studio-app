# Crash Reporting

Local Expo module owning native Sentry initialization, consent persistence, and crash payload
filtering. The app-shell [observability module](../../src/frontend/appShell/observability/README.md)
owns JavaScript capture, logging, subscriptions, and the settings-facing API. This module does not
implement its own crash recorder or upload protocol.

## Native ownership

- `app.plugin.js` embeds public production/DSN configuration and the shared startup policy. The
  iOS app-delegate subscriber and Android application lifecycle listener configure Sentry before
  React starts, including the settings lookup and cache cleanup. This adds synchronous native
  startup work; assess its cost during authorized device acceptance. Debug, preview and Storybook
  builds cannot start reporting through these hooks.
- JS reads the native status synchronously, then reconciles it through async `configure`; older
  clients retain that async path. Missing settings default to enabled. Policy version `20260915`
  is unchanged, so existing enabled/disabled choices survive the update. Android's manifest may
  parse the numeric version as an integer; the startup listener converts it back to a string.
  Android manifest auto-init and React Native's JS-driven native initialization stay disabled.
- JavaScript envelopes arrive through React Native's `captureEnvelope` and go straight to the
  transport on both platforms; the native `beforeSend` filters below only see native events. The
  Android transport gate still applies to them; on iOS, stopping the SDK on revocation drops them.
- A process-wide owner survives Expo module recreation during JS reloads. A running grant is
  revoked if a reload changes the disclosure version or removes the production/DSN gate.
- `setConsent(true)` persists the disclosure version (Android also persists the grant time) and, in
  production builds, starts the SDK at once. `setConsent(false)` closes the capture and transport
  gates, stops the SDK, persists a `disabled` marker, and removes the report cache. Both may repeat
  within one process; the gates are plain flags read by every SDK callback.
- iOS stores the grant in an Application Support directory excluded from backups. Android uses an
  `AtomicFile` under `noBackupFilesDir`. Neither depends on app SQLite, preference hydration, or
  exported app data.
- The SDK cache lives in one app-owned directory. Startup without a current grant deletes it along
  with pre-consent legacy Sentry caches, so nothing written while revoked can be replayed later.
- Android persists when the grant began and rejects older events. This prevents Android's system
  ANR history from backfilling an interval when reporting was disabled.
- Android combines consent with Sentry's connection-status provider at the transport gate. Requests
  already handed to the network can finish; already transmitted data cannot be withdrawn.

Sentry React Native 7.11.0 uses Cocoa 8.58.0 and Android 8.31.0. The podspec and Gradle dependency
match those versions. Recheck the native APIs and update the version guard when upgrading Sentry.
Use a newly built native client after changing this module; Metro/OTA cannot install native code.

## Data boundaries

Both native filters delete free-form fields from the structured event in place: messages, request
data, user identity, extras, arbitrary breadcrumbs, modules, fingerprints, source context, locals, thread
names, and every context except selected OS/device fields. Exception types, stack symbols,
release/environment, and debug images stay as the SDK produced them. Fatal exceptions emitted by
React Native's native bridge remain as a fallback when JS delivery is missing. iOS exception names
that embed the JS message are replaced with `ReactNativeFatal`.

The shared policy permits at most 20 breadcrumbs containing fixed startup-stage codes and timestamps.
The native owner records `startup.native`; RN scope synchronization forwards the JS entries. Native
breadcrumb and recovered-event filters apply the same allowlist. Page and lifecycle tracking remain
disabled.

Android NDK minidumps are retained to preserve native crash reporting. They can contain portions of
process memory, outside the reach of structured `beforeSend` filtering. The compact settings switch
does not change this limitation. This module does not promise complete anonymity and does not change
Sentry project storage, retention, or server-side scrubbing settings.

## Verification still required

The JS regression suites cover content exclusion, cancellation, logger isolation, and consent
transitions. The version guard checks this module against the installed RN SDK. Native compilation
and device/network acceptance are separate checks; do not treat the JS suites as evidence for them.
Run builds and device checks only with explicit task authorization.

When authorized, cover both iOS and Android:

1. Fresh install: the switch defaults to on. Existing `20260915` grants and saved opt-outs survive
   upgrades and relaunches. Stale grants,
   absent DSN, and non-production profiles send no Sentry requests.
2. Grant, then relaunch: a JS error and a real native crash retain usable source/symbol information.
3. Offline crash, revoke before delivery, re-grant and relaunch: revoked reports are never sent.
4. Revoke while a send is queued, including a subsequent JS reload: no new sends; document requests
   already in flight separately.
5. Upgrade with reporting disabled or no valid policy record: legacy native caches are discarded.
6. Inspect structured envelopes for prompts, provider responses, credentials, user/device IDs,
   URLs, paths, and attachments. Inspect NDK dumps separately; do not infer their contents from JS
   or Java event filtering.
7. Consent write failure: show an error and keep the current process paused.

Official references: [native initialization](https://docs.sentry.io/platforms/react-native/manual-setup/native-init/),
[native filtering limitation](https://sentry.zendesk.com/hc/en-us/articles/26323481356443-How-to-filter-native-events-in-React-Native-SDK),
and [bundled SDK versions](https://github.com/getsentry/sentry-react-native/blob/7.11.0/SDK-VERSIONS.md).

Also cover an early route-module exception and confirm the native fallback is retained. Match JS
source-map debug IDs and native symbols to the installed package before claiming source resolution.
