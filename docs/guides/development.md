# Development

Cherry Mobile is Cherry Studio's Expo and React Native client. It uses a custom development client
because it includes native modules; Expo Go cannot run this application.

## Requirements

- Node.js 24, matching pull request CI
- `pnpm@12.2.1`
- Xcode on macOS for iOS development, or Android Studio and the Android SDK for Android development

## Install

Clone the repository and install its dependencies:

```bash
git clone https://github.com/CherryHQ/cherry-studio-app.git
cd cherry-studio-app
pnpm install
```

## Dependencies

Installs never write patched or built package output back into the shared pnpm store
(`sideEffectsCacheReadonly` in `pnpm-workspace.yaml`), so a bad install in one checkout cannot
contaminate other checkouts. Each checkout applies patches and runs dependency build scripts on a
clean install.

- Run one `pnpm install` at a time per checkout. Git hooks can start an install; wait for it before
  starting another. Concurrent installs in the same directory apply patches twice to the same files.
- `verifyDepsBeforeRun: warn` keeps `pnpm run` and `pnpm exec` from starting implicit installs.
  Install dependencies explicitly when they change. EAS already installs before fingerprinting;
  an implicit install during prebuild can reapply native patches and change that fingerprint.
- Do not run `pnpm rebuild`, and do not rebuild packages listed in `patchedDependencies`: pnpm
  12.2.1 reapplies patches to already patched files.
- Repeated declarations in a patched file under `node_modules` mean a patch was applied twice.
  Delete that package's directory under `node_modules/.pnpm` and run `pnpm install --force`.
- Write patches that cannot apply twice. EAS runs another `pnpm install` after prebuild, and any
  install that is not a no-op re-applies patches in place. A patched file whose every hunk still
  matches after one application receives the change again, so insert next to lines the patch
  itself changes or that stay unique, not at the top of a file or between two functions.
  `scripts/__tests__/patchReapplication.test.ts` checks each registered patch.

### Enriched Markdown Patch

`patches/react-native-enriched-markdown@1.1.1.patch` is the app's largest dependency patch: 64
files of native code, generated props, and matching JavaScript and TypeScript. An upgrade re-ports
every native block below and needs a native rebuild with iOS/Android device acceptance of paste,
undo, selection, and accessibility. Keep this table current when a block is added or retired; a
block leaves when upstream ships an equivalent.

| Block | Kind | Source | Upstream | Remove when |
| --- | --- | --- | --- | --- |
| Android input null and long-press guards | Bug fix | #973, #1015 | 1.1.1 guards only `Editor.performLongClick`; touch and drag paths are not upstream | Upstream guards the same Sentry crashes |
| Android input height invalidation and scroll clamp | Bug fix | #1028 | Not upstream | Upstream re-measures after insertion |
| Android measurement snapshot on the UI thread | Bug fix | #973, #1028 | Not upstream | Upstream measures on the UI thread |
| iOS input measurement without main-thread waits | Bug fix | Duo startup and display-transition deadlock | [#582](https://github.com/software-mansion/enriched-markdown/pull/582) leaves input measurement unresolved | Upstream input layout consumes immutable text without waiting for the main thread |
| Serial streaming render worker | Bug fix | #1022 | Not upstream | Upstream serializes streaming renders |
| Atomic link overlap replacement | Bug fix | #1402 | Not upstream | Upstream replaces overlapping atomic links |
| iOS nested display math fitted to the column | Bug fix | #1484 | Not fixed in 1.1.1 | Upstream fits nested display math |
| Android 8.1 table and math accessibility | Bug fix | #1466 | Not fixed in 1.1.1 | Upstream supports API 27 accessibility |
| iOS asynchronous clipboard paste keeping Markdown | Bug fix | #1467, #1476 | Not fixed in 1.1.1 | Upstream reads the clipboard asynchronously |
| Table scrolling | Bug fix | #606 | Not upstream | Upstream scrolls wide tables |
| iOS code text drawn only around the visible window | Bug fix | #1530 | Not fixed in 1.1.1; a full-size backing store leaves a code block of a few thousand lines blank | Upstream draws long code blocks without a full-size backing store |
| Link variant `icon` and `iconTint` (codegen `Props.h`, TS, both platforms) | Product feature | #606 | Propose as an issue; upstream already has `icon` for context menus and admonitions | Upstream ships link icons |
| Code block 192 pt viewport, header and divider (gesture arbitration part is a fix) | Product customization | #606 | Not upstream | Never, unless the design changes |
| Standalone code block external controls (style, generated props, layout/cache, menus and accessibility) | Product customization | CherryUI `CodeBlock` | Not upstream | Upstream supports caller-owned code-block controls without changing scrolling |
| Table scrollbar that does not fade | Product customization | #606 | Not upstream | Never, unless the design changes |
| Generic `linkVariantUtils`, `!TARGET_OS_OSX` guard | Build compatibility | #606 | Not upstream | Upstream builds without them |

`scripts/__tests__/enrichedMarkdown*.test.ts` and `patchReapplication.test.ts` guard the installed
source text, not behavior.

The iOS input publishes immutable text and layout attributes in Fabric state. Its layout node
measures the snapshot at the current width without calling the live view; before the first native
mount it uses the same input parser and formatter on detached storage. Snapshot runs carry a private
attribute so Foundation cannot intern their copied paragraph styles with equal, mutable styles in
the live editor. Attachments carry only bounds and are materialized per measurement.

The [native input regression](../../scripts/__tests__/fixtures/enrichedMarkdownInputMeasurement.mm)
checks measurement while main is blocked, empty and trailing-newline heights, CJK/RTL/emoji,
width changes, mutable-source isolation, and concurrent measurement. Run it explicitly after
claiming an authorized, booted iOS simulator through the device workflow; set `IOS_SIMULATOR_UDID`
to that device's UDID. It does not boot a simulator or replace full application acceptance:

```bash
ENRICHED_IOS_DIR="$PWD/node_modules/react-native-enriched-markdown/ios"
IOS_SIMULATOR_SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
mkdir -p .context/agent-self-testing
xcrun clang++ -std=c++20 -fobjc-arc -fblocks -target arm64-apple-ios17.0-simulator \
  -isysroot "$IOS_SIMULATOR_SDK" -I"$ENRICHED_IOS_DIR/input" -I"$ENRICHED_IOS_DIR/utils" \
  scripts/__tests__/fixtures/enrichedMarkdownInputMeasurement.mm \
  "$ENRICHED_IOS_DIR/input/ENRMInputMeasurement.mm" \
  -framework Foundation -framework UIKit -framework CoreGraphics \
  -o .context/agent-self-testing/input-measurement-test
xcrun simctl spawn "$IOS_SIMULATOR_UDID" "$PWD/.context/agent-self-testing/input-measurement-test"
```

A new iOS development client must also pass cold startup and repeated inner/outer-screen and fold
transitions, with multiline drafts, paste, undo, IME composition, mentions, and clearing/restoring
text. The standalone regression does not exercise Fabric state publication or the first-mount
parser/formatter integration.

### Gesture Handler Pressable Patch

`patches/react-native-gesture-handler@3.3.0.patch` preserves pending Android presses when
`requireToFail` defers the native result beyond touch release. Without it, `StatefulPressable`
resets before the context-menu long press fails, swallowing ordinary taps. The patch changes only
the TypeScript source and published JavaScript; it does not change native inputs. Ordinary presses
without a failure dependency keep the upstream release fallback.

Remove it when upstream preserves deferred results and the real-state-machine regression in
`context-menu-pressable.android.test.tsx` passes without the patch. That suite covers callback
ordering, cancellation, rearming, pressed feedback, and accessibility activation; Android device
acceptance still owns native arbitration. `gestureHandlerPressablePatch.test.ts` and
`patchReapplication.test.ts` guard installation and both published entry paths.

### Pi Dependency Upgrades

The pinned Pi family includes scheduler/recovery behavior patches as well as mobile compatibility
adaptations. Before upgrading or retiring a hunk, use the
[maintained patch inventory](../references/agent/pi-durable-migration.md#maintained-patch-contracts).
Record the upstream replacement, compare persisted-input and recovery semantics, and retain
behavioral regressions alongside patch/hash guards. A patch that applies cleanly is not proof of
compatibility. Follow [Testing And CI](./testing-and-ci.md) and the active task's authorization for
checks and device acceptance; do not clear runtime storage to make an upgrade pass.

## Run

Build and install the development client for your target platform. Choose one:

```bash
pnpm ios
# or
pnpm android
```

After the development client is installed, start Metro with:

```bash
pnpm dev
```

The `ios`, `android`, and `dev` scripts select the development app identity. There is no root
application `build` script. AI and remote packages are consumed from npm.

Rebuild the development client after native dependency or native configuration changes. Ordinary
JavaScript and TypeScript changes reuse the installed client. Use `pnpm dev:clear` when the Metro
cache must be reset.

For workspace-specific ports and simulator/emulator sessions, follow
[Parallel Device Testing](./parallel-device-testing.md).

## Installation Packages And App Variants

Use `pnpm build:local --platform android` or `pnpm build:local --platform ios` to create local EAS
installation packages. Both default to development and load `.env` and `.env.local` into the build
process. See [Local EAS Builds](./local-builds.md) for native tools, output options, build profiles,
Sentry configuration, and [app variants](./local-builds.md#app-variants).

Development and preview packages do not report to Sentry, EAS Observe, or EAS Insights, or upload
build-time debug artifacts. The shared reporting registry controls production eligibility.
Sentry credentials are only needed for production monitoring.

## Validation And Contributions

Follow [Testing And CI](./testing-and-ci.md) for focused checks and pre-PR gates. The complete
repository type check is `pnpm typecheck`; it also builds the required workspace packages. Pull
request CI runs the complete repository test suite after a draft is marked ready for review.

Read [Git Workflow](./git-workflow.md) before preparing a contribution. The
[documentation index](../README.md) links to architecture, code organization, UI conventions, and
guides for extending the application.
