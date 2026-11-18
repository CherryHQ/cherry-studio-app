# Android Build Maintenance

This records the source changes and remaining evidence for
[#1586](https://github.com/CherryHQ/cherry-studio-app/issues/1586), observed while building
0.5.2 / Android versionCode 193 on 2026-11-02. That APK built successfully. Its upload records
showed JavaScript source maps, R8 mappings, native symbols, and JVM sources uploaded; the warnings
did not establish a runtime crash or an installation failure.

## Build And Reporting Configuration

- `scripts/buildLocal.ts` resolves the pinned EAS CLI 24.4.2 and local build plugin 24.3.0 from
  project dependencies. The CLI's `@expo/eas-build-job` version selects that plugin version.
  Direct plugin execution avoids the nested `npx` command affected by an enclosing
  `npm exec --package` invocation. Global EAS installations and personal cache paths are not used.
- `eas.json` requires CLI 24.4.2, matching the release workflows, and supplies `SENTRY_URL` in
  production alongside the environment-sourced token. Tokens remain outside Git. Sentry CLI
  [3.8.0 reconciles URL and token sources together](https://github.com/getsentry/sentry-cli/blob/3.8.0/src/config.rs).
  The direct CLI dependency matches the React Native SDK's upload CLI (3.8.2 after the warning
  follow-up below).
- `withAndroidReleaseOptimization.js` places the Sentry plugin after the Android application
  plugin in the generated app module. It preserves R8 optimization and local Expo module source
  directories. Production uploads remain enabled; development and preview reporting remain off.
- Android signing, automatic production build numbers, and the `production-apk`,
  `production-google-play`, and `production-ios` channels are unchanged.

Use the commands and credential handling in [Local EAS Builds](./local-builds.md). Production
builds still increment the remote build number, including failures before native compilation.

## Dependency Alignment And Patch Migration

The native baseline is Expo 58.0.22 / React Native 0.88.1, using Expo 58.0.22's
`bundledNativeModules.json` recommendations for the 29 reported direct dependencies. React Native's
Jest/Metro tooling follows 0.88.1. The lockfile is deduplicated after changing dependencies.
The existing Keyboard Controller compatibility exception remains; no new version-check exclusion
is used to hide the patch-version mismatches.

| Dependency | Migration | Retained behavior / upstream evidence |
| --- | --- | --- |
| Expo Router | 58.0.26 → 58.0.29 | Retain Gesture Handler 3's legacy pan type and native toolbar spacer indices; the patched locations remain unchanged upstream. |
| Expo Widgets | 58.0.23 → 58.0.26 | Retain the iOS 18 availability guard for `isActivityFullscreen`; upstream still reads the getter unconditionally. |
| Expo Observe | 58.0.16 → 58.0.17 | Retain worker-thread scheduling to avoid main-thread WorkManager initialization. Upstream also updates WorkManager to 2.10.5 for minified-build input-merger retention. |
| React Native | 0.88.0 → 0.88.1 | Retain iOS text-cache generation outside the mutex and its native regression cases; the affected upstream source is unchanged. |
| React Native Screens | 4.30.0 → 4.30.1 | Retain Material 1.14.0, Android screen/header behavior, and iOS copied-subview enumeration. Upstream's additional cancelled-zoom navigation-bar fix remains intact. |
| Expo Modules Core | 58.0.26 → 58.0.29 | Retain Android `noBackupFilesDir` permissions. Remove only the Swift cast hunk now supplied by [Expo #52631](https://github.com/expo/expo/pull/52631), retaining its source regression guard. |

Other registered patches remain in place. Patch application and source inspection are not native
runtime acceptance. Rebuild both native development clients before accepting the upgraded baseline.
Sentry/R8 production behavior needs a separately authorized production build.

EAS tooling introduces `fast-xml-parser@4.5.7`, from its legacy 4.x branch without npm provenance.
The exact-version trust exception follows a comparison of all 41 published source files with
the official [v4.5.7 tag](https://github.com/NaturalIntelligence/fast-xml-parser/tree/v4.5.7)
(`49a12f10e9a44da765f045ca0c60e8d9e5be5aa0`). Do not broaden that exception to other versions.

## Skia Compiler Memory

The pinned `@shopify/react-native-skia@2.14.0` backports
[Skia #4284](https://github.com/wcandillon/react-native-skia/pull/4284)
(`21d93539689811ac45e9af22f905f608d026f3db`). Three C++ translation units included the
entire JSI API and could compile concurrently inside one Ninja invocation. Upstream reproduced
the resulting memory exhaustion on an EAS medium worker with Expo 58, matching the native-build
stage of [#1499](https://github.com/CherryHQ/cherry-studio-app/issues/1499).

The patch makes recorder headers self-contained and moves the PictureView and ViewProperty
definitions into `RNSkManager.cpp`, leaving one heavy compilation unit. It removes the original
two source files as well as their Android CMake entries; CocoaPods also compiles the shared C++
source glob. Package identity, JavaScript interfaces, and the Skia 154 native engine stay unchanged.
Retain this patch until the project adopts a compatible upstream release containing the fix.

`scripts/__tests__/skiaCompilerMemory.test.ts` guards patch delivery, the installed Android
compilation graph, and removal of the old shared definitions in PR CI. These source checks do
not measure memory or establish native compatibility. Confirmation still requires a separately
authorized Google Play AAB build on the same EAS worker class, recording resource usage and
successful artifact/Sentry uploads, plus iOS native integration and the existing Canvas/image
export flows. No cloud or native acceptance result is claimed for this backport yet.

## YAML Failure Status

Tree-sitter YAML 0.7.1's `scn_uri_esc`, `scn_ns_uri_char`, and `scn_ns_tag_char` return `SCN_FAIL`
(`-1`) through plain `char`. On a target with unsigned `char`, the caller receives 255, so its
`case SCN_FAIL` cannot handle the failure. For example, a malformed escape in `!<a%GG>` can pass
through the failure branch as an ordinary continuation.

The Enriched Markdown patch changes these three status returns to signed `int` in
`vendor-grammars.mjs`. It runs after both fresh downloads and the cached-grammar path, and is
idempotent. It does not depend on a hand-edited generated `scanner.c` or change other grammars.
The existing native render, input, math, and selection patches stay intact.

`scripts/__tests__/enrichedMarkdownYamlScanner.test.ts` covers repairing cached grammar sources
without redownloading them. The standalone C regression exercises the actual scanner's malformed
escapes, valid escapes, tag rejection, directive-prefix boundaries, and bounded progress with
unsigned plain `char`. After restoring the dependency's grammar assets, run it when compilation
and test execution are authorized:

```bash
mkdir -p .context/agent-self-testing
cc -std=c11 -funsigned-char -Werror=switch \
  -Inode_modules/react-native-enriched-markdown/cpp/highlight/vendor/grammars/yaml \
  scripts/__tests__/fixtures/enrichedMarkdownYamlScanner.c \
  -o .context/agent-self-testing/yaml-scanner
.context/agent-self-testing/yaml-scanner
```

The native fixture does not establish app-level rendering, streaming, or thread behavior. Include
malformed YAML fences in chat/device acceptance before claiming those paths are verified.

## Diagnostic Coverage And Lint Decisions

Keep Sentry CLI's default 1 MiB source-file limit. Build 193 skipped 11 generated
Tree-sitter parsers, QuickJS's amalgamation, and simdutf. These generated/third-party sources add
little routine application-debugging value. Application-owned source context, native symbols,
R8 mappings, and JavaScript source maps stay enabled. This is a source-context coverage decision,
not a symbol-upload failure or a Sentry service-side limit. If a future investigation needs those
sources, use a bounded `[dif] max_item_size` and the retained original build/debug IDs; see
[the CLI limit](https://github.com/getsentry/sentry-cli/blob/3.8.0/src/constants.rs).

Lint corrections preserve caught timeout/allocation errors as `cause`, consolidate imports, and
destructure the two AI-usage refetch functions so their dependency list matches their use.
API-specific exceptions stay narrow:

- `ConversationSourceBoundary` calls `fallback(state)` as a render callback. Only its known callers
  allow that prop name in the nested-component rule; other component definitions remain checked.
- The Logo's Skia `Path` accepts `style="stroke"`. Only that component in that file is exempted
  from the style-object rule.
- The remote header's context value retains its current behavior; a warning alone does not
  justify adding memoization without evidence of consumer cost.
- Const objects and their same-named TypeScript types occupy different namespaces. Their two
  declarations carry local explanations instead of renaming the public API.
- Reverse iteration uses a copied array, preserving the original order without requiring another
  Hermes Array intrinsic. The cache-constructor test intentionally observes construction's effect.

## Remaining Upstream And Tooling Warnings

| Warning family | Owner and decision |
| --- | --- |
| EAS CLI installed locally | Expo Doctor 1.21.5 rejects any `eas-cli` in the dependency tree. Keep this development dependency deliberately: the lockfile pins the CLI/plugin pair and the launcher resolves both before a build starts. This avoids the failed nested-download launch and does not rely on a global CLI. The Doctor check remains enabled and reported as a tooling-policy exception. |
| React Native Directory metadata | `package.json` excludes only enumerated local modules/workspace packages. Third-party unknown-package and `react-native-background-actions` architecture warnings remain visible; metadata absence is not compatibility evidence. The background-execution owner must verify the retained native patch on a device. |
| Storybook script/bin collision | The app scripts are `dev:storybook` and `dev:storybook:clear`; the `storybook` package binary keeps its name. |
| Metro export fallback | Build 195 still recorded these warnings. The follow-up below adopts Sentry's Expo Router 58 fix and exports the two existing hash browser targets. Keep package exports enabled; no generic resolver fallback is added. A new bundle is needed to confirm the warnings are gone. |
| Android/OpenSSL deprecated APIs, Kotlin casts, hidden C++ overloads | Upstream native dependencies own these diagnostics. Retain behavior pending a concrete defect or compatible upstream migration; warnings alone do not justify editing generated or vendored native output. |
| CMake, manifest-merger, legacy Gradle APIs/options | Native dependency/configuration owners must reassess with the next authorized build. AGP 10 migration is separate from this Expo 58 patch alignment. Keep Play-specific findings in #1192 and cloud-worker failures in #1499. |
| Terminal color variables | CLI environment only; no demonstrated app impact. |

This is not a claim that a new build is warning-free. Record the remaining exact messages,
dependency versions, and native build IDs with the acceptance results.

### Build 195 Warning Follow-up

Sentry React Native 8.28.0 imports the removed
`expo-router/build/global-state/router-store` module inside an optional `try` block. Metro's warning
does not mean it eventually finds that module: Expo permits the unresolved optional dependency,
and Sentry returns `null`. This app disables default integrations and does not enable
`expoRouterIntegration` or `wrapExpoRouterErrorBoundary`, so no active route-tracing regression was
established here. The SDK entry still pulls the optional import into Metro's dependency graph.

Sentry 8.33.0 includes [the upstream Expo Router 58 fix](https://github.com/getsentry/sentry-react-native/pull/6923).
The SDK now uses the public navigation-ref export and existing route-info/event modules. Its CLI
is aligned to 3.8.2 and the local crash-reporting module's Android dependency to 8.62.0; the existing
podspec follows Cocoa 9.32.0 automatically. Consent, reporting gates, and enabled integrations stay
unchanged. This upgrade requires new native clients; build 195's successful uploads do not validate
the upgraded SDK.

Metro 0.87.1 applies legacy `browser` redirects before checking `exports`:

- `@noble/hashes@1.8.0` redirects `./crypto` to `./crypto.js`, which its exports omit. The patch
  exports exactly `./crypto.js` as that same CommonJS browser file.
- `multiformats@14.0.5` redirects `./hashes/sha2` to `./dist/src/hashes/sha2-browser.js`, which its
  exports omit. The patch exports exactly that existing file. The importing dependencies are
  `@libp2p/peer-id` and `@libp2p/crypto`'s browser secp256k1 implementation.

Both patches change package metadata only. They preserve the browser files previously selected by
fallback, canonical Node entries, and hash implementations. Remove them when compatible upstream
metadata or Metro's export/browser ordering handles these imports without warnings while preserving
the selected platform files. Do not replace the browser targets with `node:crypto` implementations.
`scripts/__tests__/metroPackageExports.test.ts` guards the actual resolver targets and absence of
fallback warnings; `patchReapplication.test.ts` covers the new patches automatically.

The native source review did not establish a behavior defect in the remaining cast/overload warnings:

| Diagnostic | Source evidence and disposition |
| --- | --- |
| Keyboard Controller `ArrayList<TextWatcher>` cast | The old ReactEditText field path checks every element with `is TextWatcher` before casting. RN 0.88 uses the renamed field and the existing `NoSuchFieldException` path adds the listener through the public method. Retain upstream code. |
| WebView header/menu casts | The JS adapter produces `{name, value}` headers, and the native component contract declares string header fields and `{label, key}` menu items. These are bridge-contract casts; no invalid producer was established. Retain upstream code. |
| Screens `BottomSheetBehavior<Screen>` cast | `ScreenStackFragment` creates `BottomSheetBehavior<Screen>` for this screen; the reader uses a safe cast for other behavior types. Retain upstream code. |
| Quick Crypto `OCBCipher::init` hides the base overload | The factory explicitly casts to `OCBCipher` and calls the three-argument initializer, including tag length. That initializer explicitly calls the base initializer. No incorrect virtual dispatch was found on this path. Retain upstream code. |

Android/OpenSSL deprecations remain upstream migration work. The AGP legacy switches and variant
APIs must migrate before AGP 10; changing the compatibility switches alone is not a migration.
The CMake warnings concern missing `project()` declarations in dependency builds. The manifest
warnings are unmatched removal/replacement directives for `READ_MEDIA_IMAGES`, the file provider's
authority, and the image crop activity's exported flag; they do not establish an incorrect merged
manifest. Worklets Bundle Mode remains required by Streamdown, and conflicting terminal color
variables affect log rendering. These diagnostics remain visible.

This follow-up installs dependencies with scripts disabled and adds regression coverage without
running tests, type checks, bundling, native builds, or device acceptance. The checks below are
historical results from before these dependency changes.

## Validation Results

On 2026-11-03, the authorized focused validation passed:

- 15 tooling suites / 93 tests, including the EAS launcher, Sentry plugin ordering, cached YAML
  restoration, migrated native patch guards, patch reapplication, and Metro resolution.
- 13 application suites / 158 tests covering the changed adapters, hooks, error handling, and
  render callback behavior; 4 AI runtime suites / 37 tests covering the touched provider transports.
- The standalone YAML C regression compiled and ran with `-funsigned-char -Werror=switch`, using
  YAML 0.7.1 sources restored through the patched vendoring script. A control copy with the three
  original `char` return types failed the same regression at the `SCN_FAIL` assertion.
- Complete repository `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`.

Expo Doctor 1.21.5 passed 18/20 checks. Dependency versions, duplicate dependencies, and the
Storybook script-name check pass. The two retained failures are the local EAS CLI policy above
and third-party Directory metadata: `react-native-background-actions` lacks a New Architecture
test marker, and six packages lack metadata (`@preeternal/react-native-file-hash`,
`@siteed/sherpa-onnx.rn`, `@swmansion/react-native-bottom-sheet`, `expo-blob`, `react-native-anydoc`,
and `react-native-nitro-theme-transition`). The local `backup-storage` module is explicitly
excluded alongside the other local modules. Doctor is not reported as fully passing.

## Acceptance Evidence Still Required

The following native acceptance remains pending:

1. Build new Android and iOS development clients and exercise startup, chat, desktop pairing/remote
   desktop, attachments, malformed/valid YAML rendering, and background execution. Include iOS 17
   startup/widget paths and Android native screen/header transitions covered by retained patches.
2. In a separately authorized production build, confirm application-before-Sentry plugin order,
   URL/token selection, R8 behavior, signing/update channel, and actual upload/debug-ID matches.
   Development clients intentionally cannot verify production reporting.

Build 193's original validation did not cover these runtime checks. Keep the PR's validation
section explicit about which checks ran and which remain pending.
