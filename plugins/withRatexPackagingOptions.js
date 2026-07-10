const { withAppBuildGradle } = require('expo/config-plugins')

/**
 * Custom Expo config plugin to fix ratex duplicate .so + Kotlin class
 * conflicts between ratex-react-native (npm package, bundles Kotlin sources
 * and .so files) and ratex-android (Maven AAR pulled by
 * react-native-enriched-markdown as `io.github.erweixin:ratex-android:0.1.10`).
 *
 * Two fixes applied:
 *
 * 1. packagingOptions.jniLibs.pickFirsts — for duplicate libratex_ffi.so
 *    during mergeReleaseNativeLibs.
 *
 * 2. configurations.all { exclude group: 'io.github.erweixin', module: 'ratex-android' }
 *    — to prevent react-native-enriched-markdown from pulling the Maven AAR
 *    whose compiled Kotlin classes (io.ratex.DisplayItem$Companion etc.)
 *    duplicate the ones ratex-react-native compiles from source.
 *    ratex-react-native's build.gradle already provides all the Kotlin
 *    classes needed (DisplayList.kt, RaTeXView.kt, etc.), so the Maven AAR
 *    is redundant.
 *
 * Why a custom plugin instead of expo-build-properties:
 * - expo-build-properties' packagingOptions uses AGP 7 API which AGP 9 ignores
 * - expo-build-properties cannot exclude transitive Maven dependencies
 */
function withRatexPackagingOptions(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const gradleFile = modConfig.modResults.contents

    // Skip if already injected
    if (gradleFile.includes('// === ratex-packaging-options plugin ===')) {
      return modConfig
    }

    const injection = `
// === ratex-packaging-options plugin ===
// Resolves conflicts between ratex-react-native (npm package with bundled
// Kotlin sources + .so) and ratex-android (Maven AAR pulled by
// react-native-enriched-markdown).
android {
    packagingOptions {
        jniLibs {
            pickFirsts.add('**/libratex_ffi.so')
            pickFirsts.add('**/libc++_shared.so')
            pickFirsts.add('**/libfbjni.so')
        }
    }
}

// Exclude ratex-android Maven AAR — ratex-react-native already provides
// all the same Kotlin classes from source (DisplayList.kt etc.), so
// letting both into the dex merge causes:
//   > Type io.ratex.DisplayItem$Companion is defined multiple times
configurations.all {
    exclude group: 'io.github.erweixin', module: 'ratex-android'
}
`

    modConfig.modResults.contents = gradleFile + injection
    return modConfig
  })
}

module.exports = withRatexPackagingOptions
