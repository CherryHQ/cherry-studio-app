# Cherry Studio Mobile

Cherry Mobile is the Expo and React Native client for Cherry Studio. It keeps Cherry's chat and
provider model compatible with Desktop while using mobile-native data, navigation, rendering, and
resource ownership.

## Requirements

- Node.js 24, matching pull request CI
- `pnpm@12.2.1`
- Xcode for iOS development or Android Studio for Android development

## Install

```bash
pnpm install
```

## Run

The app uses an Expo development client because it includes custom native modules. Build and install
the client for the target platform:

```bash
pnpm ios
pnpm android
```

After the development client is installed, start Metro with:

```bash
pnpm dev
```

Rebuild the development client after native dependency or native configuration changes. Use
`pnpm dev:clear` when the Metro cache must be reset.

### App variants

`app.json` holds the production defaults. `app.config.ts` selects the app identity using `PROFILE`,
which the three EAS build profiles already set. An unset `PROFILE` defaults to production; unknown
values are rejected.

| EAS profile | App name | iOS / Android ID suffix | URL scheme |
| --- | --- | --- | --- |
| `development` | Cherry Studio Dev | `.dev` | `cherrystudio-dev` |
| `preview` | Cherry Studio Preview | `.preview` | `cherrystudio-preview` |
| `production` | Cherry Studio | none | `cherrystudio` |

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

## Validate

Use the focused development loop and pre-PR gates in
[Testing And CI](docs/guides/testing-and-ci.md). Pull request CI runs the complete repository test
suite after a draft is marked ready for review.

## Documentation

Start with the [project documentation index](docs/README.md) for architecture, conventions, and
task-oriented guides.
