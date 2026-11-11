const {
  AndroidConfig,
  withAndroidManifest,
  withGradleProperties,
  withProjectBuildGradle,
} = require('expo/config-plugins');

const INSTALL_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';
const DOMESTIC_STORES_PROPERTY = 'cherry.appUpdate.domesticStoresEnabled';
const VENDOR_REPOSITORY =
  '\n// Cherry app-update vendor SDKs\nallprojects {\n  repositories {\n    flatDir { dirs "$rootDir/../modules/app-update/android/libs" }\n  }\n}\n';

module.exports = (config, { apkUpdatesEnabled, domesticStoresEnabled = false }) => {
  config = withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (property) => property.type !== 'property' || property.key !== DOMESTIC_STORES_PROPERTY,
    );
    mod.modResults.push({
      type: 'property',
      key: DOMESTIC_STORES_PROPERTY,
      value: String(domesticStoresEnabled),
    });
    return mod;
  });
  config = withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(VENDOR_REPOSITORY, '');
    if (domesticStoresEnabled) mod.modResults.contents += VENDOR_REPOSITORY;
    return mod;
  });
  // Explicitly remove this permission from every store/preview manifest, including library merges.
  config.android ??= {};
  config.android.permissions = (config.android.permissions ?? []).filter(
    (permission) => permission !== INSTALL_PERMISSION,
  );
  config.android.blockedPermissions = (config.android.blockedPermissions ?? []).filter(
    (permission) => permission !== INSTALL_PERMISSION,
  );
  if (apkUpdatesEnabled) config.android.permissions.push(INSTALL_PERMISSION);
  else config.android.blockedPermissions.push(INSTALL_PERMISSION);

  return withAndroidManifest(config, (mod) => {
    AndroidConfig.Permissions.removePermissions(mod.modResults, [INSTALL_PERMISSION]);
    if (apkUpdatesEnabled) {
      AndroidConfig.Permissions.ensurePermissions(mod.modResults, [INSTALL_PERMISSION]);
    } else {
      AndroidConfig.Manifest.ensureToolsAvailable(mod.modResults);
      AndroidConfig.Permissions.addBlockedPermissions(mod.modResults, [INSTALL_PERMISSION]);
    }
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      'expo.modules.appupdate.APK_UPDATES_ENABLED',
      String(apkUpdatesEnabled),
    );
    return mod;
  });
};
