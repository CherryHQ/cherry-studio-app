const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const INSTALL_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';

module.exports = (config, { apkUpdatesEnabled }) => {
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
