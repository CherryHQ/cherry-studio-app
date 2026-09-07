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

The base IDs remain `com.cherry-ai.cherry-studio-app` (iOS) and
`com.cherry_ai.cherry_studio_app` (Android). Widget identifiers and iOS App Groups follow the selected
variant. Each variant has independent app data; existing installations retain the original identity
and their data is not automatically migrated to the new development or preview app.

The `dev`, `start`, Storybook, `ios`, and `android` scripts select `PROFILE=development`. The `prebuild`
script also defaults to development, while preserving an explicitly set `PROFILE` (for example,
`PROFILE=preview pnpm prebuild --clean`). For preview or production, use direct Expo commands with the
same explicit `PROFILE` when building or starting Metro. When switching variants with existing generated
`ios` or `android` directories, regenerate them with `PROFILE=<profile> pnpm exec expo prebuild --clean`
before building; this replaces generated native projects, including any manual native edits.

These identity changes require new native builds. The first iOS development/preview build also needs
matching Apple app identifiers, widget identifiers, App Groups, and provisioning profiles. The EAS
project ID and production App Store submission target stay unchanged.

## Validate

Use the focused development loop and pre-PR gates in
[Testing And CI](docs/guides/testing-and-ci.md). Pull request CI runs the complete repository test
suite after a draft is marked ready for review.

## Documentation

Start with the [project documentation index](docs/README.md) for architecture, conventions, and
task-oriented guides.
