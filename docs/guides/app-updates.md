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
Other conservative fingerprint inputs, including package versions, `eas.json`, `patches/`, and files
imported by `app.config.ts`, can also require a new package. Only edits confined to application
source, translations, and ordinary assets are OTA candidates; `pnpm update:check <target>` gives
the authoritative answer for the current checkout.

Keep persisted data and migrations compatible with previous working and embedded code: after a
failed launch the client can fall back to older code, which does not undo SQLite or user files.
OTA publication must comply with store review rules and cannot bypass review requirements.

## Distribution Channels

| Build profile and platform | Update channel | EAS environment | Direct APK checks |
| --- | --- | --- | --- |
| `preview`, Android/iOS | `preview` | `preview` | Disabled |
| `production`, Android | `production-apk` | `production` | Enabled |
| `production-google-play`, Android | `production-google-play` | `production` | Disabled |
| `production`, iOS | `production-ios` | `production` | Disabled |
| `development` / `development-simulator` | None | `development` | Opt-in flag |

Platform-specific channels in `eas.json` preserve existing build profile names and release
workflows. GitHub and GitCode distribute the same APK and use `production-apk`. Channels separate
distribution configuration; matching runtime versions additionally enforce native compatibility.

The GitCode whole-APK updater still handles native/public APK upgrades. It compares the installed
version from `expo-application`, rather than an OTA manifest's version, and packaged builds enable
it only on the native channel `production-apk`, which an OTA cannot change. A development client
can opt in with `APK_UPDATES_ENABLED=true`. About, diagnostics, analytics, and backup manifests use
the native version/build. See the [APK update service](../../src/backend/services/appUpdate/README.md).

## One-Time Setup

Use the existing Expo project, authentication, and EAS environments in
[Cloud Releases](./cloud-releases.md), with the pinned release CLI version, currently `24.4.2`.
The OTA Update workflow uses the existing `EXPO_TOKEN` Actions secret.

Run `eas channel:list`, then create any missing channels and their same-named branches:

```bash
eas channel:create preview
eas channel:create production-apk
eas channel:create production-google-play
eas channel:create production-ios
```

Keep `PROFILE`, `APK_UPDATES_ENABLED`, `ANDROID_COMPRESS_NATIVE_LIBS`, and
`EXPO_PUBLIC_STORYBOOK_ENABLED` out of shared EAS environments. Build profiles in `eas.json` own
these values; remote variables can otherwise override publication configuration.
Other service settings and credentials still come from the selected environment. Client/config
values must be readable during both builds and updates; Secret-only values cannot be read by
EAS Update.

Release channels receive updates only on packages from the tag
[release workflow](./cloud-releases.md): EAS records their runtime versions, and the publication
check requires one. Locally built production packages are not recorded and cannot pass it. A development client also needs
rebuilding after adding these native dependencies. Account configuration, native builds,
publication, and device acceptance are separate explicitly authorized actions.

## Publishing

Native releases stay on version tags. OTA publication is a manual GitHub workflow for
JavaScript-only fixes between tags; branch pushes and tags never publish updates.

1. Merge the fix to `main` as usual.
2. Create a hotfix branch from the release tag that installed builds run, cherry-pick only the
   fixes to deliver, and push it. Publishing from `main` would also ship unreleased features:

   ```bash
   git switch -c hotfix/v0.3.0-ota v0.3.0
   git cherry-pick <fix-commit>
   git push -u origin hotfix/v0.3.0-ota
   ```

   Optionally run `pnpm update:check apk` (or `google-play`, `ios`) on the branch first.
3. In GitHub Actions, run [OTA Update](../../.github/workflows/ota-update.yml) with the branch as
   `ref`, the targets (`all` by default), and a message.

The workflow pins the commit, then:

- **Check** lists the commits since the nearest version tag, and rejects a ref that is the tag
  itself. For each target it resolves the runtime fingerprint with the build profile's
  `eas.json` env and requires a finished EAS build on that channel with the same runtime. Any
  failing target stops the run before anything publishes: the change needs a native release.
- **Publish** runs one job per target from the checked commit. It checks again, publishes with the
  pinned CLI, verifies EAS used the checked runtime, uploads that export's source maps to Sentry
  (three attempts), and keeps `dist/` as a 90-day artifact.

The run summary records the commits, receiving app versions and build numbers, runtimes, and update
group IDs. Every update reaches all compatible installations on its channel; there is no staged
rollout or rollback. Fix a bad update by publishing a corrected one. Reverting Git does not change
running clients; only a newly published update does.

If a publish job fails after its update was published (for example, the Sentry upload), re-run
that job: it republishes identical code as a new group and retries the upload. Inspect adoption
and failed installs on the EAS update page.

`scripts/publishUpdate.ts` implements both steps and refuses to publish release channels outside
GitHub Actions. Its fixed targets reject overriding channel, branch, environment, input directory,
JSON output, or platform. Source maps upload through
`eas env:exec production "pnpm exec sentry-expo-upload-sourcemaps dist"`, which needs the existing
`SENTRY_AUTH_TOKEN` readable in the production EAS environment. Preserve native Sentry release/dist
values; filter a group's events by the `ota.update_id`, `ota.channel`, and `ota.embedded` tags. A
backported debug-meta integration fills missing Hermes bundle debug IDs for SDK 7.11. See
[Observability](../../src/frontend/appShell/observability/README.md).

Preview packages are built locally and are not recorded on EAS. Publish to them from a clean
checkout with `pnpm update:preview --message "..."` (both platforms; add `--platform` to select one);
there is no runtime check or source-map upload. Do not republish a preview bundle to production.

## Download Size

SDK 57 supports bundle diffing, explicitly enabled here. EAS serves a patch when available and
sufficiently smaller than the new bundle, and unchanged assets are reused. Patches are not
guaranteed for every update pair or immediately after publication.

The first OTA from an embedded build normally downloads a full JavaScript bundle and missing
assets, **not a full APK or IPA**. Uploading the embedded bundle can enable first-update patches,
but `EAS_UPDATE_EXPERIMENTAL_UPLOAD_EMBEDDED_BUNDLE=1` is experimental on SDK 57 and is not enabled
here. Evaluate it separately; do not claim a fixed reduction percentage.

## Acceptance

Before the first production publish, cover newly built eligible clients on iOS, Google Play, and
public APK:

- Download and activation on the subsequent launch, including offline and interrupted downloads.
- Channel/runtime isolation; Play remains unable to open APK downloads even with an enabled OTA flag.
- No active-chat reload, and retained drafts/history through an update.
- Native version/build display, diagnostic update ID/channel/runtime/embedded-launch status, and
  Sentry source-map matching for the exact published export.
- Actual bytes transferred for a small fix, distinguishing patches from full JavaScript bundles.
  Expo update logs can confirm a successfully applied patch.

Source regressions cover installed-version comparisons and distribution gates. Native activation,
fingerprint parity, and measured savings require authorized builds and device/server
checks; source changes and lint do not establish these outcomes.

## References

- [EAS Update setup](https://docs.expo.dev/eas-update/getting-started/)
- [Runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/)
- [Download strategies](https://docs.expo.dev/eas-update/download-updates/)
- [Bundle diffing](https://docs.expo.dev/eas-update/bundle-diffing/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#software-requirements)
