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

## App Icons

`app.json` uses `assets/icon-light.png` as the default iOS icon. It is copied directly from Cherry Desktop's
`build/logo.png`: opaque 1024 × 1024 artwork with the original red background and gradients,
without pre-rounded corners. `assets/icon-dark.png` keeps the original foreground gradients on a
transparent background so iOS can provide its dark background. iOS 18 and newer select the variant
from the user's Home Screen appearance, including automatic switching. Tinted appearances use
the system-generated treatment. See Apple's [icon asset guidance](https://developer.apple.com/documentation/xcode/configuring-your-app-icon).

Regenerate the dark icon with `pnpm exec tsx scripts/generateDarkAppIcon.ts`. The script clips the
original PNG with the desktop vector outline in `assets/icon-mark.svg`; it does not redraw or
replace the gradients. The mask is inset by three source pixels to remove edge antialiasing that
was blended into the original red background.

Android's `assets/adaptive-icon-monochrome.png` is a 1024 × 1024 white mark on transparency,
exported from `assets/icon-mark.svg`. The SVG contains the three mark paths from Cherry Desktop's
`src/renderer/assets/images/cherry-text-logo.svg`. The mark is centered by its visible bounds and
439.2 pixels tall to match the existing adaptive foreground's scale and stay inside the launcher
mask's safe area. On Android 13 and newer, supported launchers color this layer using the user's
wallpaper and light/dark theme when themed icons are enabled. Without that setting or launcher
support, Android displays the regular color icon; this is not an unconditional dark-icon switch.
See Android's [adaptive icon guidance](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
Launcher icon appearance is independent of the splash screen and the in-app theme setting.

Icon changes require a new native installation package; an EAS Update cannot replace launcher
icons. See the [Expo app icon guide](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/#app-icon).

## iOS HTTP Connections

Cherry accepts user-configured AI provider and MCP server addresses, including self-hosted HTTP
endpoints whose hosts are unknown at build time. `app.json` sets
`NSAppTransportSecurity.NSAllowsArbitraryLoads` to `true` so these connections can reach the server.
Prefer HTTPS with a valid certificate when configuring a public service.

Do not add `NSAllowsLocalNetworking`, `NSAllowsArbitraryLoadsForMedia`, or
`NSAllowsArbitraryLoadsInWebContent` alongside this setting: their presence makes iOS ignore
`NSAllowsArbitraryLoads`, which can block public HTTP endpoints with `NSURLErrorDomain -1022`.
See Apple's [ATS configuration rules](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloads).
The separate local-network permission description and Bonjour service declarations remain required.
App Store review requires justification for this exception: users connect to their own servers,
including servers that do not support HTTPS.

ATS policy is embedded in the native installation package. Changing it requires a new iOS package;
an OTA update cannot change the policy in an existing installation.

## APK Update Distribution

Preview and production packages also include the EAS Update client for compatible code and asset
changes. Public Android APKs use `production-apk`, Google Play uses `production-google-play`, and
iOS production uses `production-ios`; preview uses `preview`. Existing installations need one new
native package first. Development and Storybook do not automatically fetch OTA updates. See
[Application Updates](./app-updates.md) for publication and runtime compatibility.

The native update channel selects the shared package-update strategy: `production-apk` checks
GitCode and downloads inside the app, `production-google-play` checks Play availability and opens
Play, and `production-ios` checks published App Store metadata and opens the store. Preview stays
disabled. Notifications and About share one state; native updates require an explicit user action.
See the [update infrastructure](../../src/backend/services/appUpdate/README.md).

`APK_UPDATES_ENABLED` is the existing build-time switch for APK installation capability. The Android
`production` profile sets it to `true`; `production-google-play` sets it to `false`, excluding
`REQUEST_INSTALL_PACKAGES`. Do not override it in shared EAS environments or upload the public APK
as a store artifact. The native installer independently checks the embedded channel.

For an explicitly authorized development session, supply `APK_UPDATES_ENABLED=true` during both
the Android native build and Metro startup. Changing only Metro cannot add an installation
permission. The development package ID/signature must still match the update being installed;
a production APK cannot update the `.dev` application. Values must be `true` or `false`. The local
build wrapper's default remains development. Adding the native update module or changing permissions
requires a new native package; no OTA can supply them.

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

Before distributing that package, check the build log for upload warnings. An allowed failure exits
successfully, so Gradle can mark the mapping and source-bundle upload tasks `UP-TO-DATE` even when
the upload failed. Removing `SENTRY_ALLOW_FAILURE` and rerunning `assembleRelease` or `bundleRelease`
alone does not force those uploads to retry.

Keep the original sources, dependencies, and generated artifacts in the retained working directory.
Restore the original build environment, including local credentials and the selected profile's
`eas.json` environment overrides (`ANDROID_COMPRESS_NATIVE_LIBS=false` for Google Play). The APK's
update checks follow its native `production-apk` channel, not an environment variable. From
`<workdir>/build/android`, force the upload tasks to run with task-specific `--rerun` options:

```bash
eas env:exec production --non-interactive \
  "env PROFILE=production NODE_ENV=production EAS_BUILD=true EAS_BUILD_WORKINGDIR=/absolute/path/to/workdir/build \
  SENTRY_ALLOW_FAILURE=false SENTRY_DISABLE_AUTO_UPLOAD=false SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=false \
  ./gradlew :app:uploadSentryProguardMappingsRelease --rerun \
  :app:sentryUploadSourceBundleRelease --rerun \
  :app:uploadSentryNativeSymbolsForRelease --rerun \
  -PreactNativeArchitectures=arm64-v8a -Dorg.gradle.jvmargs=-Xmx4096m"
```

These native upload task names apply to both APK and AAB Release builds. If the JavaScript upload
failed, also append its exact task path from the original build log,
`:app:createBundleReleaseJsAndAssets_SentryUpload_<release>_<dist>`, followed by `--rerun`, to the
same invocation. Replace placeholders with that build's values; do not use another build's version
or distribution number.

Use the task-specific [`--rerun` option](https://docs.gradle.org/current/userguide/command_line_interface.html#sec:builtin_task_options),
not the global `--rerun-tasks`, and do not clean or regenerate the native project. Dependencies must
reuse the retained build outputs. If those outputs are missing or must be regenerated, recover the
original artifacts before claiming the existing package's uploads are complete. Confirm that the
upload tasks actually execute without warnings, then match the original package's debug IDs to the
mapping, source bundle, native symbols, and JavaScript source map on Sentry. A successful Gradle exit
alone is not upload confirmation. Cloud builds keep no working directory: do not set
`SENTRY_ALLOW_FAILURE` for them.

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

### Android Barcode Scanning

Desktop pairing uses `expo-camera`'s embedded `CameraView` and its bundled ML Kit barcode analyzer.
`scripts/withEmbeddedBarcodeScanner.js` removes the unused
`com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity` registration with
an Android manifest merger rule. `expo-camera` includes this portrait-only activity through
`play-services-code-scanner:16.1.0`; Google Play specifically flags it in
[#1192](https://github.com/CherryHQ/cherry-studio-app/issues/1192).

Keep `barcodeScannerEnabled: true`, which also controls the embedded analyzer. This exclusion does
not change the main activity's phone/tablet orientation policy or remove the scanner dependency's
classes. Do not use `CameraView.launchScanner()` on Android without restoring and adapting its
delegate activity. A new native build is required; inspect the merged manifest, check embedded QR
pairing on phones and rotated/resized tablets, and recheck Play Console before claiming the warning
is resolved.

### Android Edge-To-Edge Compatibility

The Screens 4.30.0 patch raises its Material dependency to
[1.14.0](https://github.com/material-components/material-components-android/releases/tag/1.14.0).
That release routes `BottomSheetDialog`, `SheetDialog`, and `EdgeToEdgeUtils` through helpers which
only read/write legacy system-bar colors below Android 15. Its minimum SDK 23 and AGP 8.11.1 baseline
fit this project's minimum SDK 26 and React Native's AGP 9.2.1. Existing screen-transition and iOS
patches remain required. This native dependency change requires a new installation package.

Android continues to use the precompiled React Native artifact. The reported React Native
`StatusBarModule` and `WindowUtilKt` calls remain unresolved in
[#1192](https://github.com/CherryHQ/cherry-studio-app/issues/1192). A local Kotlin patch would require
compiling React Native and Hermes from source; evaluate that cost against evidence from a new Play
report before adopting it. The existing iOS source-build configuration and patches remain required.

`scripts/__tests__/androidWindowCompatibility.test.ts` guards the Screens patch hash and installed
Material version declaration in PR CI. These checks do not establish runtime compatibility or
removal of the Play warning. Before release, inspect the merged manifest and resolved Material
version, check native sheets/date pickers and Android 14/15/16 system bars with gesture and
three-button navigation, and exercise embedded QR pairing on rotated/resized tablets. Record the
new AAB's version code and expanded Play findings. The original report is for 0.1.0, before R8 was
enabled; use comparable build settings when attributing changes to the dependency update.

## Expo 58 Dependency Baseline

The project uses Expo 58.0.19 and React Native 0.88.0 with Hermes V1 260318099.0.4. SDK 58 builds
against the iOS 27 SDK and its iOS template adopts the UIKit scene lifecycle, so
`expo-build-properties` no longer needs `enableSceneSupport`. See the
[Expo SDK 58 release notes](https://expo.dev/changelog/sdk-58). Existing development clients must
be rebuilt for the new native runtime.

Keep the version-specific patches for Expo Router, Calendar, Notifications, App Metrics, Observe,
Widgets, React Native, Screens, Reanimated, Drawer Layout, Keyboard Controller, Masked View, Metro,
and Metro Runtime when updating dependencies. The upgraded patched direct dependencies use exact
versions so an unrelated install cannot select a newer unpatched release.
Metro 0.87.1 is selected by Expo's Metro dependency. Worklets publishes Bundle Mode patches only up to
Metro 0.84, so the Metro and Metro Runtime patches are ports of those to 0.87.1.

`react-native-streamdown` requires Bundle Mode and the `remend` import forwarding configured in
Babel. Keep those settings when updating Hermes. Worklets 0.13.0 is the range Reanimated 4.7
supports; removing the experimental mode requires a separate change to streaming Markdown
processing.

The Uniwind 1.6.5 patch also forwards React Native's `AssetRegistry` through its native styling
entry. Expo Asset 58 resolves bundled resources through that public export; without it, Office
preview fails before loading its HTML page. Keep the forwarding until Uniwind includes it upstream.
`scripts/__tests__/uniwindAssetRegistry.test.ts` guards the installed entry and patch registration.

Android builds compile `expo-app-metrics` and `expo-observe` from source through
`expo.autolinking.android.buildFromSource` in `package.json`, so their native patches are included
instead of using Expo's precompiled binaries. Observe's source build requires App Metrics to be
available as a Gradle project, so both must build from source. The App Metrics patch retains the main session's
JavaScript wrapper; its transitive dependency version is pinned in `pnpm-workspace.yaml`.

### iOS 17 Nitro Exception Compatibility Patch

Build 46 (`0.4.0`) terminates at launch on iOS 17 with `DYLD 4 Symbol missing` for
`std::exception_ptr::__from_native_exception_pointer(void*)`
([#1442](https://github.com/CherryHQ/cherry-studio-app/issues/1442)). Nitro Modules 0.36.4's patch
backports [Nitro #1824](https://github.com/margelo/nitro/pull/1824): `makeException()` and the inline
pending `Promise<T>` destructor create exceptions through throw/catch and `std::current_exception()`.
This avoids Xcode 27's Swift/C++ interop emitting references to iOS 18-only libc++ symbols while
preserving the existing error messages and rejection behavior. Keep the iOS deployment target at
17.0 and retain this patch until the installed Nitro version includes the upstream fix.

`scripts/__tests__/nitroIosCompatibility.test.ts` guards the pinned version, patch registration/hash,
and installed Swift-visible source paths in PR CI. These source guards do not establish binary or
runtime compatibility. Before release, inspect a new iOS build for strong imports of
`__ZNSt13exception_ptr31__from_native_exception_pointerEPv` and `___cxa_init_primary_exception`,
then confirm startup on iOS 17 and a current iOS version, exception-message conversion, and pending
promise rejection. A new native build is required; an OTA update cannot deliver this patch.

### iOS Text Measurement Cache Patch

Expo SwiftUI content-size updates can synchronously enter React Native layout on the main thread,
including text-input measurement. A concurrent JS-thread measurement may wait for notification
delivery while creating `NSTextStorage`. Holding the measurement-cache mutex across that native
work can block the main thread and create a circular wait if delivery needs it.

React Native 0.88.0's iOS text and line measurement caches use
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

- Screens 4.30.0 iterates over a copy of the header subviews. Synchronous shadow-state updates
  can mount or unmount children during this loop, invalidating an enumeration of the live array.
- React Native 0.88.0 no longer needs a patch for pending render/command callbacks reaching a torn-down
  scheduler delegate. 0.86.3 needed the `enableSchedulerDelegateInvalidation` flag from
  [React Native #56680](https://github.com/facebook/react-native/pull/56680); 0.88 removed that flag
  and instead clears pending rendering updates in `RuntimeScheduler_Modern::handleTaskError` before
  the host's fatal handler drops the delegate, covered by its `SchedulerDelegateInvalidationTest`.
- Widgets 58.0.23 reads `isActivityFullscreen` only on iOS 18 and newer, returning `false` on older
  systems. Build 26's five iOS 17.6.1 widget samples all return to binary offset `0x24bf98` after
  calling this missing weak-linked WidgetKit getter. Although the SDK declares it available earlier,
  [Apple's developer forum](https://developer.apple.com/forums/thread/763594) also reports the missing
  getter on iOS 17. The widget pod compiles this Swift source into the extension.

These patches require a new native build; an OTA update cannot deliver them. The separate iOS 27.2
widget sample aborts in `RBSConnection._handshake`, not on its AttributeGraph thread. Its report
does not include the system's abort message, so it remains unresolved; none of these patches is
claimed to fix that system-service handshake failure.
