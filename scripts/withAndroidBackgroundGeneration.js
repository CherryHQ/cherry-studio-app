const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SERVICE_NAME = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

// Configure the library's existing service through Expo CNG; no native service
// or library patch belongs to the application.
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
