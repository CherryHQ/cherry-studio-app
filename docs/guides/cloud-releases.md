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

The version's artifact archive is a `<version>/` directory outside the repository, chosen by the
release owner. It holds that version's artifacts (in `build-<native-build-number>/` directories),
the artifact manifest, and the release record. Copy the
[Release Checklist Template](./release-checklist-template.md) to `release-status.md` in that
directory and record the archive path in it. Use that one record throughout preparation, delivery,
and handoff; link other reports to it and share it with whoever takes over the release. Keep
private evidence and account details outside committed documentation. These are execution
procedures, not automated gates in the release workflow.

Before starting a release:

1. Record the tag, source commit, intended channels, completion criteria, and release owner. Carry
   forward decisions and authorization already given in the task; identify only outstanding
   decisions. Preparing the checklist does not authorize additional builds or external actions.
2. Choose local or cloud builds for each artifact using the task's requirements and preferences.
   Record the profile, tool versions, queue budget, and available fallback. A version-tag push
   starts the cloud jobs described above; choosing local builds in this record does not disable
   them. Account for those jobs before pushing a tag or starting a replacement build.
3. Confirm access to each selected channel, signing/upload credentials, and the target repository
   and commit. For GitCode, identify a maintainer with repository write access who will push the
   tag with their own Git credentials and upload through their own agent and authenticated browser
   via Computer Use. Record readiness and credential location, never secret values.
4. Prepare the complete change inventory, curated notes, store descriptions, and asset inventory.
   Record required store locales and screenshots for this release; app translation locales are a
   separate set. Note missing materials before scheduling submission.
5. Assign the checks for the final artifacts: who performs them, their current authorization and
   evidence, and any unverified scope. Build success, screenshots from a development client, and
   store approval do not establish final-package runtime acceptance.

### Before The First Store Submission

Check each store independently. Select the intended version and build, complete the configured
locales and declarations, and confirm that all required screenshots have finished processing.
Record each asset's source, app/client version, locale, device/display, dimensions, and upload
status. Use suitable application captures without test content or development overlays; do not
treat design mockups as application screenshots.

For an existing rejection, map every issue to its code/content resolution, reply, sent-message
evidence, and replacement build. A reply draft remains distinct from a sent reply. Complete the
materials for the selected store before submitting it; another channel's pending review need not
block that submission. Keep internal TestFlight distribution, external beta review, and the
App Store public release as separate rows.

## Required Configuration

| Location | Setting | Purpose |
| --- | --- | --- |
| GitHub Actions secret | `EXPO_TOKEN` | Access to this EAS project's builds and submissions |
| GitHub Actions | Built-in `GITHUB_TOKEN` | `contents: write` for generating release notes and publishing the GitHub release |
| EAS credentials | Android production keystore | Sign GitHub APKs, and sign AABs as the Google Play upload key |
| EAS credentials | iOS production signing and App Store Connect API key | Sign and upload iOS builds without prompts |
| EAS production environment | Build and app environment variables | Includes the production Sentry upload token and configured app services |

GitCode publication belongs to a maintainer with write access to the GitCode repository. The
maintainer pushes the release tag with their own Git credentials, then uses their own agent with
Computer Use to upload and publish through their authenticated browser session. The repository
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
GitCode maintainer pushes the matching tag and uses their own agent through Computer Use to publish
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
   `SHA256SUMS`, and Simplified Chinese title and notes. Record that maintainer as the GitCode owner
   in `release-status.md`.
2. GitCode is not a mirror of GitHub, so each release tag is pushed explicitly. From a checkout
   where the tag points to the source commit, the maintainer checks the GitCode tag:

   ```bash
   git ls-remote --tags https://gitcode.com/CherryHQ/cherry-studio-app.git refs/tags/<tag> 'refs/tags/<tag>^{}'
   ```

   If it is absent, push only the tag and the commits it needs, using the maintainer's own Git
   credentials:

   ```bash
   git push https://gitcode.com/CherryHQ/cherry-studio-app.git refs/tags/<tag>:refs/tags/<tag>
   ```

   If it exists and its peeled commit (`^{}`, or the tag itself for a lightweight tag) matches the
   source commit, continue. If it points elsewhere, stop and leave publication pending; never force
   the tag, push a branch, or publish against a different commit.
3. The maintainer directs their own agent to use Computer Use in their authenticated browser.
   Create or edit the release for that tag, enter the Chinese title and notes, and select the
   appropriate stable or prerelease status.
4. Upload the same APK and `SHA256SUMS` from GitHub. Wait for both attachments to finish uploading
   before publishing. On retry, inspect existing attachments first and retain matching files;
   do not replace an existing attachment with a different build.
5. Confirm the published page has the intended tag, notes, and both attachments. Record the release
   URL, observation time, and completion evidence in the GitCode status row.

### Release Notes And Channel Coverage

First inventory the changes since the previous release, with commit or PR evidence and any upgrade
requirements. Then curate the public notes using **Features / Fixes / Architecture Upgrades**
(**功能 / 修复 / 架构升级** for GitCode). Use a module name and one concise sentence per item; omit
empty sections. Keep detailed implementation evidence in the inventory. Record release-specific
exclusions instead of carrying an old exclusion into every future release.

Use the copy outline and coverage table in the checklist. Track each core feature, named device
capability, and upgrade warning across GitHub English, GitCode Simplified Chinese, configured store
locales, and test notes. Store copy can be shorter, but an intentional omission needs a reason.
When wording changes, revisit the affected channel cells, including already published notes, and
record the confirmed result. A local draft does not establish that a channel has been updated.

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

- At the recorded queue budget, reassess the active job and available fallback. Report the current
  phase, elapsed time, estimate with its basis (or unknown), and next decision time. Reassessment
  does not itself start another build. Track queue time, execution time, and retry gaps separately.
- On failure, save the exact job ID, source commit, profile, error, and relevant logs. An unchanged
  retry needs evidence of a transient failure and a bounded attempt count. If the same error
  recurs, reassess the hypothesis and change the plan before another attempt. A success after
  changing several factors at once does not isolate the cause or validate the original environment.
- Before switching paths, check for still-running jobs and record which one will supply the final
  artifact. Reuse successful artifacts and account for new build numbers. Record the recovery
  change and expected result before retrying; use the local prerequisite check below when relevant.
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

For a local fallback, follow [Before Starting A Local Build](./local-builds.md#before-starting-a-local-build).

## Status And Closeout

Update `release-status.md` whenever a channel changes state. Each row carries its own version/build,
observed status, observation time with timezone, evidence, owner, and next action. Preserve the
platform's wording: uploaded, submitted, approved, and available are different observations.
Use `unknown`, `pending`, or `out of scope` with a reason when appropriate. Do not infer an external
TestFlight result from App Store approval or a publication time from the time it was observed.

Progress updates should explain changes, blockers, remaining estimates, and the next decision.
When a monitoring task ends, distinguish that from artifact delivery or review completion.

Before handing off:

- Record each final artifact's actual commit, build ID/number, profile, checksum, and evidence for
  integrity, signing, and production diagnostic uploads. Reference the artifact manifest for
  details. Keep the public tag unchanged if a recovery build uses a later commit.
- Record the recovery commits and their path back to shared history, with an owner and completion
  condition. Local success does not establish that the recovery is merged or cloud-validated.
- Reconcile the latest channel observations into the status record. Keep earlier snapshots as
  dated evidence and explicitly identify which statuses have been superseded.
- Assign unresolved compatibility warnings, credential gaps, and missing verification evidence.
  Link existing issues or PRs; carry items awaiting issue creation in the handoff. Do not bury
  release-specific unfinished work in the permanent guides.
- State delivery completion and process closeout separately. Every remaining action must have an
  owner, next step, and completion condition; checks owned by the user remain clearly identified.

## References

- [EAS CI builds](https://docs.expo.dev/build/building-on-ci/)
- [Upload an AAB to Play Console](https://developer.android.com/studio/publish/upload-bundle)
- [EAS iOS submissions](https://docs.expo.dev/submit/ios/)
