# Application Update Infrastructure

`createAppUpdateModule()` is the shared backend capability for installed-package updates. It owns
channel routing, release discovery, update actions and one app-scoped APK transfer. Frontend code
consumes `AppUpdateModule`; it does not choose release servers, construct store links or own downloads.
`bootstrap` constructs one instance and cancels/joins its transfer before disposing the host.
The [app-shell integration](../../../frontend/appShell/appUpdate/README.md) owns reminders and decisions.
The `runningUpdate` leaf is a public early-boot entry for the running native update identity;
diagnostic recording can read it without constructing update services.
[EAS Update](../../../../docs/guides/app-updates.md) separately delivers compatible code/assets.

## Distribution

| Native channel | Release source | User action |
| --- | --- | --- |
| Android `production-apk` | GitCode latest stable mobile release | Download in the app, then confirm Android installation |
| Android `production-google-play` | Google Play's update-availability API for this installation | Open Google Play, with official web-listing fallback |
| iOS `production-ios` | Apple's public software lookup for the installed bundle | Open App Store |
| `preview`, absent or unknown release channel | None | No update entry or automatic request |

The embedded `expo-updates` channel is authoritative; mutable manifest extras cannot enable APK
updates on Play or iOS. An unconfigured Android development client can opt in using
`APK_UPDATES_ENABLED=true`. The existing flag also controls the APK installation permission at
build time: `production.android.env` sets it to `true`, and `production-google-play.android.env`
sets it to `false`. Preview always excludes the permission. Keep the flag out of shared EAS
environments; build profiles own it. Development needs it at **both native build and Metro time**.

The native Android module independently requires the embedded `production-apk` channel (or a
channel-less debuggable app) and the build-time flag. Store and preview manifests explicitly remove
`REQUEST_INSTALL_PACKAGES`, including permissions introduced through library merging. A new native
package is required for this capability; an OTA cannot add it.

## Discovery

The installed version/build comes from `expo-application`. OTA manifest versions do not participate.
Only positive version changes produce update actions; network and malformed-response errors never
claim that the app is current.

- **APK:** `gitcodeRelease` requests the public
  `/api/v5/repos/CherryHQ/cherry-studio-app/releases/latest?type=latest` endpoint with a ten-second
  timeout, cancellation and a response cap. It requires a numeric stable tag, `prerelease: false`,
  `release_status: latest`, and actual `attach` assets for both
  `cherry-studio-<version>-android.apk` and `SHA256SUMS`. URLs must exactly match this repository,
  release tag and filename. GitHub-only publication does not announce an update. This remains a
  stable-version channel: prereleases and same-version APK rebuilds are not advertised.
- **Google Play:** the native module uses `AppUpdateManager` from Play's official library, with a
  ten-second deadline. It reads the update available to this installation, including Play's track
  and rollout eligibility. Play exposes the target version code, not its display version; the
  contract deliberately leaves `latestVersion` null. No public-page scraping or GitCode fallback.
  SDK errors and unknown availability are errors. A client without the native module reports
  `nativeUnavailable` rather than up-to-date.
- **App Store:** `appStoreRelease` queries Apple's public lookup by the installed bundle identifier,
  validates the returned identity, compares the numeric store version and constructs an official
  `apps.apple.com` URL. The query uses the device locale's region, falling back to US; this is not
  account-storefront detection, so a device/account region mismatch can suppress a reminder. A
  missing regional listing is `noRelease`. This checks App Store publications, not new TestFlight
  builds. Store submission or TestFlight upload alone is never an availability signal.

## Release Notes

Each available release carries `notes` from its own source, and `releaseNotes(release, language)`
selects the version for the UI language. A failed lookup returns what the release already carries.

- **APK:** the GitCode release body is Simplified Chinese Markdown. Chinese UI languages use it as
  is. Other languages read the English body of the same tag from the public GitHub releases API
  (`api.github.com`, ten-second timeout), falling back to the Chinese notes. Both bodies drop their
  `#` title and everything from the download heading (`## 下载安装` / `## Download and Installation`)
  onward, which describes attachments and checksums the app handles itself.
- **App Store:** Apple's lookup `releaseNotes` for the queried region, as plain text.
- **Google Play:** none; the in-app update API exposes only a version code.

## APK Transfer And Installation

`createApkDownload` exposes a stable snapshot/subscription pair through the shared module. Only one
transfer is active at a time; repeated requests share it. Leaving About only releases observation.
Cancellation and bootstrap shutdown abort metadata/hash work, cancel the native transfer, wait for
cleanup, and remove partial files before a new transfer is admitted.
Successful release checks clear a failed transfer when its release was replaced or withdrawn,
restoring normal reminders and update actions. Check failures preserve the existing transfer state.

Metadata and checksum requests use the shared HTTP client. The APK body uses Expo FileSystem's
native streaming downloader so large packages do not enter a JavaScript byte buffer; its progress
API is currently provided by `expo-file-system/legacy`. The transfer has a thirty-minute deadline
and a 1 GiB limit. It may continue while the process is backgrounded, subject to OS process limits;
it is not a persistent background job and does not promise resume after process termination.

Downloads go to `cache/app-updates/pending.apk`. The exact release checksum is fetched on each
attempt, and `fileHash` computes SHA-256 off the JavaScript thread. Only a verified file is moved
to `update.apk` and exposed as ready. A completed cached file can be reused after a fresh checksum
comparison; partial transfers restart. Android can evict cache files, so opening the installer
still validates the file. New downloads remove obsolete cached packages.
An evicted or incompatible package leaves the ready state and offers a fresh download instead of
reusing the rejected file. Concurrent install requests share one native invocation.

Installation is always user-initiated. Permission guidance uses `DevicePermissions`' system-prompt
queue. After authorization, the native module verifies the file path, package ID, exact signing
certificate set and increasing native version code, then shares only the update cache directory
through its private FileProvider. Android owns installation confirmation. Opening that screen is
not installation success, and the ready action remains available if the user cancels. The next
process reads the installed native version. A signing-key rotation requires separate support;
GitHub/GitCode and Play signing channels must not be mixed.

## Validation

Regression sources cover channel isolation, installed-version comparison, release/URL/checksum
validation, store lookup failures, transfer cancellation, deduplication, integrity failure, retry,
cache reuse and disposal. Native acceptance requires authorized builds and devices: install-source
permission denial/grant, correct and incorrect signatures/package IDs/version codes, cancelled
installation, missing cache files, network interruption, Play-owned installations and App Store
regional availability. Source review and lint do not establish these native outcomes.
