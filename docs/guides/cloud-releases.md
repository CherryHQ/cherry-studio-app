# Native Releases

## 1. Prepare on the maintainer workstation

1. Choose the intended `main` commit and review the changes since the previous release. Update
   `expo.version` in `app.json` through a version PR, merge it, and push the matching `v<version>`
   tag on that commit. Do not commit release notes to the repository; the
   [Release workflow](../../.github/workflows/release.yml) validates the tag against `app.json` and
   runs [CI](../../.github/workflows/pr-ci.yml) on GitHub-hosted runners.
2. In the workstation's version directory outside the repository, prepare:
   - `release-notes-en.md` and `release-notes-zh-CN.md`, following
     [Release Notes And Channel Coverage](#release-notes-and-channel-coverage).
   - Store descriptions, localized update notes, screenshot assets, operations update HTML, any
     replies to previous rejections, and `release-status.md`. Reuse accurate store materials and
     capture changed screenshots from the app.

## 2. Build and stage deliverables on Mac Studio

The tag dispatches the remaining jobs to the shared `[self-hosted, macOS, ARM64, release]`
runner. Android builds the public APK followed by the stable-only Play AAB. iOS builds in
parallel. Each delivery job consumes its own verified archive for the tagged commit and **stages**
deliverables without making public announcements yet.

| Channel | Mac Studio job | Staged result |
| --- | --- | --- |
| GitHub | `stage-github` | Stages the signed ARM64 APK and `SHA256SUMS` to a GitHub Draft Release (keeps existing published notes/status on retry). |
| GitCode | `stage-gitcode` | Stages the identical APK and checksum to a GitCode `pre` release (never promotes to `latest`, so update checks do not announce it yet). |
| Google Play | `submit-google-play` (stable tags) | Uploads the verified `production-google-play` AAB to a production-track draft. |
| TestFlight / App Store | `submit-ios` | Verifies the `production` IPA and its debug symbols and uploads it to App Store Connect. Both destinations use that build. |
| HONOR / Xiaomi / OPPO / vivo | Disabled | Record these channels as out of scope. |

Each successful target can proceed independently. Use the run summary to identify the exact
archive directory, build number, and checksum for each target, and record the run link in the
workstation's `release-status.md`.

## 3. Publish and complete store submission from the maintainer workstation

1. **Publish GitHub and GitCode** with the prepared bilingual notes once Mac Studio finishes
   staging:

   ```bash
   pnpm release:publish \
     --tag v<version> \
     --en-notes /path/to/release-notes-en.md \
     --zh-notes /path/to/release-notes-zh-CN.md
   ```

   This validates both Markdown files locally and dispatches
   [Publish Release](../../.github/workflows/publish-release.yml) on GitHub-hosted `ubuntu-latest`
   runners using repository secrets (the workstation needs `gh` auth, not `GITCODE_TOKEN`). The
   workflow verifies that both staged releases already contain `cherry-studio-<version>-android.apk`
   and valid `SHA256SUMS`, writes the English notes and publishes the GitHub draft, and writes the
   Chinese notes and promotes stable GitCode releases to `latest`. Pass `--target github` or
   `--target gitcode` (or run **Actions → Publish Release** in the browser) to publish one site or
   revise published notes later without rebuilding.
2. **Complete Apple distribution:** Once Apple finishes processing the uploaded build, match the
   version and build number in App Store Connect. Confirm availability in the intended internal
   TestFlight group. For external testing, assign the group and complete beta review submission when
   required. For a public App Store release, select that same build, apply the prepared localized
   notes and required declarations, confirm the release settings, and submit for App Review.
3. **Complete Google Play distribution:** Open the production draft with the AAB's version code.
   Apply the prepared localized notes and required declarations, confirm the target countries and
   rollout settings, then send the changes for review. Check **Publishing overview** for the
   resulting state.
4. **Close the release operation** when both download sites are public with the intended notes and
   identical files, the intended internal testers can access the build, and each in-scope external
   beta or store release is available or has a platform review receipt. Record the observed states,
   time, build numbers, evidence links, and any pending platform decisions in
   [Release Status](#release-status). A draft, a GitCode `pre` stage, an upload still processing, a
   rejection requiring action, or a missing receipt leaves that channel open. After approval,
   perform any required manual release or rollout and record availability separately when the
   platform confirms it for the intended audience.

## Required Configuration

| Location | Setting | Purpose |
| --- | --- | --- |
| GitHub Actions secret | `EXPO_TOKEN` | Access to this EAS project's credentials, auto-incremented native versions, Google Play draft submissions, and iOS submissions |
| GitHub Actions secret | `GITCODE_TOKEN` | `stage-gitcode` attachment staging and `publish-gitcode` release publication |
| GitHub `local-release` environment | Production build secrets (7 variables) | Injected at runtime into `build-native` without persisting plaintext secrets on the Mac runner |
| GitHub Actions | Built-in `GITHUB_TOKEN` | `contents: write` for staging draft assets (`stage-github`) and publishing the GitHub release (`publish-github`) |
| EAS credentials | Android production keystore | Sign GitHub APKs, and sign AABs as the Google Play upload key |
| EAS credentials | Google Service Account Key for Play Store Submissions | Upload Google Play production drafts for `com.cherryai.cherrystudio_app` without persisting JSON keys on the runner |
| EAS credentials | iOS production signing and App Store Connect API key | Sign and upload iOS builds without prompts |

`stage-gitcode` and `publish-gitcode` call the GitCode v5 REST API directly from
`scripts/publishGitcodeRelease.ts` using `GITCODE_TOKEN` (and optional repository variables
`GITCODE_API_URL`, `GITCODE_OWNER`, `GITCODE_REPO`). If the GitCode repository mirror has not yet
synced the tagged commit when `stage-gitcode` runs, sync the mirror and re-run the failed
`stage-gitcode` job.

`submit.production-google-play.android` in `eas.json` targets `com.cherryai.cherrystudio_app` on
the `production` track with `releaseStatus: "draft"`. Its Google Service Account JSON key is stored
in EAS Credentials via `eas credentials --platform android` so no service account JSON is stored on
the Mac runner or in repository files.

`submit.production.ios.ascAppId` in `eas.json` must identify the App Store Connect app for the
production bundle identifier in `app.json`. Set up its submission API key with
`eas credentials --platform ios` before the first unattended submission. See [local build configuration](./local-builds.md)
for app identities and production environment requirements.

`package.json` (`devDependencies["eas-cli"]`), `eas.json` (`cli.version`), and `scripts/publishUpdate.ts`
(used by the OTA Update workflow) pin EAS CLI to `24.4.2`; update them together when upgrading it.

Native releases now embed the EAS Update client. Channels are platform-specific:
`production-apk` for public APKs, `production-google-play` for Play,
`production-domestic-stores` for domestic stores, and `production-ios` for iOS.
This tag workflow delivers native packages. JavaScript-only fixes between tags are published by the
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

Mac Studio archives each signed file with `SHA256SUMS` and `build-manifest.json` under
`${RUNNER_RELEASE_ROOT:-$HOME/releases}/cherry-studio-app/<tag>/<target>/`. Use the exact
`build-*` directory in the build summary. The manifest records the commit, channel, local build
ID, native build number, filename and checksum. Different channels can have different native
build numbers for one version. Keep those identities when retaining packages on the workstation.

## Public Android downloads

`stage-github` and `stage-gitcode` verify the archived APK and `SHA256SUMS` before staging a
GitHub draft and a GitCode `pre` release. Retries retain matching attachments and existing release
copy/status. Then [Publish Release](../../.github/workflows/publish-release.yml) verifies that the
staged APK and `SHA256SUMS` are present before applying the prepared notes, publishing the GitHub
draft, and promoting stable GitCode releases to `latest` (skipping `latest` promotion if a newer
stable release is already `latest`). The public APK checks GitCode in China or when the network
region is unknown, and GitHub in the global region. Each source must be published with both the
APK and `SHA256SUMS` for its update path to work.

### Release Notes And Channel Coverage

Start each file with the version title. Use `## Download and Installation` (English) or
`## 下载安装` (Simplified Chinese) as its final section heading. The in-app update dialog strips the
title and download section, so put all user-facing changes before that heading. Describe the same
user-facing changes and upgrade guidance in both languages. List the changes since the previous
release, then curate the public notes in this outline. Use a module name and one concise sentence
per item, and omit empty sections. GitCode uses `功能`, `修复`, `架构升级`, `升级提醒`, and ends
with `## 下载安装`.

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
notes that are already published (`pnpm release:publish --tag v<version> ...` can re-run to update
GitHub and GitCode notes).

## Google Play

The `build-native` job on stable tags builds a signed AAB using `production-google-play` after
`android-public` finishes and archives it with `SHA256SUMS` on the Mac release runner under
`${RUNNER_RELEASE_ROOT:-$HOME/releases}/cherry-studio-app/<tag>/android-google-play/`. On stable
tags when `android_google_play_ready` is `true`, the separate `submit-google-play` job checks
`submit-receipt.json` (`check-submit`), verifies the archived `.aab` against `SHA256SUMS` and
`android_google_play_sha256`, runs `eas submit --platform android --profile production-google-play --path <aab-path> --non-interactive --wait`,
and writes `submit-receipt.json` (`record-submit`). Because `eas.json` sets `track: "production"`
and `releaseStatus: "draft"`, this AAB is uploaded as a production draft and is not distributed
to users; maintainers complete release notes, review submission, and rollout for this release in
Google Play Console. Because `changesNotSentForReview` stays at its default `false`, check
**Publishing overview** in Play Console first if other app changes are already pending review or
rejected.

The AAB is for Google Play Console distribution, not direct installation on a device. Google Play
generates the installable APKs from it. GitHub Releases continues to provide the directly installable
APK; the signed AAB remains retained in the build machine's local release archive.

### One-Time Console Setup

1. Create the app in Google Play Console for `com.cherryai.cherrystudio_app`, complete the store
   listing and required app-content declarations, and ensure at least one AAB has been uploaded in
   Play Console (Google Play API submissions require an initialized app record).
2. Keep the Google-generated Play app signing key. Google Play and GitHub APKs are independent
   channels with different signing certificates, so one channel cannot update an installation from
   the other; switching channels requires uninstalling the app first. The production keystore
   signs AABs only as the Play upload key. See [Android app signing](https://developer.android.com/studio/publish/app-signing).
3. In a company Google Cloud project, enable the **Google Play Android Developer API**
   (`androidpublisher.googleapis.com`) and create a dedicated service account with no GCP project
   roles and a JSON key. In Google Play Console under **Users and permissions**, invite that service
   account with empty account-level permissions and app-level permissions scoped only to
   `com.cherryai.cherrystudio_app` (view app information + release to production). Upload the JSON
   key to EAS Credentials under `Google Service Account Key for Play Store Submissions` with
   `eas credentials --platform android`.

If a prior Play change blocks the upload, resolve its status in Play Console and retry the
failed runner job. Once Play accepts the version code, complete its existing draft on the
workstation as described in step 3.

## Domestic Android Stores

Domestic distribution is paused. The reserved `production-domestic-stores` profile uses its own
channel and disables APK self-installation. Its package, store-specific review states and live
versions are independent of the public APK. See [Domestic Android Store Updates](./domestic-store-updates.md).

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
submission once all three Cherry targets and the archived recovery package pass.

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
verifies the IPA and uploads it to TestFlight with `submit-receipt.json`.

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
- If a staging or submission job (`stage-github`, `stage-gitcode`, `submit-google-play`, or
  `submit-ios`) or a partial `build-native` run fails, fix its credentials or service error and
  choose **Re-run failed jobs** in GitHub Actions. `build-native` reuses already-complete local
  archives via `findCompleteBuild` for the same tag and commit SHA, and staging retries verify
  checksums / `submit-receipt.json` without rebuilding succeeded targets.
- If **Publish Release** fails for one site after the other succeeded, rerun
  `pnpm release:publish --tag v<version> --target github|gitcode ...` (or re-run the failed job in
  **Actions → Publish Release**) without re-staging binaries.
- Before retrying an interrupted iOS submission, check App Store Connect and the Mac archive's
  `submit-receipt.json`. If Apple already received the IPA, do not upload it again; `submit-ios`
  automatically skips duplicate uploads when `submit-receipt.json` records `succeeded` for the same
  `buildId`.
- Before retrying an interrupted Google Play draft upload, check Play Console and the Mac archive's
  `submit-receipt.json`. `submit-google-play` skips duplicate uploads only when the local archive's
  `submit-receipt.json` records `succeeded` for the same `buildId`. If `submit-google-play` was
  interrupted after Play accepted the AAB but before `record-submit` wrote the receipt, inspect the
  EAS submission details from the job logs and verify the Play Console production draft's package ID
  and `versionCode`; once confirmed, record the receipt on the Mac runner
  (`node --import tsx scripts/releaseLocalBuild.ts record-submit --build-dir <archive-dir> --build-id <build-id> --status succeeded`)
  before choosing **Re-run failed jobs** (or finish the existing draft release directly in Play
  Console). Otherwise, fix any Play Console permission or pending-edit issue and choose
  **Re-run failed jobs** for `submit-google-play`.
- **Re-run all jobs** reuses complete archived builds for the same tag and commit SHA by default;
  keep the original build and receipt when retrying delivery.
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

Record separate dates for completion of the release operation and confirmed availability.
The workflow summary and Mac archive identify what was built and uploaded. The download sites,
tester groups and store consoles establish what their users can access.

## References

- [Local EAS builds](https://docs.expo.dev/build-reference/local-builds/)
- [Upload an AAB to Play Console](https://developer.android.com/studio/publish/upload-bundle)
- [EAS Android submissions](https://docs.expo.dev/submit/android/)
- [EAS iOS submissions](https://docs.expo.dev/submit/ios/)
