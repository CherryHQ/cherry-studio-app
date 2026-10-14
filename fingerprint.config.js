/** @type {import('expo/fingerprint').Config} */
module.exports = {
  // EAS assigns native build numbers remotely; they do not change JS/native compatibility.
  sourceSkips: ['PackageJsonAndroidAndIosScriptsIfNotContainRun', 'ExpoConfigVersions'],
  // AnyDoc downloads this version-pinned iOS binary only on macOS. Android autolinking
  // hashes the whole package; keep its version and sources, but exclude the host-only download.
  ignorePaths: [
    '**/node_modules/react-native-anydoc/ios/AnydocCore.xcframework/**/*',
    // pnpm generates executable shims with absolute install paths inside workspace packages.
    '**/node_modules/.bin/**/*',
  ],
};
