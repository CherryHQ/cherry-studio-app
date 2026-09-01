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

## Validate

Use the focused development loop and pre-PR gates in
[Testing And CI](docs/guides/testing-and-ci.md). Pull request CI runs the complete repository test
suite after a draft is marked ready for review.

## Documentation

Start with the [project documentation index](docs/README.md) for architecture, conventions, and
task-oriented guides.
