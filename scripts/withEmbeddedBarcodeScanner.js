const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SCANNER_ACTIVITY =
  'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';

// Cherry scans with CameraView's bundled ML Kit analyzer, not launchScanner().
// Exclude the unused Google Play scanner activity and its portrait restriction.
module.exports = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = AndroidConfig.Manifest.ensureToolsAvailable(mod.modResults);
    // Scanning and taking photos are optional; CAMERA must not filter device installs.
    for (const name of ['android.hardware.camera', 'android.hardware.camera.autofocus']) {
      const features = (manifest.manifest['uses-feature'] ??= []);
      const feature = features.find((entry) => entry.$['android:name'] === name);
      if (feature) {
        feature.$['android:required'] = 'false';
      } else {
        features.push({ $: { 'android:name': name, 'android:required': 'false' } });
      }
    }
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    application.activity = [
      ...(application.activity ?? []).filter(
        (entry) => entry.$['android:name'] !== SCANNER_ACTIVITY,
      ),
      {
        $: {
          'android:name': SCANNER_ACTIVITY,
          'tools:node': 'remove',
        },
      },
    ];
    return mod;
  });
