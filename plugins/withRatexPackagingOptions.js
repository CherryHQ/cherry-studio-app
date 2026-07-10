const { withAppBuildGradle } = require('expo/config-plugins')

// Fix ratex duplicate .so + Kotlin class conflicts.
// ratex-react-native (npm) bundles Kotlin sources + .so files.
// ratex-android (Maven AAR via react-native-enriched-markdown) has the same.
// This plugin injects AGP 9 compatible packagingOptions + excludes the AAR.
function withRatexPackagingOptions(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const gradleFile = modConfig.modResults.contents

    if (gradleFile.includes('// === ratex-packaging-options plugin ===')) {
      return modConfig
    }

    var injection = [
      '',
      '// === ratex-packaging-options plugin ===',
      '// Resolves conflicts between ratex-react-native and ratex-android.',
      'android {',
      '    packagingOptions {',
      '        jniLibs {',
      "            pickFirsts.add('**/libratex_ffi.so')",
      "            pickFirsts.add('**/libc++_shared.so')",
      "            pickFirsts.add('**/libfbjni.so')",
      '        }',
      '    }',
      '}',
      '',
      '// Exclude ratex-android Maven AAR to prevent duplicate Kotlin dex.',
      '// ratex-react-native already provides all needed classes + .so.',
      'configurations.all {',
      "    exclude group: 'io.github.erweixin', module: 'ratex-android'",
      '}',
      ''
    ].join('\n')

    modConfig.modResults.contents = gradleFile + injection
    return modConfig
  })
}

module.exports = withRatexPackagingOptions
