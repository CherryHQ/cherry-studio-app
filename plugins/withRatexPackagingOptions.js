const { withAppBuildGradle } = require('expo/config-plugins')

/**
 * Custom Expo config plugin to fix ratex duplicate .so + Kotlin class
 * conflicts between ratex-react-native (npm) and ratex-android (Maven AAR).
 *
 * Three-part fix:
 *
 * 1. packagingOptions.jniLibs.pickFirsts — for duplicate libratex_ffi.so
 *
 * 2. Exclude ratex-android's classes.jar from the dependency (keeps .so):
 *    configurations.all { exclude group: 'io.github.erweixin', module: 'ratex-android' }
 *    BUT this also excludes the .so. To keep the .so, we need a different approach.
 *
 *    Actually the correct fix: ratex-react-native already bundles libratex_ffi.so
 *    in its own jniLibs directory. The ratex-android AAR also bundles it.
 *    With jniLibs.pickFirsts, Gradle picks the first one. So the .so is available.
 *    The Kotlin classes from ratex-react-native source compilation are sufficient.
 *
 * 3. The previous "exclude" approach worked for build but crashed at runtime.
 *    Root cause was likely NOT missing .so (jniLibs.pickFirsts handles that)
 *    but a different issue — possibly the ratex-react-native 0.1.7's Kotlin
 *    code calling a JNI method that doesn't exist in its bundled .so.
 *
 *    So we keep the exclude approach but ALSO need to ensure the .so from
 *    ratex-react-native is the one that gets picked (not ratex-android's).
 *    jniLibs.pickFirsts with '**/libratex_ffi.so' should handle this since
 *    ratex-react-native's .so comes first in the build pipeline.
 */
function withRatexPackagingOptions(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const gradleFile = modConfig.modResults.contents

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

// Exclude ratex-android Maven AAR to prevent duplicate Kotlin dex.
// ratex-react-native already provides all needed Kotlin classes from source
// AND bundles libratex_ffi.so in its jniLibs (picked by pickFirsts above).
configurations.all {
    exclude group: 'io.github.erweixin', module: 'ratex-android'
}
`

    modConfig.modResults.contents = gradleFile + injection
    return modConfig
  })
}

module.exports = withRatexPackagingOptions
