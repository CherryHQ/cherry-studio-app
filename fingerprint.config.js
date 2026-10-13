/** @type {import('expo/fingerprint').Config} */
module.exports = {
  // EAS assigns native build numbers remotely; they do not change JS/native compatibility.
  sourceSkips: ['PackageJsonAndroidAndIosScriptsIfNotContainRun', 'ExpoConfigVersions'],
};
