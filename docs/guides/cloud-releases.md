# Cloud Releases

Push a version tag such as `v0.1.0` or `v0.1.0-beta.1` to trigger
[Release](../../.github/workflows/release.yml). It validates the version and runs
[PR CI](../../.github/workflows/pr-ci.yml) on the tagged commit on GitHub-hosted runners, then runs
`build-native` on the shared macOS self-hosted release runner (`[self-hosted, macOS, ARM64, release]`),
building Android sequentially (`android-public` APK followed by `android-google-play` AAB on stable
tags) in parallel with `ios-production` IPA. Once `build-native` publishes per-target archive
outputs, separate delivery jobs (`publish-github`, `publish-gitcode`, and `submit-ios`) read the
verified local archive on the runner so failed uploads can be retried independently without
rebuilding. Branch pushes do not publish.
The tag's base version must match `expo.version` in `app.json`; update and commit the version before
tagging. Public APK and iOS builds use the existing EAS `production` profile.
Google Play builds use `production-google-play`, which inherits the production identity, environment, signing credentials,
and automatic native build-number increments, but generates an AAB instead of an APK. The public APK and Google Play
profiles retain the current ARM64-only device support. The reserved domestic profile inherits production
signing and APK output, disables self-installation, and uses `production-domestic-stores`.

## Release Channels

A stable release prepares nine distribution destinations from four builds:

| Channel | Artifact | Build | Publication |
| --- | --- | --- | --- |
| GitHub | APK | Built locally on the release Mac on every version tag | Published automatically with `SHA256SUMS` by `publish-github` ([Android GitHub Downloads](#android-github-downloads)) |
| GitCode | The same APK | None; reuses the archived public APK | Published automatically with `SHA256SUMS` by `publish-gitcode` ([GitCode Release Sync](#gitcode-maintainer-upload)) |
| Google Play | AAB | Built locally on the release Mac on stable tags only | Archived locally on the build machine for manual Play Console upload ([Google Play](#google-play)) |
| HONOR / Xiaomi / OPPO / vivo | One shared domestic APK | Reserved local target (`android-domestic-stores`); not yet enabled in `release.yml` | Separate manual uploads, reviews, and live-version records in each console |
| TestFlight | IPA | Built locally on the release Mac on every version tag | Verified locally (`ios-symbols`) and uploaded automatically by `submit-ios` ([iOS](#ios)) |
| App Store | The same IPA | None; reuses the TestFlight build | Manual submission and release in App Store Connect |

GitHub and GitCode must publish the identical APK and checksum. TestFlight and the App Store share
one build, but their reviews and releases are independent.

## Release Preparation

Releases are built by the workflows above. Before pushing the tag, have these ready:

- GitHub English and GitCode Simplified Chinese release notes, following
  [Release Notes And Channel Coverage](#release-notes-and-channel-coverage).
- Store descriptions and release notes in every configured store locale.
- The required store screenshots, captured from the application rather than mockups or
  development builds.
- If a store rejected the previous submission, a reply to every issue and its fix in this build.
- A maintainer with GitCode write access to sync and upload the release.

Submit each store once its materials are complete; another store's pending review does not block it.

## Release Procedure

1. Summarize the changes on the intended `main` commit since the previous release. Update
   `expo.version` in `app.json`, merge the version PR, then push the matching version tag to start
   **Actions → Release**. The tag workflow owns CI and native builds.
2. Use the exact builds from that run for distribution: the public APK for GitHub and
   [GitCode](#gitcode-maintainer-upload), the [AAB for Google Play](#google-play), and the already
   uploaded [iOS build for TestFlight and App Store](#ios). Stable tags also produce one
   [domestic APK for four separate store submissions](#manual-domestic-store-upload).
3. Complete each channel's publication or review submission in its own console. TestFlight
   internal distribution, external beta review, and App Store review are separate steps. Record
   pending reviews without blocking other channels or treating an upload as an available release.
4. Archive the exact packages, checksums, release notes, build identities, and
   [release status](#release-status) under one version directory outside the repository. Keep the
   domestic APK in its own subdirectory. Use [Failure Recovery](#failure-recovery) for interrupted
   jobs or uploads; a publication retry reuses its successful build.

## Required Configuration

| Location | Setting | Purpose |
| --- | --- | --- |
| GitHub Actions secret | `EXPO_TOKEN` | Access to this EAS project's credentials, auto-incremented native versions, and iOS submissions |
| GitHub Actions secret | `GITCODE_TOKEN` | Automated `publish-gitcode` release creation and attachment uploads |
| GitHub `local-release` environment | Production build secrets (7 variables) | Injected at runtime into `build-native` without persisting plaintext secrets on the Mac runner |
| GitHub Actions | Built-in `GITHUB_TOKEN` | `contents: write` for generating release notes and publishing the GitHub release |
| EAS credentials | Android production keystore | Sign GitHub APKs, and sign AABs as the Google Play upload key |
| EAS credentials | iOS production signing and App Store Connect API key | Sign and upload iOS builds without prompts |

`publish-gitcode` calls the GitCode v5 REST API directly from `scripts/publishGitcodeRelease.ts`
using `GITCODE_TOKEN` (and optional repository variables `GITCODE_API_URL`, `GITCODE_OWNER`,
`GITCODE_REPO`). If the GitCode repository mirror has not yet synced the tagged commit when
`publish-gitcode` runs, sync the mirror and re-run the failed `publish-gitcode` job.
See [GitCode Maintainer Upload](#gitcode-maintainer-upload).

`submit.production.ios.ascAppId` in `eas.json` must identify the App Store Connect app for the
production bundle identifier in `app.json`. Set up its submission API key with
`eas credentials --platform ios` before the first unattended submission. See [local build configuration](./local-builds.md)
for app identities and production environment requirements.

All three build workflows and `scripts/publishUpdate.ts` (used by the OTA Update workflow) pin EAS CLI to
`24.4.2`; update them together when upgrading it.

Native releases now embed the EAS Update client. Channels are platform-specific:
`production-apk` for public APKs, `production-google-play` for Play,
`production-domestic-stores` for domestic stores, and `production-ios` for iOS.
These workflows build native packages only. JavaScript-only fixes between tags are published by the
manual [OTA Update](../../.github/workflows/ota-update.yml) workflow; see
[Application Updates](./app-updates.md#publishing).

## Artifact Names

Use the release tag without its leading `v` as the filename version, including any prerelease
suffix. Dates are not part of the filename. The application version in `app.json` stays numeric.

| Destination | Example filename |
| --- | --- |
| GitHub APK download | `cherry-studio-0.1.0-android.apk` |
| GitHub prerelease APK download | `cherry-studio-0.1.0-beta.6-android.apk` |
| Domestic store upload, archived separately from the public APK | `cherry-studio-0.1.0-android.apk` |
| Google Play upload archive | `cherry-studio-0.1.0-android.aab` |
| Locally archived iOS package | `cherry-studio-0.1.0-ios.ipa` |

The workflows name the downloaded APK and AAB archives; EAS may use its own internal artifact
names. iOS submission uses the EAS build ID and does not download or rename the IPA. For local
builds, pass the desired filename with `--output` as described in [Local EAS Builds](./local-builds.md).
When retaining multiple builds of one version, keep them in separate `build-<native-build-number>/`
directories. Public APK, domestic APK, and Google Play AAB are separate builds and can have
different automatically assigned native build numbers even when they share a release tag.

## Android GitHub Downloads

1. Wait for the exact EAS build started by this run to finish successfully. The build starts only
   after CI passes on the tagged commit.
2. Download its signed ARM64 APK, check the archive, and generate `SHA256SUMS`.
3. Save the APK, checksums, and generated release notes as the `android-release` Actions artifact
   for 30 days. The filename is `cherry-studio-<release-version>-android.apk`.
4. Publish the files and notes to GitHub Releases.

GitHub prepares a draft, attaches the files, and publishes it automatically. The authorized
GitCode maintainer uses their own agent through Computer Use to sync the matching tag and publish
it with the same APK and `SHA256SUMS` from the GitHub release.
Write GitHub release titles and notes in English, and GitCode release titles and notes in Simplified
Chinese. Prepare separate language versions with equivalent features, fixes, upgrade guidance, and
download information; do not copy one platform's notes verbatim to the other. Keep version tags,
artifact filenames, checksums, and technical identifiers unchanged.

GitHub's generated notes reuse pull request titles without translating them. Review their language
and keep any manually curated replacement in English. Published GitHub release notes can be updated
with `gh release edit <tag> --notes-file <english-notes.md>` without rebuilding or uploading the APK.
The app shows these notes in its update dialog. Start both bodies with the `#` title and end them
with the download section headed exactly `## 下载安装` (GitCode) or `## Download and Installation`
(GitHub); the app removes the title and that final section, so put everything users should read in
the app before it.

The public APK uses `production`, which enables GitCode update checks, in-app downloads and
user-confirmed Android installation. Publish the matching GitCode stable release with both the
APK and `SHA256SUMS` before clients can announce it; GitHub publication alone is insufficient.
The shared update UI also serves store channels: Play checks actual installation eligibility,
and iOS queries published App Store metadata. These channels open their store and never download
the public APK. App Store metadata checks do not discover TestFlight builds. Each store's review,
rollout and publication remain independent from the public APK release.

Tags with a prerelease suffix are marked as prereleases on GitHub. Plain version tags publish regular
releases. The workflow does not replace an existing attachment with different contents.

Both language versions describe Android installation and explain that store distribution is independent.
The APK becomes public when this workflow succeeds; it does not wait for either store's review.
Store links can be added to the release page after the listings are available.

### GitCode Maintainer Upload

1. Hand the authorized maintainer the release tag, source commit, GitHub release URL, exact APK,
   `SHA256SUMS`, and Simplified Chinese title and notes.
2. The maintainer directs their own agent to use Computer Use in their authenticated browser.
   GitCode does not sync automatically: open the repository's mirror settings (pull from GitHub)
   and run **立即同步**. After it finishes, confirm the release tag exists and points to the source
   commit. If it is missing or points elsewhere, leave publication pending; do not publish against
   a different commit.
3. Create or edit the release for that tag in the browser, enter the Chinese title and notes, and
   select the appropriate stable or prerelease status.
4. Upload the same APK and `SHA256SUMS` from GitHub. Wait for both attachments to finish uploading
   before publishing. On retry, inspect existing attachments first and retain matching files;
   do not replace an existing attachment with a different build.
5. Confirm the published page has the intended tag, notes, and both attachments, then record the
   release URL in the [release status](#release-status).

### Release Notes And Channel Coverage

List the changes since the previous release, then curate the public notes in this outline. Use a
module name and one concise sentence per item, and omit empty sections. GitCode uses `功能`, `修复`,
`架构升级`, `升级提醒`, and ends with `## 下载安装`.

```markdown
# Cherry Studio <version>

## Features

- [Module] One-sentence change.

## Fixes

- [Module] One-sentence fix.

## Architecture Upgrades

- [Module] One-sentence upgrade.

## Upgrade Notes

<Required upgrade steps, or omit this section.>

## Download and Installation

<APK, checksum, installation instructions, and independent store availability.>
```

Store copy can be shorter, but keep core features and upgrade warnings consistent across GitHub,
GitCode, and store locales. When the wording changes, update every affected channel, including
notes that are already published.

## Google Play

The `build-native` job on stable tags builds a signed AAB using `production-google-play` after
`android-public` finishes and archives it with `SHA256SUMS` on the Mac release runner under
`${RUNNER_RELEASE_ROOT:-$HOME/releases}/cherry-studio-app/<tag>/android-google-play/`. The job
summary records the exact archive directory path and SHA-256 checksum. It does not upload to
Google Play, create a release, or send changes for review. No Google service account or Google
Play API credentials are required; EAS still needs the Android production signing credentials and
`EXPO_TOKEN`.

The AAB is for manual upload to Play Console, not direct installation on a device. Google Play
generates the installable APKs from it. GitHub Releases continues to provide the directly installable
APK; the AAB is retained in the build machine's local release archive.

### One-Time Console Setup

1. Create the app in Google Play Console for `com.cherryai.cherrystudio_app`, complete the store
   listing and required app-content declarations, and obtain production access if the account
   requires testing first. Select the appropriate testing or production track in Play Console.
2. Keep the Google-generated Play app signing key. Google Play and GitHub APKs are independent
   channels with different signing certificates, so one channel cannot update an installation from
   the other; switching channels requires uninstalling the app first. The production keystore
   signs AABs only as the Play upload key. See [Android app signing](https://developer.android.com/studio/publish/app-signing).

### Manual Upload For Each Release

1. In GitHub, open **Actions → Release** and check the `build-native` summary for the release tag
   to find the archived AAB path on the build machine.
2. Copy the archived directory (containing `cherry-studio-<release-version>-android.aab` and
   `SHA256SUMS`) from the Mac release archive to your workstation.
3. From that directory, verify the checksum with `shasum -a 256 -c SHA256SUMS` on macOS
   or `sha256sum --check SHA256SUMS` on Linux.
4. Sign in to Play Console with your own Google account, open this app and the intended release
   track, and upload the `.aab` file to a release. Upload the AAB itself, not the GitHub APK.
5. Complete the release notes and required declarations, resolve Console validation messages,
   then send the changes for review and choose the publication timing there.

Reuse the saved AAB when retrying an upload. Once Play has accepted its version code, finish the
existing release in the Console rather than uploading that version code again.

## Domestic Android Stores

[Release](../../.github/workflows/release.yml) leaves domestic store builds disabled by default;
when needed, `scripts/releaseLocalBuild.ts` supports `--target android-domestic-stores`, which
builds one `production-domestic-stores` APK and archives it separately under
`<tag>/android-domestic-stores/`. The default public APK call and GitHub publishing path remain
independent; the domestic target never publishes to GitHub.
The archive includes the standard `cherry-studio-<version>-android.apk` filename, `SHA256SUMS`,
and `release-manifest.json` with the local build ID, source commit, version/build, package identity,
channel, and signing certificate digest. Keep separate directories from the public APK.

The workflow does not upload, submit for review or poll the stores. The first package containing
the domestic channel and vendor integrations requires a native release; OTA cannot add them to
existing installations. Prerelease tags do not produce the domestic store artifact.

### Manual Domestic Store Upload

1. Open **Actions → Release** for the intended stable tag. Once its domestic build job succeeds,
   download and extract `domestic-stores-release` into a separate directory from `android-release`:
   both artifacts contain an APK with the same filename.
2. From the extracted directory, verify `SHA256SUMS` with `shasum -a 256 -c SHA256SUMS` on macOS or
   `sha256sum --check SHA256SUMS` on Linux. Confirm `release-manifest.json` records the intended source
   commit, app version, package ID, `production-domestic-stores` channel, native version code, and
   signing certificate. Match the package and signing identity to each store's application record,
   and keep the EAS build ID with the release record.
3. Archive the APK, `SHA256SUMS`, and `release-manifest.json` together, for example under
   `<archive-root>/<release-version>/domestic-stores/build-<versionCode>/`. Use the native build
   number from this manifest, which can differ from the public APK's. Archive before the Actions
   artifact expires after 30 days.
4. Open the existing Cherry Studio application in each of HONOR, Xiaomi, OPPO, and vivo. Upload the
   same domestic APK separately to all four; use neither the public APK nor the Play AAB. Complete
   each console's required materials, localized release notes, screenshots, and reviewer access,
   then submit there. Reuse existing listing materials where applicable.
5. Update each store's row in the version's `release-status.md` with the submitted version/build,
   console status, observation time, and link. Track review and actual availability independently;
   when available, record the live version/build. An upload retry uses this same archived APK.

Client queries use the vendor integrations or GitCode as described in
[Domestic Android Store Updates](./domestic-store-updates.md). OPPO checks the GitCode stable
release, so it can announce a newer project version while that version is still under OPPO review.
GitCode publication and build completion do not establish any store's live version; record what
each console actually reports.

## iOS

`build-native` builds the production IPA on the Mac release runner, stages `ios-symbols` locally,
and runs `scripts/verifyIosSymbolPackage.ts` before marking `ios-production` ready. A separate
`submit-ios` job checks `submit-receipt.json` (`check-submit`), verifies the archived IPA checksum
against `ios_production_sha256` and the symbol manifest (`verify-ipa`), re-runs symbol package
verification, and runs `eas submit --platform ios --profile production --path <ipa-path> --non-interactive --wait --no-auto-testflight-setup`.
The workflow does not attach the IPA to a public release.

### Native crash symbols

The production EAS iOS hook runs after archive/export. It stages the original dSYMs, the archive
Info.plist, a manifest with build ID, IPA checksum and image UUIDs, and a verification receipt in
the local `ios/build/ios-symbols` directory before contacting Sentry.

Three targets gate submission: CherryStudio, ExpoWidgetsTarget, and CherryShareExtension. Each
distributed architecture must match the archive, an original dSYM with the same UUID, debug info
and nonzero source-line coverage, and a Sentry Mach-O record with the same UUID, architecture and
`debug` feature. The pinned Sentry CLI and Xcode's DWARF statistics inspect local evidence.
Project and DSN identity are cross-checked when the token can read the project and its client
keys. An unavailable identity scope is recorded in the receipt.

Other frameworks, extensions and dylibs are inventoried separately. Matching available symbols
are submitted best effort after Cherry's remote verification. The release summary lists each
vendor slice as `missing`, `limited`, `debug-present` or `uninspectable`, with its upload result
when applicable. `debug-present` establishes some source-line coverage. Individual frames may
still lack line information. A missing third-party file or rejected third-party upload allows
submission once all three Cherry targets and the downloaded recovery package pass.

The `submit-ios` job verifies the archived `.ipa` checksum and `ios-symbols` directory on the Mac
release runner (matching build identity, manifest and archive checksums, extracted UUIDs,
source-line coverage and remote evidence for the three targets) before calling `eas submit --path`.
Validation failure stops submission. Retention depends on the Mac archive pruning policy (5 newest
stable versions and 1 prerelease; pin a version directory with `.pin` when longer retention is
required).

### Recovery with the same build

If Sentry upload fails or hits the hook deadline after local validation, `releaseLocalBuild.ts`
retains the signed IPA, `build-manifest.json`, and `ios-symbols` (with `upload.pending`) under a
non-`.complete` recovery directory (`<release-root>/cherry-studio-app/<tag>/ios-production/pending-symbols-.../`).
It does not publish `.complete` or allow `submit-ios` until recovery passes. Once Sentry service or
credentials are restored, export the release's `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, and
configured `SENTRY_URL` on the Mac release runner and promote the retained build into a reusable
`.complete` archive without recompiling:

```bash
node --import tsx scripts/releaseLocalBuild.ts recover-ios --pending-dir <pending-dir>
```

Then choose **Re-run failed jobs** in GitHub Actions so `build-native` reuses the recovered
`build-*` archive via `findCompleteBuild` (without incrementing the build number) and `submit-ios`
verifies the IPA and uploads it to TestFlight with `submit-receipt.json`. If submitting manually
outside Actions after recovery, record the receipt on the promoted `<archive-dir>` as well:

```bash
pnpm exec eas submit --platform ios --profile production --path <archive-dir>/<ipa-filename> --non-interactive --wait --no-auto-testflight-setup &&
  node --import tsx scripts/releaseLocalBuild.ts record-submit --build-dir <archive-dir> --build-id <local-build-id> --status succeeded
```

Recovery verifies the retained original dSYMs and their build-bound target fingerprint before
uploading the required dSYMs. It checks Sentry again and writes `ios-symbol-verification.json`.
Preserve that receipt with the release evidence. If the original app dSYMs are
actually missing, recover matching originals first. Rebuilding cannot repair an already shipped
binary's identity.

For the first production acceptance, use the exact candidate IPA and archived dSYMs to resolve
a known project code address to a source file and line for each of the three targets. Verifying
the symbol recovery package is independent of submitting the build to TestFlight.
See [iOS symbol recovery records](../references/ios-symbol-recovery.md) for build 59.

A successful workflow means the upload completed. Apple processing, compliance questions, tester
groups, invitations, and any external beta review remain in App Store Connect. The workflow does
not configure groups or submit the app for an App Store public release.

## Failure Recovery

- On failure, save the job ID, error, and logs. Retry unchanged only for a transient failure; if the
  same error recurs, change the approach instead of retrying again.
- If a publishing job (`publish-github`, `publish-gitcode`, or `submit-ios`) or a partial
  `build-native` run fails, fix its credentials or service error and choose **Re-run failed jobs**
  in GitHub Actions. `build-native` reuses already-complete local archives via `findCompleteBuild`
  for the same tag and commit SHA, and publishing retries verify checksums / `submit-receipt.json`
  without rebuilding succeeded targets.
- Before retrying an interrupted iOS submission, check App Store Connect and the Mac archive's
  `submit-receipt.json`. If Apple already received the IPA, do not upload it again; `submit-ios`
  automatically skips duplicate uploads when `submit-receipt.json` records `succeeded` for the same
  `buildId`.
- Before retrying a manual Google Play upload, check Play Console. If Play already accepted the
  version code, complete the existing release. Otherwise, upload the original archived AAB from the
  Mac release archive again; no new build is needed merely to retry an upload.
- For a domestic store upload retry, check that store's submission first. Resume an accepted
  submission or upload the same archived domestic APK if it was not accepted. Preserve the other
  stores' submissions and record each result separately.
- **Re-run all jobs** reuses complete archived builds for the same tag and commit SHA by default;
  run `releaseLocalBuild.ts build-all --no-reuse` (or remove the archived `build-*` directory) only
  when a fresh native build and incremented build number are intended.
- Local archives keep the 5 newest stable versions and 1 prerelease by default (honoring `.pin`
  files inside version directories). Recover the public APK from the GitHub/GitCode release or the
  Mac archive; recover the Google Play AAB or domestic APK from the Mac archive directory under
  `${RUNNER_RELEASE_ROOT:-$HOME/releases}/cherry-studio-app/<tag>/` (using `release-manifest.json`
  for domestic store builds rather than substituting the public APK).

## Release Status

Keep one `release-status.md` per version outside the repository, with a row for each channel:
GitHub, GitCode, TestFlight internal, TestFlight external, App Store, Google Play, HONOR, Xiaomi,
OPPO, and vivo. Each row
records the version/build, the status in the platform's own wording, when it was observed, and a
link. Update a row whenever its channel changes state. Uploaded, submitted, approved, and available
are different states; record `unknown` rather than inferring one, and do not infer the external
TestFlight result from App Store approval. Open an issue for anything left unfinished after the
release, such as fixes that have not reached `main`.

For domestic store rows, link the archived `release-manifest.json` and keep the submitted
version/build distinct from the observed live version/build. All four submissions share one
artifact identity, but their review and availability states are independent.

## References

- [EAS CI builds](https://docs.expo.dev/build/building-on-ci/)
- [Upload an AAB to Play Console](https://developer.android.com/studio/publish/upload-bundle)
- [EAS iOS submissions](https://docs.expo.dev/submit/ios/)
