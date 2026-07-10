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
 * 2. packagingOptions.resources.pickFirsts — for duplicate .dex files
 *    during mergeDexRelease (DisplayItem$Companion etc.).
 *    NOTE: AGP 9's resources.pickFirsts DOES work for .dex files in JARs/AARs
 *    because dex files are treated as resources during packaging.
 *
 * We do NOT exclude ratex-android entirely because the AAR may contain
 * a different (compatible) build of libratex_ffi.so that the enriched-markdown
 * library's native code expects. Excluding the entire AAR caused runtime
 * crashes (missing native symbol / ABI mismatch).
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
        resources {
            pickFirsts.add('**/io/ratex/DisplayItem*.dex')
            pickFirsts.add('**/io/ratex/DisplayList*.dex')
            pickFirsts.add('**/io/ratex/RaTeX*.dex')
        }
    }
}
`

    modConfig.modResults.contents = gradleFile + injection
    return modConfig
  })
}

module.exports = withRatexPackagingOptions
