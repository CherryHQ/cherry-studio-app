# Cloud Releases

Push a version tag such as `v0.1.0` or `v0.1.0-beta.1` to trigger the
[Android release](../../.github/workflows/android-release.yml) and
[iOS TestFlight](../../.github/workflows/ios-release.yml) workflows. Branch pushes do not publish.
Stable tags such as `v0.1.0` also trigger the independent
[Google Play AAB](../../.github/workflows/google-play-release.yml) workflow; prerelease tags do not.
The tag's base version must match `expo.version` in `app.json`; update and commit the version before
tagging. GitHub APK and iOS builds use the EAS `production` profile. Google Play builds use
`production-google-play`, which inherits the production identity, environment, signing credentials,
and automatic native build-number increments, but generates an AAB instead of an APK. Both Android
profiles retain the current ARM64-only device support.

## Required Configuration

| Location | Setting | Purpose |
| --- | --- | --- |
| GitHub Actions secret | `EXPO_TOKEN` | Access to this EAS project's builds and submissions |
| GitHub Actions | Built-in `GITHUB_TOKEN` | `contents: write` for generating release notes and publishing the GitHub release |
| EAS credentials | Android production keystore | Sign GitHub APKs, and sign AABs as the Google Play upload key |
| EAS credentials | iOS production signing and App Store Connect API key | Sign and upload iOS builds without prompts |
| EAS production environment | Build and app environment variables | Includes the production Sentry upload token and configured app services |

Configure the GitCode token in **Settings → Secrets and variables → Actions**. The token owner must
have write access to the target GitCode repository. Tokens are supplied through headers and process
environment variables, never embedded in a Git URL or committed file.

`submit.production.ios.ascAppId` in `eas.json` must identify the App Store Connect app for the
production bundle identifier in `app.json`. Set up its submission API key with
`eas credentials --platform ios` before the first unattended submission. See [local build configuration](./local-builds.md)
for app identities and production environment requirements.

All three workflows pin EAS CLI to `24.4.2`; update them together when upgrading it.

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

1. Wait for the exact EAS build started by this run to finish successfully.
2. Download its signed ARM64 APK, check the archive, and generate `SHA256SUMS`.
3. Save the APK, checksums, and generated release notes as the `android-release` Actions artifact
   for 30 days. The filename is `cherry-studio-<release-version>-android.apk`.
4. Publish the files and notes to GitHub Releases.

GitHub prepares a draft, attaches the files, and publishes it automatically. GitCode releases are
published manually from the matching tag using the same APK, `SHA256SUMS`, and release notes from
the GitHub release.

Tags with a prerelease suffix are marked as prereleases on GitHub. Plain version tags publish regular
releases. The workflow does not replace an existing attachment with different contents.

The shared notes describe Android installation and explain that store distribution is independent.
The APK becomes public when this workflow succeeds; it does not wait for either store's review.
Store links can be added to the release page after the listings are available.

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

1. In GitHub, open **Actions → Google Play AAB** and select the successful run for the release tag.
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

## References

- [EAS CI builds](https://docs.expo.dev/build/building-on-ci/)
- [Upload an AAB to Play Console](https://developer.android.com/studio/publish/upload-bundle)
- [EAS iOS submissions](https://docs.expo.dev/submit/ios/)
