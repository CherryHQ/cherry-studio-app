# Cloud Releases

Push a version tag such as `v0.1.0` or `v0.1.0-beta.1` to trigger
[Release](../../.github/workflows/release.yml). It validates the version and runs
[PR CI](../../.github/workflows/pr-ci.yml) on the tagged commit, then starts the
[Android release](../../.github/workflows/android-release.yml) and
[iOS TestFlight](../../.github/workflows/ios-release.yml) workflows in parallel. Stable tags such as
`v0.1.0` also start the [Google Play AAB](../../.github/workflows/google-play-release.yml) workflow;
prerelease tags do not. Branch pushes do not publish.
The tag's base version must match `expo.version` in `app.json`; update and commit the version before
tagging. Public APK and iOS builds use the existing EAS `production` profile.
Google Play builds use `production-google-play`, which inherits the production identity, environment, signing credentials,
and automatic native build-number increments, but generates an AAB instead of an APK. Both Android
profiles retain the current ARM64-only device support.

## Release Preparation

Releases are built by the workflows above. Copy the
[Release Checklist Template](./release-checklist-template.md) to a `release-status.md` kept outside
the repository, and prepare these materials before pushing the tag:

1. Release notes: GitHub English and GitCode Simplified Chinese, following
   [Release Notes And Channel Coverage](#release-notes-and-channel-coverage).
2. Store materials: descriptions and release notes in every configured store locale, and the
   required screenshots captured from the application (not mockups or development builds).
3. Review replies: if a store rejected the previous submission, a reply for every issue and the
   fix included in this build.
4. GitCode: a maintainer with repository write access to sync and upload the release.

Submit each store only after its materials are complete; another store's pending review does not
block it.

## Required Configuration

| Location | Setting | Purpose |
| --- | --- | --- |
| GitHub Actions secret | `EXPO_TOKEN` | Access to this EAS project's builds and submissions |
| GitHub Actions | Built-in `GITHUB_TOKEN` | `contents: write` for generating release notes and publishing the GitHub release |
| EAS credentials | Android production keystore | Sign GitHub APKs, and sign AABs as the Google Play upload key |
| EAS credentials | iOS production signing and App Store Connect API key | Sign and upload iOS builds without prompts |
| EAS production environment | Build and app environment variables | Includes the production Sentry upload token and configured app services |

GitCode publication belongs to a maintainer with write access to the GitCode repository. The
maintainer uses their own agent with Computer Use to sync the repository mirror, then upload and
publish through their authenticated browser session. The repository
provides no GitCode publishing workflow or upload script; no GitCode automation token is required.
See [GitCode Maintainer Upload](#gitcode-maintainer-upload).

`submit.production.ios.ascAppId` in `eas.json` must identify the App Store Connect app for the
production bundle identifier in `app.json`. Set up its submission API key with
`eas credentials --platform ios` before the first unattended submission. See [local build configuration](./local-builds.md)
for app identities and production environment requirements.

All three workflows and `scripts/publishUpdate.ts` (used by the OTA Update workflow) pin EAS CLI to
`24.4.2`; update them together when upgrading it.

Native releases now embed the EAS Update client. Channels are platform-specific:
`production-apk` for public APKs, `production-google-play` for Play, and `production-ios` for iOS.
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
| Google Play upload archive | `cherry-studio-0.1.0-android.aab` |
| Locally archived iOS package | `cherry-studio-0.1.0-ios.ipa` |

The workflows name the downloaded APK and AAB archives; EAS may use its own internal artifact
names. iOS submission uses the EAS build ID and does not download or rename the IPA. For local
builds, pass the desired filename with `--output` as described in [Local EAS Builds](./local-builds.md).
When retaining multiple builds of one version, keep them in separate `build-<native-build-number>/`
directories. APK and AAB are separate builds and can have different automatically assigned native
build numbers even when they share a release tag.

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
   release URL in the GitCode status row.

### Release Notes And Channel Coverage

List the changes since the previous release, then curate the public notes using
**Features / Fixes / Architecture Upgrades** (**功能 / 修复 / 架构升级** for GitCode), with a module
name and one concise sentence per item; omit empty sections. Store copy can be shorter, but keep
core features and upgrade warnings consistent across GitHub, GitCode, and store locales. When the
wording changes, update every affected channel, including notes that are already published.

## Google Play

The stable-tag workflow builds a signed AAB using `production-google-play` and saves it with
`SHA256SUMS` as the `google-play-release` Actions artifact for 30 days. It does not upload to
Google Play, create a release, or send changes for review. No Google service account or Google
Play API credentials are required; EAS still needs the Android production signing credentials,
`EXPO_TOKEN`, and the production build environment.

The AAB is for manual upload to Play Console, not direct installation on a device. Google Play
generates the installable APKs from it. GitHub Releases continues to provide the directly installable
APK; the AAB is only saved with the workflow run.

### One-Time Console Setup

1. Create the app in Google Play Console for `com.cherryai.cherrystudio_app`, complete the store
   listing and required app-content declarations, and obtain production access if the account
   requires testing first. Select the appropriate testing or production track in Play Console.
2. Keep the Google-generated Play app signing key. Google Play and GitHub APKs are independent
   channels with different signing certificates, so one channel cannot update an installation from
   the other; switching channels requires uninstalling the app first. The production keystore
   signs AABs only as the Play upload key. See [Android app signing](https://developer.android.com/studio/publish/app-signing).

### Manual Upload For Each Release

1. In GitHub, open **Actions → Release** and select the successful run for the release tag.
2. Download the `google-play-release` artifact and extract the ZIP. It contains
   `cherry-studio-<release-version>-android.aab` and `SHA256SUMS`.
3. From the extracted directory, verify the checksum with `shasum -a 256 -c SHA256SUMS` on macOS
   or `sha256sum --check SHA256SUMS` on Linux.
4. Sign in to Play Console with your own Google account, open this app and the intended release
   track, and upload the `.aab` file to a release. Upload the AAB itself, not the artifact ZIP or
   the GitHub APK.
5. Complete the release notes and required declarations, resolve Console validation messages,
   then send the changes for review and choose the publication timing there.

Reuse the saved AAB when retrying an upload. Once Play has accepted its version code, finish the
existing release in the Console rather than uploading that version code again.

## iOS

The build job waits for a production IPA, then passes its exact build ID to a separate submission
job. `eas submit --id ... --wait --no-auto-testflight-setup` uploads it to App Store Connect and
waits for submission completion. The workflow does not attach the IPA to a public release.

A successful workflow means the upload completed. Apple processing, compliance questions, tester
groups, invitations, and any external beta review remain in App Store Connect. The workflow does
not configure groups or submit the app for an App Store public release.

## Failure Recovery

- On failure, save the job ID, error, and logs. Retry unchanged only for a transient failure; if the
  same error recurs, change the approach instead of retrying again.
- If a publishing job fails, fix its credentials or service error and choose **Re-run failed jobs**
  in GitHub Actions. Successful build jobs are reused, so publishing retries use the same APK or
  iOS build ID without a new EAS build.
- Before retrying an interrupted iOS submission, check its EAS submission page and App Store Connect.
  If Apple already received it, do not upload it again. A failed EAS submission can also be retried
  from EAS without building another IPA.
- Before retrying a manual Google Play upload, check Play Console. If Play already accepted the
  version code, complete the existing release. Otherwise, upload the original saved AAB again;
  no new build is needed merely to retry an upload.
- **Re-run all jobs** creates new EAS builds and increments native build numbers. Use it only when a
  new build is intended. A build job timeout does not cancel the remote EAS build; check EAS first.
- Saved Actions artifacts expire after 30 days. Recover the GitHub APK from its published release
  or EAS; recover the Google Play AAB from the exact EAS build recorded in the workflow summary.

## Status And Closeout

Update `release-status.md` whenever a channel changes state: its version/build, the status in the
platform's own wording, when it was observed, and a link. Uploaded, submitted, approved, and
available are different states; record `unknown` rather than inferring one. When the release is
done, bring every channel to its latest state and list anything still unfinished, such as fixes
that have not reached `main`.

## References

- [EAS CI builds](https://docs.expo.dev/build/building-on-ci/)
- [Upload an AAB to Play Console](https://developer.android.com/studio/publish/upload-bundle)
- [EAS iOS submissions](https://docs.expo.dev/submit/ios/)
