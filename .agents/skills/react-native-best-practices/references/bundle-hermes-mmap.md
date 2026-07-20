---
title: Disable JS Bundle Compression
impact: HIGH
tags: android, hermes, mmap, tti, startup
---

# Skill: Disable JS Bundle Compression

Disable Android JS bundle compression to enable Hermes memory mapping for faster startup on React Native 0.78 and earlier.

## Quick Config

```groovy
// android/app/build.gradle, React Native 0.78 and earlier fallback
android {
    androidResources {
        noCompress += ["bundle"]
    }
}
```

**Note**: React Native 0.79+ defaults to uncompressed Android JS bundles. Prefer checking/toggling `react { enableBundleCompression = false }` there instead of adding `androidResources.noCompress` manually.

## When to Use

- Android app using Hermes
- Want faster TTI (Time to Interactive)
- Willing to trade install size for startup speed
- React Native version is 0.78 or earlier, skip otherwise (see applicability)

## Background

Android compresses most files in APK/AAB by default, including `index.android.bundle`.

**Problem**: Compressed files can't be memory-mapped (mmap).

**Impact**: Hermes must decompress before reading, losing one of its key optimizations.

## How Hermes Memory Mapping Works

Without compression:
1. Hermes opens bytecode file
2. OS memory-maps directly to disk
3. Only pages actually accessed are loaded
4. **Result**: Fast startup, low memory

With compression:
1. Android decompresses entire bundle
2. Loaded into memory
3. Then Hermes processes
4. **Result**: Slower startup, higher memory

## Step-by-Step Implementation

### Edit build.gradle

For React Native 0.78 and earlier, edit `android/app/build.gradle`:

```groovy
android {
    androidResources {
        noCompress += ["bundle"]
    }
}
```

### Full Context

```groovy
android {
    namespace "com.myapp"
    defaultConfig {
        applicationId "com.myapp"
        // ...
    }
    
    androidResources {
        noCompress += ["bundle"]
    }
    
    buildTypes {
        release {
            minifyEnabled true
            // ...
        }
    }
}
```

### Rebuild

```bash
cd android
./gradlew clean
./gradlew bundleRelease
# or
./gradlew assembleRelease
```

## Trade-offs

| Metric | Without Change | With Change |
|--------|----------------|-------------|
| Download size | Same | Same |
| Install size | Smaller | **+8% larger** |
| TTI | Slower | **-16% faster** |

**Real example**: 75.9 MB install → 82 MB install, but 450ms faster startup.

## Applicability

**React Native 0.78 and earlier**: Apply this optimization manually.

**React Native 0.79+**: Skip this unless the project explicitly enabled bundle compression.

## Verification

### Check APK Contents

```bash
# Unzip APK
unzip app-release.apk -d apk-contents

# Check if bundle is compressed
file apk-contents/assets/index.android.bundle
# Should show: "data" (not "gzip compressed")
```

### Measure TTI Impact

Use performance markers (see [native-measure-tti.md](./native-measure-tti.md)) to compare before/after.

## Multiple File Types

If you have other files that benefit from mmap:

```groovy
androidResources {
    noCompress += ["bundle", "hbc", "data"]
}
```

## Common Pitfalls

- **Not rebuilding**: Change requires clean build
- **Wrong config location**: Must be in `android` block
- **Ignoring size increase**: Monitor user feedback on install size
- **Already default**: Check if React Native version includes this

## Expo Notes

For Expo projects, run `npx expo prebuild` first to generate `android/` folder, then apply the `build.gradle` changes. Add `android/` to version control or use a [config plugin](https://docs.expo.dev/config-plugins/introduction/) for persistent changes.

## Should You Enable This?

| Scenario | Recommendation |
|----------|---------------|
| RN 0.78 or earlier startup-critical app | ✅ Enable |
| Storage-sensitive users | ⚠️ Test impact |
| Already fast TTI | Maybe not worth it |
| RN 0.79+ default config | Skip |

## Related Skills

- [native-measure-tti.md](./native-measure-tti.md) - Measure TTI improvement
- [bundle-analyze-app.md](./bundle-analyze-app.md) - Check size impact
- [bundle-r8-android.md](./bundle-r8-android.md) - Offset size increase
