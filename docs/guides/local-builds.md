# Local EAS Builds

Use `pnpm build:local` to create an Android or iOS installation package on your machine. It runs
`eas build --local`, defaults to the `development` profile, and forwards EAS build arguments.
`pnpm install` also generates the document preview page through the `postinstall` script of
[`@cherrystudio/file-preview-webview`](../../packages/file-preview-webview/README.md); EAS installs
dependencies the same way, so no separate build hook is needed.

| Build profile | Outbound reporting (Sentry / Observe / Insights) | Sentry source-map, R8 mapping, source-context, and debug-symbol uploads |
| --- | --- | --- |
| `development` / `development-simulator` | Disabled | Disabled |
| `preview` | Disabled | Disabled |
| `production` / `production-google-play` | Enabled per service registry; Sentry additionally requires a DSN and current user consent | Enabled for Sentry; requires an upload token |

The shared [reporting registry](../../src/frontend/appShell/observability/reportingServices.json)
owns per-service build flags. Sentry uses immutable native metadata and rejects debug binaries.
The reporting autolinking plugin excludes Observe and Insights from non-production native projects,
including their automatic startup and background senders. Those builds also omit local Observe
metrics. Changing native reporting policy requires a new installation package. See [Observability](../../src/frontend/appShell/observability/README.md).

## Prerequisites

- Install the repository dependencies with Node.js 24 and `pnpm@12.2.1`.
- Install EAS CLI (`pnpm add --global eas-cli`) and authenticate with `eas login`, or provide
  `EXPO_TOKEN` in the process environment.
- Install the native build tools for the selected platform: Xcode, CocoaPods, and fastlane for
  iOS; the Android SDK and NDK for Android.

`pnpm-workspace.yaml` allows the `@sentry/cli` installation script so Sentry's upload executable is
available to native builds. It uses the platform package when available and can download the
binary as a fallback.

Local EAS builds still contact Expo for project information and managed signing credentials. They
do not use Expo's cloud build workers. See the
[Expo local build guide](https://docs.expo.dev/build-reference/local-builds/) for platform requirements
and limitations.

## App Variants

`app.json` holds the production defaults. `app.config.ts` selects the app identity using `PROFILE`,
which the EAS build profiles already set. The `development-simulator` profile inherits the
development identity. An unset `PROFILE` defaults to production; unknown values are rejected.

| EAS profile | App name | iOS / Android ID suffix | URL scheme |
| --- | --- | --- | --- |
| `development` | Cherry Studio Dev | `.dev` | `cherrystudio-dev` |
| `preview` | Cherry Studio Preview | `.preview` | `cherrystudio-preview` |
| `production` / `production-google-play` | Cherry Studio | none | `cherrystudio` |

`production-google-play` inherits `PROFILE=production`. It changes Android's artifact format to
AAB without adding an app identity or runtime environment, and explicitly disables APK update
checks. The existing `production` profile creates public Android APKs with GitCode update checks
and iOS IPAs with this feature disabled. Public APKs are published to GitHub and mirrored to GitCode.

The base IDs are `com.cherryai.cherrystudio-app` (iOS) and
`com.cherryai.cherrystudio_app` (Android). Widget identifiers and iOS App Groups follow the selected
variant. Each variant has independent app data; existing installations retain their previous identity
and their data is not automatically migrated to apps using the new IDs.

The `dev`, `start`, Storybook, `ios`, and `android` scripts select `PROFILE=development`. The `prebuild`
script also defaults to development, while preserving an explicitly set `PROFILE` (for example,
`PROFILE=preview pnpm prebuild --clean`). For preview or production, use direct Expo commands with the
same explicit `PROFILE` when building or starting Metro. When switching variants with existing generated
`ios` or `android` directories, regenerate them with `PROFILE=<profile> pnpm exec expo prebuild --clean`
before building; this replaces generated native projects, including any manual native edits.

These identity changes require new native builds. Each iOS variant needs
matching Apple app identifiers, widget identifiers, App Groups, and provisioning profiles. The EAS
project ID stays unchanged. Before production submission, check that `submit.production.ios.ascAppId`
in `eas.json` points to an App Store Connect app matching the new production bundle identifier.

## APK Update Distribution

Only Android builds with `APK_UPDATES_ENABLED=true` show Check for updates in Settings and About.
The app checks in the background after startup. The row reads that result and shows `NEW` for a newer
APK, with no description; tapping it asks for confirmation before opening the browser download.
`production` sets this flag, while `production-google-play` explicitly overrides
it with `false`. Development and preview default to disabled. iOS always
hides the feature, regardless of the flag. Disabled builds also reject detection and download calls.

The value is parsed into the boolean `extra.isApkUpdatesEnabled` by `app.config.ts`; it is not a user
preference or remote toggle. Only `true` and `false` are accepted; an unset value defaults to `false`.
GitCode is the fixed update source. Keep store profiles disabled and never upload the public APK as
a store artifact. Future Android store profiles must explicitly set `APK_UPDATES_ENABLED=false`, as
`production-google-play` does. For an explicitly authorized Android development session exercising
this feature, supply `APK_UPDATES_ENABLED=true` to Metro.
The local build wrapper's default remains development.

## Sentry Environment Variables

Development and preview builds do not need Sentry credentials. `app.config.ts` omits the Sentry
Expo plugin for these profiles, so their generated native projects have no Sentry upload hooks.
Runtime initialization also checks the profile; supplying a DSN does not enable their reporting.

For production monitoring, add these entries to the repository-root `.env.local`, filling in the
values for the Sentry project configured in `app.json`:

```dotenv
EXPO_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

- `EXPO_PUBLIC_SENTRY_DSN` is the public event-ingestion address embedded in the app. Reporting is
  enabled only for the production profile, with a DSN, current diagnostics consent, and outside
  development mode (`__DEV__`). Users enable reports in Settings → Privacy settings → Send anonymous
  error reports. Native consent/filtering changes require a new installation package; an OTA update
  cannot add `modules/crash-reporting` to an existing client.
- `SENTRY_AUTH_TOKEN` is a build-only credential used to upload source maps and debug symbols.
  Use a token with the source-map upload permissions for the configured Sentry project. Do not
  prefix it with `EXPO_PUBLIC_` or add it to app config.

The wrapper uses Node's env-file loader before starting EAS. Existing shell environment variables
take precedence over `.env.local`, which takes precedence over `.env`. Missing files are allowed;
values must be literal because Node's loader does not expand references such as `${OTHER_VAR}`.
The loaded variables are inherited by the local build process. `.env` and `.env.local` remain
excluded from Git and the EAS source archive; do not remove those ignore rules to pass credentials.
The wrapper does not load profile-specific files such as `.env.production.local`.

Choose local values for the intended build profile, or export them from your credential manager
before running the command. EAS also resolves its selected environment; variables with **Secret**
visibility must be supplied locally for local builds. Cloud release builds continue to use the
EAS `production` environment described in the
[observability module](../../src/frontend/appShell/observability/README.md).

## Build Commands

Build one platform at a time. Both commands default to the development client:

```bash
pnpm build:local --platform android
pnpm build:local --platform ios
```

Pass `--output /absolute/path/to/cherry-studio-0.1.0-android.apk` or
`--output /absolute/path/to/cherry-studio-0.1.0-ios.ipa` to choose the artifact location. Use the
release version without a leading `v` or date; preserve a prerelease suffix when one is specified.
The local wrapper does not generate filenames or archive directories automatically. For an iOS
simulator package, select `--profile development-simulator`; that profile produces a simulator
artifact rather than an IPA for a physical device.

To create a standalone preview package, select the existing preview profile:

```bash
pnpm build:local --platform android --profile preview
pnpm build:local --platform ios --profile preview
```

Preview and development bundles do not report to Sentry, even when the native dependency and a DSN
are present. Production profiles are never the wrapper's default. Use `--profile production` for
production iOS builds. When a public APK release is explicitly requested, enable its update path:

```bash
pnpm build:local --platform android --profile production --output /absolute/path/to/cherry-studio-0.1.0-android.apk
```

When a Google Play release build is explicitly requested, use its separate AAB profile:

```bash
pnpm build:local --platform android --profile production-google-play --output /absolute/path/to/cherry-studio-0.1.0-android.aab
```

Google Play requires an AAB for a new app; renaming an APK does not convert its format. See
[Cloud Releases](./cloud-releases.md) for the independent GitHub APK, Google Play AAB build,
and iOS upload workflows and their signing requirements. Google Play AABs are uploaded manually
in Play Console; no Google service account is needed.

For production monitoring, provide a valid upload token and keep automatic uploads enabled. Do not
set `SENTRY_DISABLE_AUTO_UPLOAD` or `SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD` for a distributable
production build. Either one skips the Android R8 mapping, JVM source bundle, and native symbol
uploads; the first also skips JavaScript source maps. Missing or invalid upload credentials fail
the upload tasks.

EAS deletes a build's working directory when the build ends, so artifacts that were not uploaded
cannot be recovered later. Large uploads can be interrupted by the network. For a local production
build, keep the working directory and let failed uploads warn instead of failing the build, so a
retry does not use another build number:

```bash
EAS_LOCAL_BUILD_SKIP_CLEANUP=1 EAS_LOCAL_BUILD_WORKINGDIR=/absolute/path/to/workdir \
SENTRY_ALLOW_FAILURE=true pnpm build:local --platform android --profile production --output /absolute/path/to/app.apk
```

Before distributing that package, check the build log for upload warnings. If any upload failed,
re-run the same Gradle command in `<workdir>/build/android` through
`eas env:exec production --non-interactive "PROFILE=production NODE_ENV=production EAS_BUILD=true EAS_BUILD_WORKINGDIR=<workdir>/build ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a"`
(`:app:bundleRelease` for the AAB), without `SENTRY_ALLOW_FAILURE`, until it succeeds. The R8
mapping ID is derived from the mapping contents and the JavaScript debug ID from the bundle, so the
retry uploads artifacts that match the package already produced. Cloud builds keep no working
directory: do not set `SENTRY_ALLOW_FAILURE` for them.

Android production APKs and Google Play AABs enable R8 code optimization, obfuscation, and resource
shrinking. Development and preview keep R8 disabled. The production-only
`scripts/withAndroidReleaseOptimization.js` plugin selects `proguard-android-optimize.txt`;
`extraProguardRules` preserves source filenames and line information, and keeps Expo's `@Field`
and `@Required` record annotations: Expo converts records without introspection data by
reflection, and renamed annotations make those native calls reject their arguments. A local Expo
module that adds a dependency missing optional classes ships its own `consumerProguardFiles`
rules. R8 failures appear only when the affected native call runs, so a Release build must exercise
record-typed calls such as attaching a PDF to a chat, not just start. Sentry's Android Gradle
plugin uploads each build's `mapping.txt`, JVM source bundle (including local Expo modules), and
available native debug symbols/sources. Its embedded debug identifiers associate reports with
that build's artifacts; JavaScript source maps continue through the existing Sentry Metro/Gradle
integration. Keep the SDK's native release/dist values instead of overriding them in JavaScript.

The APK profiles set `useLegacyPackaging` to compress native `.so` libraries for direct downloads.
Android extracts those libraries during installation, so a smaller APK does not mean less installed storage
or a faster startup. The `production-google-play` profile sets `ANDROID_COMPRESS_NATIVE_LIBS=false`
so the AAB keeps uncompressed libraries: Google Play compresses the download itself, and compressed
libraries in an AAB only slow installation and double on-device storage. Development builds keep
uncompressed native libraries. The EAS Release commands pass `-Xmx4096m` as the Gradle JVM
arguments, which also drops the template Metaspace cap that made `lintVitalAnalyzeRelease` fail on
local production builds. After changing native dependencies or packaging options, verify that a
Release build starts and completes desktop QR pairing. Compare APK sizes using the same profile and
architecture.

Rebuild the native client after adding or changing native dependencies such as Sentry. Starting
Metro again does not add a native module to an already installed client. Local and cloud EAS builds
generate native projects from the selected profile because `.easignore` excludes `ios` and `android`.
When using direct Expo builds with existing native folders, follow the
[app-variant regeneration instructions](#app-variants) after switching profiles;
removing a plugin from app config does not clean its hooks out of an existing native project.

Successful compilation alone does not verify production Sentry event delivery or source-map
matching; those require a separate runtime check.

## Tablet Device Configuration

`app.json` enables iPad support and all iPad orientations while retaining iPhone portrait behavior.
`scripts/withTabletOrientation.js` writes Android orientation resources during native generation:
phones use portrait, while `values-sw600dp` lets the system choose; the activity remains resizable.
Rebuild the development client to receive these native changes. They cannot be delivered by a
JavaScript update alone.

## Expo 57 Dependency Baseline

The project uses Expo 57.0.24 and React Native 0.86.3, which includes Hermes V1
250829098.0.17. This contains the upstream fixes for the Worklets/Reanimated memory regression
and slow development startup. See the [Expo SDK 57 release notes](https://expo.dev/changelog/sdk-57#known-regressions).
Existing development clients must be rebuilt to receive the engine update.

`expo-build-properties` enables iOS scene support for Xcode 27 builds. Expo 57.0.23 and newer
provide the scene runtime, and a new native build is required to avoid the iOS 27 launch assertion.
See [Expo's SDK 57 scene migration guide](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27).

Keep the version-specific patches for Expo Router, Calendar, Notifications, Image Picker, App Metrics,
Observe, Widgets, React Native, Screens, Reanimated, Metro, and Metro Runtime when updating dependencies.
The upgraded patched direct dependencies use exact versions so an unrelated install cannot select
a newer unpatched release.
Metro 0.84.5 is selected by Expo's Metro dependency; its patches support the existing Worklets Bundle
Mode integration.

`react-native-streamdown` requires Bundle Mode and the `remend` import forwarding configured in
Babel. Keep those settings when updating Hermes. Worklets 0.10.2 remains within Reanimated 4.5's
supported 0.10.x range; removing the experimental mode requires a separate change to streaming
Markdown processing.

Android builds compile `expo-image-picker`, `expo-notifications`, `expo-app-metrics`, and `expo-observe` from source through
`expo.autolinking.android.buildFromSource` in `package.json`, so their native patches are included
instead of using Expo's precompiled binaries. Observe's source build requires App Metrics to be
available as a Gradle project, so both must build from source. The App Metrics patch retains the main session's
JavaScript wrapper; its transitive dependency version is pinned in `pnpm-workspace.yaml`.

### iOS Text Measurement Cache Patch

Expo SwiftUI content-size updates can synchronously enter React Native layout on the main thread,
including text-input measurement. A concurrent JS-thread measurement may wait for notification
delivery while creating `NSTextStorage`. Holding the measurement-cache mutex across that native
work can block the main thread and create a circular wait if delivery needs it.

React Native 0.86.3's iOS text and line measurement caches use
`SimpleThreadSafeCache::getWithGeneratorOutsideLock` to compute misses outside the mutex, so native
text notifications cannot hold the measurement cache lock while waiting for another thread
([#1182](https://github.com/CherryHQ/cherry-studio-app/issues/1182)). Lookup, insertion, LRU
updates, and the returned-value copy remain locked. Concurrent misses may compute the same key more
than once; the later insert reuses the first stored result. The default `get` and pointer-returning
`getWithKey` keep their serialized generators, including Android measurements and iOS
attributed-string conversion. Each iOS measurement creates its own text storage, layout manager, and
text container.

When upgrading React Native, inspect the generator's lock scope before dropping this patch. iOS
enables `buildReactNativeFromSource`; delivering the patch requires a new native build. An OTA
update cannot replace this code. The patch removes the cache-lock dependency, not notification
delivery itself; the reported event does not identify the notification observer or its queue.

`scripts/__tests__/reactNativeTextCache.test.ts` guards the patch wiring in PR CI. The patch also
adds cache regressions to React Native's `SimpleThreadSafeCacheTest.cpp`, which no app build or CI
job compiles. These include a generator waiting for another thread to access the same cache,
concurrent misses for the same key, eviction, and returned-value lifetime. They cover the cache
contract, not recovery from the production hang. Run them separately with a googletest source tree
such as the Android NDK's `sources/third_party/googletest`:

```bash
RN=$(node -p "require('path').dirname(require.resolve('react-native/package.json'))")
GTEST=$ANDROID_NDK_HOME/sources/third_party/googletest
clang++ -std=c++20 -fsanitize=thread -I"$GTEST/include" -I"$GTEST" -I"$RN/ReactCommon" \
  "$GTEST/src/gtest-all.cc" "$GTEST/src/gtest_main.cc" \
  "$RN/ReactCommon/react/utils/tests/SimpleThreadSafeCacheTest.cpp" -o /tmp/simple-cache-test
/tmp/simple-cache-test
```

### iOS Build 26 Crash Patches

- Screens 4.26.2 iterates over a copy of the header subviews. Synchronous shadow-state updates
  can mount or unmount children during this loop, invalidating an enumeration of the live array.
- React Native 0.86.3 enables the existing scheduler delegate invalidation guard for the stable
  release level. Pending render/command callbacks skip delegates invalidated during teardown or
  replacement. This is the mitigation from [React Native #56680](https://github.com/facebook/react-native/pull/56680),
  not a guarantee against every concurrent delegate lifetime race. iOS already uses
  `buildReactNativeFromSource`, which is required for this native header patch to take effect.
- Widgets 57.0.19 reads `isActivityFullscreen` only on iOS 18 and newer, returning `false` on older
  systems. Build 26's five iOS 17.6.1 widget samples all return to binary offset `0x24bf98` after
  calling this missing weak-linked WidgetKit getter. Although the SDK declares it available earlier,
  [Apple's developer forum](https://developer.apple.com/forums/thread/763594) also reports the missing
  getter on iOS 17. The widget pod compiles this Swift source into the extension.

These patches require a new native build; an OTA update cannot deliver them. The separate iOS 27.2
widget sample aborts in `RBSConnection._handshake`, not on its AttributeGraph thread. Its report
does not include the system's abort message, so it remains unresolved; none of these patches is
claimed to fix that system-service handshake failure.
