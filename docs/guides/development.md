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
