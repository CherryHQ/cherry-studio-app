# GitCode APK Update Checks

`createAppUpdateModule()` checks the latest stable release of `CherryHQ/cherry-studio-app` on
GitCode. The app-wide `AppUpdateObserver` checks after bootstrap, without blocking startup or
displaying a dialog, and records the result in the shared frontend query cache. Each cold launch
checks again; returning to the foreground refreshes results older than six hours.

Settings home and About each expose one Check for updates row, with no description. A known newer
APK adds a `NEW` badge on the right. Opening these pages and tapping the row never initiate a check;
they only read the recorded result. Tapping a marked row opens confirmation with the current/latest
versions and the browser-download notice. Cancel does nothing; only confirming Download APK opens
the browser. Other results appear as toasts after a tap, without adding text beneath the row.

## Distribution Gate

`app.config.ts` parses `APK_UPDATES_ENABLED=true|false` into the boolean
`extra.isApkUpdatesEnabled`. Only `true` on Android enables the feature. An absent setting defaults
to `false`; any other build setting fails configuration. The module requires the runtime boolean
`true`, hides the UI, skips network requests, and rejects download actions when disabled. GitCode
is the fixed update source. There is no user or remote toggle.

| EAS profile | APK update behavior |
| --- | --- |
| `production` | Enabled on Android |
| `production-google-play` | Explicitly disabled |
| `development` / `preview` | Disabled by default |
| Any iOS build | Disabled regardless of the setting |

The [Android release workflow](../../../../.github/workflows/android-release.yml) builds with
the existing `production` profile. Its APK is published to GitHub and manually mirrored to GitCode using the
existing release process. GitCode is the only runtime update source; a GitHub publication alone
does not announce a new version in the app. Store builds must use the disabled profiles, not reuse
this public APK. See [Local EAS Builds](../../../../docs/guides/local-builds.md).

## Version And Download Selection

- Read the installed APK's bundled `expo.version` through `expo-constants`, matching About. This
  project does not currently ship Expo OTA updates. Future OTA support must preserve the installed
  binary version and distribution gate.
- Request GitCode's public `/api/v5/repos/CherryHQ/cherry-studio-app/releases/latest?type=latest`
  endpoint through the shared HTTP client, with cancellation, a ten-second timeout, and a response
  size limit. No token is embedded or requested.
- Require a stable numeric tag, optionally prefixed with `v`, `prerelease: false`, and
  `release_status: latest`. No beta channel or prerelease setting is exposed.
- Like the website's download selection, require an actual `type: attach` asset matching the
  platform filename. Here it is `cherry-studio-<version>-android.apk`. The website's release service
  currently serves desktop packages; the app uses the mobile GitCode repository directly.
- Validate the attachment's `browser_download_url` against the fixed GitCode repository, release tag,
  and APK filename. Source archives, AABs, mismatched versions, and unrelated destinations do not
  produce an update action.
- Compare numeric components, so `1.10.0` is newer than `1.9.0`. Never suggest a downgrade. A missing
  release/APK is distinct from up-to-date. Malformed data, timeouts, and network/API failures remain
  errors; the background query retries once and can retry on a later app foreground event. An error
  never claims the app is current. A previously recorded newer version keeps its badge if a later
  background refresh fails. No background result presents a dialog or toast automatically.
- Tapping the settings row opens confirmation when a newer APK is recorded. Otherwise it runs a
  fresh check and reports that result, so a failed startup check can be retried in place. No second
  download row is rendered.
- On confirming Download APK, recheck the channel and URL, then open the APK URL with the system browser.
  The browser downloads it and the user installs it. No in-app downloader, installer, package-install
  permission, or native dependency is added. Browser launch errors show retry feedback; the app
  cannot observe browser download progress or installation completion.

GitCode documents the [latest-release endpoint](https://docs.gitcode.com/docs/apis/get-api-v-5-repos-owner-repo-releases-latest/)
and its attachment fields. Keep the canonical `gitcode.com/.../releases/download/...` URL rather
than a temporary signed CDN redirect. New APKs must retain their package ID and signing certificate
and increment their native version code to update existing installations.

## Acceptance

Focused tests cover numeric ordering, newer/equal/older releases, attachment selection, unsafe URLs,
malformed metadata, missing versions, cancellation forwarding, API failures, browser launch errors,
and disabled channels/platforms. Device acceptance still needs newer/current APKs,
offline/retry/download failure, store builds, and both themes with long translations.
