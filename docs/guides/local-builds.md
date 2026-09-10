# Local EAS Builds

Use `pnpm build:local` to create an Android or iOS installation package on your machine. It runs
`eas build --local`, defaults to the `development` profile, and forwards EAS build arguments.
The existing `eas-build-post-install` hook builds the workspace packages during the build.

| Build profile | Sentry reporting | Sentry source-map and debug-symbol uploads |
| --- | --- | --- |
| `development` / `development-simulator` | Disabled | Disabled |
| `preview` | Disabled | Disabled |
| `production` | Enabled with a DSN outside development mode | Enabled; requires an upload token |

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
  enabled only for the production profile, with a DSN, and outside development mode (`__DEV__`).
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

Pass `--output /absolute/path/to/package.apk` or `--output /absolute/path/to/package.ipa` to choose
the artifact location. For an iOS simulator package, select `--profile development-simulator`;
that profile produces a simulator artifact rather than an IPA for a physical device.

To create a standalone preview package, select the existing preview profile:

```bash
pnpm build:local --platform android --profile preview
pnpm build:local --platform ios --profile preview
```

Preview and development bundles do not report to Sentry, even when the native dependency and a DSN
are present. Production builds require `--profile production`; that profile is never the wrapper's
default.

For production monitoring, provide a valid upload token and keep automatic uploads enabled.
`SENTRY_DISABLE_AUTO_UPLOAD=true` skips uploads but does not disable runtime reporting. Without
matching source maps and debug symbols, reported error stacks may not resolve back to source.
Missing or invalid upload credentials can fail the build.

Rebuild the native client after adding or changing native dependencies such as Sentry. Starting
Metro again does not add a native module to an already installed client. Local and cloud EAS builds
generate native projects from the selected profile because `.easignore` excludes `ios` and `android`.
When using direct Expo builds with existing native folders, follow the
[app-variant regeneration instructions](../../README.md#app-variants) after switching profiles;
removing a plugin from app config does not clean its hooks out of an existing native project.

Successful compilation alone does not verify production Sentry event delivery or source-map
matching; those require a separate runtime check.
