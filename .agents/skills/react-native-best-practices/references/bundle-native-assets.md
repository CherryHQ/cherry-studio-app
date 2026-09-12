---
title: Native Assets
impact: HIGH
tags: assets, images, asset-catalog, app-thinning
---

# Skill: Native Assets

Configure platform-specific asset delivery to reduce app download size.

## Quick Config

**iOS Asset Catalog (Build Phase):**

```bash
# Default RN template: the Xcode bundle script cd's to PROJECT_ROOT first.
export EXTRA_PACKAGER_ARGS="--asset-catalog-dest ios"
```

**Android**: Automatic via AAB — Play Store delivers correct density per device.

## When to Use

- Images bloating app size
- Different device densities need different assets
- Want to leverage App Store/Play Store optimization
- Using high-resolution images

## Concept: Size Suffixes

React Native convention for multiple resolutions:

```
assets/
├── image.jpg       # 1x resolution (base)
├── image@2x.jpg    # 2x resolution
└── image@3x.jpg    # 3x resolution
```

```tsx
// React Native selects best one for device
<Image source={require('./assets/image.jpg')} />
```

## Android: Automatic Optimization

Android handles this automatically.

### How It Works

1. Build AAB:
   ```bash
   cd android && ./gradlew bundleRelease
   ```

2. Metro places images in density folders:
   ```
   android/app/build/outputs/bundle/release/
   └── base/
       └── res/
           ├── drawable-mdpi-v4/     # 1x
           ├── drawable-hdpi-v4/     # 1.5x
           ├── drawable-xhdpi-v4/    # 2x
           ├── drawable-xxhdpi-v4/   # 3x
           └── drawable-xxxhdpi-v4/  # 4x
   ```

3. Play Store delivers only needed density per device.

**No configuration required** for Android.

## iOS: Asset Catalog Setup

iOS requires explicit configuration.

### Step 1: Create Asset Catalog

Create an asset catalog in the same directory you pass to `--asset-catalog-dest`:

```
ios/RNAssets.xcassets/
```

React Native's bundler writes image sets into `RNAssets.xcassets` under the destination directory. Keep the manual command and Xcode build phase destination consistent.

### Step 2: Configure Build Phase

In Xcode, add this before the React Native bundle command in the **Bundle React Native code and images** build phase:

```bash
export EXTRA_PACKAGER_ARGS="--asset-catalog-dest ios"
```

This assumes the default React Native build script, which changes directory to `PROJECT_ROOT` before invoking Metro. If a custom build phase runs from a different working directory, set `--asset-catalog-dest` relative to that working directory and verify the generated `RNAssets.xcassets` path.

### Step 3: Build

Run build to populate asset catalog:

```bash
npx react-native run-ios --mode Release
```

Or manually:

```bash
npx react-native bundle \
  --entry-file index.js \
  --bundle-output ios-bundle.js \
  --platform ios \
  --dev false \
  --asset-catalog-dest ios \
  --assets-dest ios/assets
```

### Step 4: Verify

After build, `RNAssets.xcassets` contains:

```
ios/RNAssets.xcassets/
└── assets_image_image.imageset/
    ├── Contents.json
    ├── image.jpg
    ├── image@2x.jpg
    └── image@3x.jpg
```

App Store then delivers only needed resolution.

## Before/After Comparison

### Without Asset Catalog (All Variants)

```
App bundle contains:
├── image.jpg       (100 KB)
├── image@2x.jpg    (300 KB)
└── image@3x.jpg    (600 KB)
Total: 1 MB
```

### With Asset Catalog (Device-Specific)

```
iPhone 15 Pro receives:
└── image@3x.jpg    (600 KB)
Total: 600 KB  (40% smaller)
```

## Asset Optimization Tips

### 1. Compress Images

Use tools before adding to project:

```bash
# ImageOptim (macOS)
# TinyPNG (web)
# sharp (programmatic)

npx sharp-cli input.jpg -o output.jpg --quality 80
```

### 2. Use Appropriate Formats

| Format | Best For |
|--------|----------|
| JPEG | Photos |
| PNG | Icons, transparency |
| WebP | Both (smaller) |
| SVG | Vector icons |

### 3. Separate Bundled Assets from Remote Images

Remote image caching libraries can help runtime image performance, but they do not reduce the size of images already bundled into the app.

## Verification

### iOS App Thinning Report

After export, check `App Thinning Size Report.txt`:

```
Variant: MyApp-<UUID>.ipa
Supported variant descriptors: iPhone15,2 ...
App size: 3.5 MB compressed, 10.6 MB uncompressed
```

### Use Emerge Tools

Upload IPA to see asset breakdown.

## Common Pitfalls

- **Inconsistent destination paths**: The build phase and manual bundle command should point at the same asset catalog parent directory
- **Missing build phase config**: Assets not processed
- **Not using size suffixes**: All variants included anyway
- **Forgetting to rebuild**: Changes need fresh build

## Future Note

As of the March 2026 book export, iOS asset catalog generation is not described as default. Verify current React Native release notes before applying this manually.

## Related Skills

- [bundle-analyze-app.md](./bundle-analyze-app.md) - Verify asset impact
- [bundle-r8-android.md](./bundle-r8-android.md) - Android code optimization
