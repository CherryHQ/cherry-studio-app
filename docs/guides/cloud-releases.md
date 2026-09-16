# Cloud Releases

Push a version tag such as `v0.1.0` or `v0.1.0-beta.1` to trigger the
[Android release](../../.github/workflows/android-release.yml) and
[iOS TestFlight](../../.github/workflows/ios-release.yml) workflows. Branch pushes do not publish.
The tag's base version must match `expo.version` in `app.json`; update and commit the version before
tagging. The workflows build the tagged source with the EAS `production` profile.

## Required Configuration

| Location | Setting | Purpose |
| --- | --- | --- |
| GitHub Actions secret | `EXPO_TOKEN` | Access to this EAS project's builds and submissions |
| GitHub Actions secret | `GITCODE_TOKEN` | GitCode personal access token with Git push, release, and attachment permissions for `CherryHQ/cherry-studio-app` |
| GitHub Actions | Built-in `GITHUB_TOKEN` | `contents: write` for generating release notes and publishing the GitHub release |
| EAS credentials | Android production keystore | Sign APKs with the existing production identity |
| EAS credentials | iOS production signing and App Store Connect API key | Sign and upload iOS builds without prompts |
| EAS production environment | Build and app environment variables | Includes the production Sentry upload token and configured app services |

Configure the GitCode token in **Settings → Secrets and variables → Actions**. The token owner must
have write access to the target GitCode repository. Tokens are supplied through headers and process
environment variables, never embedded in a Git URL or committed file.

`submit.production.ios.ascAppId` in `eas.json` must identify the App Store Connect app for the
production bundle identifier in `app.json`. Set up its submission API key with
`eas credentials --platform ios` before the first unattended submission. See [local build configuration](./local-builds.md)
for app identities and production environment requirements.

Both workflows pin EAS CLI to `24.4.2`; update them together when upgrading it.

## Android

1. Wait for the exact EAS build started by this run to finish successfully.
2. Download its signed ARM64 APK, check the archive, and generate `SHA256SUMS`.
3. Save the APK, checksums, and generated release notes as the `android-release` Actions artifact
   for 30 days. The filename is `cherry-studio-<app-version>-<Shanghai-date>-android.apk`.
4. Publish the same files and notes through independent GitHub and GitCode jobs.

GitHub prepares a draft, attaches the files, and publishes it automatically. GitCode synchronizes
only the release tag and its reachable commits, creates the release, then uploads its attachments
using the official upload URL API. A GitCode release may be briefly visible before all attachments
are ready. The workflow verifies their contents after upload.

Tags with a prerelease suffix are marked as prereleases on both hosts. Plain version tags publish
regular releases. Neither publishing job replaces an existing attachment with different contents;
a conflicting GitCode tag also fails instead of being force-pushed.

The shared notes describe Android installation and explain that iOS distribution is independent.
Once a TestFlight public invitation link is available, it can be added to both release pages.

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
- Partial Android uploads are resumable. Matching attachments are reused; missing files are uploaded.
  If a file differs, inspect the existing release and use a new version tag for a replacement build.
- GitCode uploads stop if throughput stays below 1 KiB/s for 60 seconds, with a 15-minute limit
  per attempt. Transport failures and temporary HTTP errors are retried up to three attempts with
  fresh upload URLs. Before retrying, the job checks whether the attachment already arrived and
  verifies its checksum. Logs include the filename, attempt, HTTP status, bytes sent, and speed;
  signed URLs and upload headers are not logged.
- Before retrying an interrupted iOS submission, check its EAS submission page and App Store Connect.
  If Apple already received it, do not upload it again. A failed EAS submission can also be retried
  from EAS without building another IPA.
- **Re-run all jobs** creates new EAS builds and increments native build numbers. Use it only when a
  new build is intended. A build job timeout does not cancel the remote EAS build; check EAS first.
- Android publishing retries require the saved Actions artifact. After its 30-day retention expires,
  recover the exact original files from the published release or EAS before publishing manually.

## References

- [EAS CI builds](https://docs.expo.dev/build/building-on-ci/)
- [EAS iOS submissions](https://docs.expo.dev/submit/ios/)
- [GitCode release creation](https://docs.gitcode.com/docs/apis/post-api-v-5-repos-owner-repo-releases/)
- [GitCode attachment uploads](https://docs.gitcode.com/docs/apis/get-api-v-5-repos-owner-repo-releases-tag-upload-url/)
