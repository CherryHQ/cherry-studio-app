const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SERVICE_NAME = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

// Expo CNG declares the existing library service; its visibility lifecycle lives
// in the versioned background-actions patch, not generated application code.
module.exports = (config) =>
  withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const services = (application.service ??= []);
    let service = services.find((entry) => entry.$['android:name'] === SERVICE_NAME);
    if (!service) {
      service = { $: { 'android:name': SERVICE_NAME } };
      services.push(service);
    }
    service.$['android:exported'] = 'false';
    service.$['android:foregroundServiceType'] = 'dataSync';
    return mod;
  });
