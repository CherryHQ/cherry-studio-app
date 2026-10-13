# Application Updates

Cherry Mobile uses `expo-updates` and EAS Update for compatible JavaScript and ordinary asset
changes on iOS, Google Play, and the public APK distributed through GitHub/GitCode. Existing
installations must first install a new native package containing this client. Development and
Storybook disable automatic OTA updates and continue using Metro.

## Startup And Compatibility

The native client checks asynchronously on cold launch, downloads a compatible update, and uses it
on a subsequent cold launch. `fallbackToCacheTimeout: 0` keeps startup from waiting for the network.
There is no application-owned reload call, update dialog, foreground polling, or background task.
Active conversations are not restarted. Offline launches use available downloaded or embedded
code; incomplete downloads do not become runnable updates.

`runtimeVersion.policy: fingerprint` derives compatibility from dependencies, native modules,
configuration, and config plugins. A changed fingerprint requires a new native package before
that runtime can receive updates. Never override a runtime to force compatibility.
`fingerprint.config.js` excludes Expo version/build-number fields because EAS assigns native build
numbers remotely; these numbers do not change the JS/native interface. Permissions, widgets,
extensions, reporting policy, native dependencies, and plugins remain compatibility inputs.
Other conservative fingerprint inputs, including package versions, can also require a new package.

Keep persisted data and migrations compatible with previous working and embedded code: rolling
back JavaScript does not roll back SQLite or user files. OTA publication must comply with store
review rules and cannot bypass review requirements.

## Distribution Channels

| Build profile and platform | Update channel | EAS environment | Direct APK checks |
| --- | --- | --- | --- |
| `preview`, Android/iOS | `preview` | `preview` | Disabled |
| `production`, Android | `production-apk` | `production` | Enabled |
| `production-google-play`, Android | `production-google-play` | `production` | Disabled |
| `production`, iOS | `production-ios` | `production` | Disabled |
| `development` / `development-simulator` | None | `development` | Disabled by default |

Platform-specific channels in `eas.json` preserve existing build profile names and release
workflows. GitHub and GitCode distribute the same APK and use `production-apk`. Channels separate
distribution configuration; matching runtime versions additionally enforce native compatibility.

The GitCode whole-APK updater still handles native/public APK upgrades. It compares the installed
version from `expo-application`, rather than an OTA manifest's version, and packaged builds require
the native channel `production-apk`. An OTA flag cannot enable direct APK downloads on Google Play.
An unconfigured development client can still opt in with `APK_UPDATES_ENABLED=true`. About displays
the native version/build. See the [APK update service](../../src/backend/services/appUpdate/README.md).

## One-Time Setup

Use the existing Expo project, authentication, and EAS environments in
[Cloud Releases](./cloud-releases.md), with the pinned release CLI version, currently `24.4.2`.
EAS Update works with both local and cloud native builds.

Run `eas channel:list`, then create any missing channels and their same-named branches:

```bash
eas channel:create preview
eas channel:create production-apk
eas channel:create production-google-play
eas channel:create production-ios
```

Keep `PROFILE`, `APK_UPDATES_ENABLED`, `ANDROID_COMPRESS_NATIVE_LIBS`, and
`EXPO_PUBLIC_STORYBOOK_ENABLED` out of shared EAS environments. Build profiles and publication
commands own these values; remote variables can otherwise override publication configuration.
Other service settings and credentials still come from the selected environment. Client/config
values must be readable during both builds and updates; Secret-only values cannot be read by
EAS Update.

Build and distribute the first eligible packages using the existing
[local](./local-builds.md) or [cloud](./cloud-releases.md) procedures. A development client also needs
rebuilding after adding these native dependencies. Account configuration, native builds,
publication, and device acceptance are separate explicitly authorized actions.

## Publishing

Publication is manual. Branch pushes and version tags do not publish OTA updates. These package
commands export code and upload it to EAS, fixing native configuration flags to match each build:

```bash
pnpm update:preview --message "Preview chat rendering fix"
pnpm update:apk --message "Fix chat rendering" --rollout-percentage 10
pnpm update:google-play --message "Fix chat rendering" --rollout-percentage 10
pnpm update:ios --message "Fix chat rendering" --rollout-percentage 10
```

The iOS command retains the production profile's APK flag for consistent configuration hashing;
iOS always disables the APK updater. Preview targets both platforms; add `--platform` to select
one. Do not override fixed production channels, environments, platforms, or export directories.
Packages built with custom native settings require the same settings during publication.

Preview and production have different identities and native reporting modules. Preview checks
its own runtime; do not republish that bundle directly to production. Publish production from
reviewed source using the corresponding command and a small initial rollout. Record the source
commit, group ID, channel, platform, and runtime.

After **each production publish**, upload the exact export's JavaScript source maps before another
export replaces `dist`:

```bash
PROFILE=production eas env:exec production "pnpm exec sentry-expo-upload-sourcemaps dist"
```

This uploader is already provided by `@sentry/react-native`. Supply the existing `SENTRY_AUTH_TOKEN`
with readable visibility in the production environment; the Sentry plugin identifies the project.
Preview does not upload reporting artifacts. Preserve native Sentry release/dist values. The
JavaScript event filter fills missing Hermes bundle debug IDs for SDK 7.11 while preserving SDK
matches; both Android and iOS bundle filenames survive its privacy filter. If an upload fails,
retain `dist`, retry that upload, and keep the rollout limited until matching debug IDs are confirmed.
See [Observability](../../src/frontend/appShell/observability/README.md).

## Rollout And Recovery

Inspect adoption, failed installs, runtime compatibility, and download sizes on the EAS update
details/deployment page. Increase or cancel the rollout there after acceptance.
To roll back a failed update group with the release CLI:

```bash
eas update:rollback <failed-update-group-id> --platform android
```

Use `--platform ios` for iOS. Inspect the group's branch, channel, platform, and runtime first. The
CLI republishes the previous group on the source branch/runtime, or creates an embedded rollback
directive when no previous group exists. Without a group argument, the command offers an
interactive choice of published or embedded code. Retain known working group IDs. Rollback takes
effect through update checks/relaunches; reverting Git does not roll back running clients.
Native recovery is not guaranteed to detect every application error.

## Download Size

SDK 57 supports bundle diffing, explicitly enabled here. EAS serves a patch when available and
sufficiently smaller than the new bundle, and unchanged assets are reused. Patches are not
guaranteed for every update pair or immediately after publication.

The first OTA from an embedded build normally downloads a full JavaScript bundle and missing
assets, **not a full APK or IPA**. Uploading the embedded bundle can enable first-update patches,
but `EAS_UPDATE_EXPERIMENTAL_UPLOAD_EMBEDDED_BUNDLE=1` is experimental on SDK 57 and is not enabled
here. Evaluate it separately; do not claim a fixed reduction percentage.

## Acceptance

Before production rollout, cover newly built eligible clients on iOS, Google Play, and public APK:

- Download and activation on the subsequent launch, including offline and interrupted downloads.
- Channel/runtime isolation; Play remains unable to open APK downloads even with an enabled OTA flag.
- No active-chat reload, and retained drafts/history through update and rollback.
- Staged rollout and rollback for the same runtime, including persisted-data compatibility.
- Native version/build display, diagnostic update ID/channel/runtime/embedded-launch status, and
  Sentry source-map matching for the exact published export.
- Actual bytes transferred for a small fix, distinguishing patches from full JavaScript bundles.
  Expo update logs can confirm a successfully applied patch.

Source regressions cover installed-version comparisons and distribution gates. Native activation,
fingerprint parity, rollout/rollback, and measured savings require authorized builds and device/server
checks; source changes and lint do not establish these outcomes.

## References

- [EAS Update setup](https://docs.expo.dev/eas-update/getting-started/)
- [Runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/)
- [Download strategies](https://docs.expo.dev/eas-update/download-updates/)
- [Bundle diffing](https://docs.expo.dev/eas-update/bundle-diffing/)
- [Rollbacks](https://docs.expo.dev/eas-update/rollbacks/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#software-requirements)
